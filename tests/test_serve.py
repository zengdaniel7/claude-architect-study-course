import http.client
import importlib.util
import json
import os
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ccaf_serve", ROOT / "serve.py")
serve = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(serve)


class ServeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_paths = (serve.SAVE, serve.BAK, serve.SAVE_LOCK)
        serve.SAVE = os.path.join(self.temp.name, "my-progress.json")
        serve.BAK = os.path.join(self.temp.name, "my-progress.backup.json")
        serve.SAVE_LOCK = threading.Lock()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), serve.Handler)
        self.server.access_token = None
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)
        serve.SAVE, serve.BAK, serve.SAVE_LOCK = self.old_paths
        self.temp.cleanup()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=4)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        payload = response.read()
        result = (response.status, dict(response.getheaders()), payload)
        connection.close()
        return result

    def post(self, payload, content_type="application/json"):
        body = json.dumps(payload).encode()
        return self.request("POST", "/__save", body, {"Content-Type": content_type})

    def test_valid_save_and_one_step_backup(self):
        first = {"ts": 1, "data": {"ccaf-curriculum": '{"done":{}}'}}
        second = {"ts": 2, "data": {"ccaf-curriculum": '{"done":{"w1":true}}'}}
        self.assertEqual(self.post(first)[0], 200)
        self.assertEqual(self.post(second)[0], 200)
        self.assertEqual(json.loads(Path(serve.SAVE).read_text()), second)
        self.assertEqual(json.loads(Path(serve.BAK).read_text()), first)
        self.assertFalse(list(Path(self.temp.name).glob("*.tmp")))

    def test_older_delayed_save_cannot_replace_newer_progress(self):
        newer = {"ts": 20, "data": {"ccaf-test": "newer"}}
        older = {"ts": 10, "data": {"ccaf-test": "older"}}
        self.assertEqual(self.post(newer)[0], 200)
        status, _, body = self.post(older)
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(body)["stored"])
        self.assertEqual(json.loads(Path(serve.SAVE).read_text()), newer)
        self.assertFalse(Path(serve.BAK).exists())

    def test_rejects_malformed_and_out_of_contract_saves(self):
        cases = [
            ({"ts": True, "data": {}}, 400),
            ({"ts": float("inf"), "data": {}}, 400),
            ({"ts": 1, "data": []}, 400),
            ({"ts": 1, "data": {"other": "value"}}, 400),
            ({"ts": 1, "data": {"ccaf-sync-ts": "1"}}, 400),
            ({"ts": 1, "data": {"ccaf-ok": {"nested": True}}}, 400),
        ]
        for payload, status in cases:
            with self.subTest(payload=payload):
                self.assertEqual(self.post(payload)[0], status)
        self.assertEqual(self.request("POST", "/__save", b"{", {"Content-Type": "application/json"})[0], 400)
        self.assertEqual(self.post({"ts": 1, "data": {}}, "text/plain")[0], 415)
        self.assertFalse(Path(serve.SAVE).exists())

    def test_size_limit_and_invalid_route(self):
        self.assertEqual(self.request("POST", "/not-save", b"{}", {"Content-Type": "application/json"})[0], 404)
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=4)
        try:
            connection.putrequest("POST", "/__save")
            connection.putheader("Content-Type", "application/json")
            connection.putheader("Content-Length", str(serve.MAX_BODY + 1))
            connection.endheaders()
            response = connection.getresponse()
            self.assertEqual(response.status, 413)
            response.read()
        finally:
            connection.close()

    def test_static_headers_and_private_paths(self):
        status, headers, _ = self.request("GET", "/dashboard.html")
        lowered = {key.lower(): value for key, value in headers.items()}
        self.assertEqual(status, 200)
        self.assertEqual(lowered.get("cache-control"), "no-cache")
        self.assertEqual(lowered.get("x-content-type-options"), "nosniff")
        self.assertEqual(lowered.get("referrer-policy"), "no-referrer")
        self.assertEqual(self.request("GET", "/.git/config")[0], 404)
        self.assertEqual(self.request("GET", "/my-progress.backup.json")[0], 404)

    def test_progress_is_never_cached_and_static_assets_can_revalidate(self):
        Path(serve.SAVE).write_text('{"ts":0,"data":{}}')
        status, headers, _ = self.request("GET", "/my-progress.json")
        self.assertEqual(status, 200)
        self.assertEqual(dict(headers).get("Cache-Control"), "no-store")
        status, headers, _ = self.request("GET", "/study.css")
        self.assertEqual(status, 200)
        self.assertEqual(dict(headers).get("Cache-Control"), "no-cache")

    def test_health_endpoint_identifies_the_quiet_saving_server(self):
        status, headers, body = self.request("GET", "/__health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"save": True})
        self.assertEqual(dict(headers).get("Cache-Control"), "no-store")

    def test_access_token_protects_remote_mode(self):
        self.server.access_token = "test-token"
        self.assertEqual(self.request("GET", "/dashboard.html")[0], 403)
        status, headers, _ = self.request("GET", "/dashboard.html?access=test-token")
        self.assertEqual(status, 200)
        cookie = dict(headers).get("Set-Cookie", "").split(";", 1)[0]
        body = json.dumps({"ts": 1, "data": {}}).encode()
        status, _, _ = self.request("POST", "/__save", body, {"Content-Type": "application/json", "Cookie": cookie})
        self.assertEqual(status, 200)

    def test_concurrent_saves_remain_valid(self):
        payloads = [{"ts": i, "data": {"ccaf-test": str(i)}} for i in range(1, 9)]
        with ThreadPoolExecutor(max_workers=8) as pool:
            statuses = list(pool.map(lambda payload: self.post(payload)[0], payloads))
        self.assertEqual(statuses, [200] * len(payloads))
        saved = json.loads(Path(serve.SAVE).read_text())
        backup = json.loads(Path(serve.BAK).read_text())
        self.assertIn(saved, payloads)
        self.assertEqual(saved["ts"], max(payload["ts"] for payload in payloads))
        self.assertIn(backup, payloads)
        self.assertNotEqual(saved, backup)


if __name__ == "__main__":
    unittest.main()
