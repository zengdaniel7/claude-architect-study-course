#!/usr/bin/env python3
"""Serve the CCA-F study course AND auto-save progress to a real file.

    python3 serve.py                        -> http://localhost:8000
    python3 serve.py 8010                   -> custom port
    python3 serve.py 8000 192.168.1.100     -> custom local address

Every tick/answer you make on the site is mirrored into my-progress.json
(in this folder) within half a second, and restored automatically if the
browser's copy is ever missing or older — so clearing browser data, switching
browsers, or reinstalling can't lose your progress.

Plain `python3 -m http.server` still works, but then progress lives only in
the browser. By default this server only listens on 127.0.0.1 (your machine,
not the network) and only accepts one kind of write: the progress snapshot.
An optional address is available for embedded browsers that cannot reach the
host machine through their own localhost.
"""
import hmac, json, math, os, re, secrets, shutil, sys, threading
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))
SAVE = os.path.join(ROOT, "my-progress.json")
BAK  = os.path.join(ROOT, "my-progress.backup.json")
SAVE_LOCK = threading.Lock()
MAX_BODY = 2_000_000
MAX_KEYS = 1000
MAX_KEY = 128
MAX_VALUE = 1_000_000
MAX_TOTAL = 1_800_000
KEY_RE = re.compile(r"^ccaf-[A-Za-z0-9][A-Za-z0-9._-]*$")


def validate_progress(payload):
    if type(payload) is not dict:
        return False
    timestamp = payload.get("ts")
    data = payload.get("data")
    if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)):
        return False
    if not math.isfinite(timestamp) or timestamp < 0 or type(data) is not dict:
        return False
    if len(data) > MAX_KEYS:
        return False
    total = 0
    for key, value in data.items():
        if not isinstance(key, str) or len(key) > MAX_KEY or not KEY_RE.fullmatch(key) or key == "ccaf-sync-ts":
            return False
        if not isinstance(value, str) or len(value) > MAX_VALUE:
            return False
        total += len(key) + len(value)
        if total > MAX_TOTAL:
            return False
    return True


def write_progress(payload):
    tmp = f"{SAVE}.{os.getpid()}.{threading.get_ident()}.tmp"
    backup_tmp = f"{BAK}.{os.getpid()}.{threading.get_ident()}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=1)
            handle.flush()
            os.fsync(handle.fileno())
        with SAVE_LOCK:
            current_timestamp = -1
            if os.path.exists(SAVE):
                try:
                    with open(SAVE, encoding="utf-8") as handle:
                        current = json.load(handle)
                    if validate_progress(current):
                        current_timestamp = current["ts"]
                except (OSError, ValueError):
                    pass
            if payload["ts"] <= current_timestamp:
                return False, current_timestamp
            if os.path.exists(SAVE):
                shutil.copyfile(SAVE, backup_tmp)
                with open(backup_tmp, "rb") as handle:
                    os.fsync(handle.fileno())
                os.replace(backup_tmp, BAK)
            os.replace(tmp, SAVE)
            return True, payload["ts"]
    finally:
        for path in (tmp, backup_tmp):
            try:
                os.remove(path)
            except FileNotFoundError:
                pass

class Handler(SimpleHTTPRequestHandler):
    def _host_allowed(self):
        try:
            raw = self.headers.get("Host", "")
            parsed = urlsplit(f"http://{raw}")
            host = (parsed.hostname or "").lower()
        except ValueError:
            return False
        allowed = getattr(self.server, "allowed_hosts", {"localhost", "127.0.0.1", "::1"})
        return host in allowed

    def _origin_allowed(self):
        origin = self.headers.get("Origin")
        if not origin:
            return True
        try:
            parsed_origin = urlsplit(origin)
            parsed_host = urlsplit(f"http://{self.headers.get('Host', '')}")
            return (
                parsed_origin.scheme == "http"
                and parsed_origin.hostname == parsed_host.hostname
                and (parsed_origin.port or 80) == (parsed_host.port or 80)
            )
        except ValueError:
            return False

    def _send_progress(self, include_body=True):
        try:
            with open(SAVE, "rb") as handle:
                response = handle.read(MAX_BODY + 1)
        except FileNotFoundError:
            self.send_error(404); return
        except OSError:
            self.send_error(500); return
        if len(response) > MAX_BODY:
            self.send_error(413); return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        if include_body:
            self.wfile.write(response)

    def _private_path(self):
        path = unquote(urlsplit(self.path).path)
        parts = [part for part in path.split("/") if part]
        blocked = {".git", ".agents", ".claude", ".studio-data", "my-progress.backup.json", "my-progress.json.tmp"}
        return any(part.startswith(".") or part in blocked or part.endswith(".tmp") for part in parts)

    def _authorized(self):
        token = getattr(self.server, "access_token", None)
        if not token:
            return True

        query_token = parse_qs(urlsplit(self.path).query).get("access", [""])[0]
        if query_token and hmac.compare_digest(query_token, token):
            self._access_cookie = query_token
            return True

        try:
            cookie = SimpleCookie(self.headers.get("Cookie", ""))
            cookie_token = cookie.get("cca_access")
            return bool(cookie_token and hmac.compare_digest(cookie_token.value, token))
        except Exception:
            return False

    def do_GET(self):
        if not self._host_allowed():
            self.send_error(403); return
        if not self._authorized():
            self.send_error(403); return
        path = urlsplit(self.path).path
        if path == "/my-progress.json":
            self._send_progress(); return
        if path == "/__health":
            response = b'{"save":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
            return
        if self._private_path():
            self.send_error(404); return
        super().do_GET()

    def do_HEAD(self):
        if not self._host_allowed():
            self.send_error(403); return
        if not self._authorized():
            self.send_error(403); return
        if urlsplit(self.path).path == "/my-progress.json":
            self._send_progress(include_body=False); return
        if self._private_path():
            self.send_error(404); return
        super().do_HEAD()

    def do_POST(self):
        if not self._host_allowed() or not self._origin_allowed():
            self.send_error(403); return
        if not self._authorized():
            self.send_error(403); return
        if self.path.split("?")[0] != "/__save":
            self.send_error(404); return
        try:
            n = int(self.headers.get("Content-Length", 0))
            if not 0 < n <= MAX_BODY:
                self.send_error(413); return
            if self.headers.get_content_type() != "application/json":
                self.send_error(415); return
            data = json.loads(self.rfile.read(n))
            if not validate_progress(data):
                self.send_error(400); return
            stored, timestamp = write_progress(data)
            response = json.dumps({"ok": True, "stored": stored, "ts": timestamp}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
        except Exception:
            self.send_error(400)

    def end_headers(self):
        if hasattr(self, "_access_cookie"):
            self.send_header(
                "Set-Cookie",
                f"cca_access={self._access_cookie}; HttpOnly; SameSite=Strict; Path=/",
            )
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        # Revalidate course files instead of downloading every asset again on
        # every page. Progress stays private and is never cached.
        path = self.path.split("?")[0]
        if path in {"/my-progress.json", "/my-progress.backup.json", "/__save", "/__health"}:
            self.send_header("Cache-Control", "no-store")
        elif path.endswith((".html", ".js", ".css", ".json")):
            self.send_header("Cache-Control", "no-cache")
        elif path.endswith((".woff", ".woff2", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp3", ".wav")):
            self.send_header("Cache-Control", "public, max-age=3600")
        SimpleHTTPRequestHandler.end_headers(self)

    def log_message(self, *args):
        pass  # keep the terminal quiet

if __name__ == "__main__":
    os.chdir(ROOT)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    display_host = "localhost" if host == "127.0.0.1" else host
    access_token = None if host in {"127.0.0.1", "::1", "localhost"} else secrets.token_urlsafe(32)
    access_query = f"?access={access_token}" if access_token else ""
    print(
        f"📚 CCA-F course: http://{display_host}:{port}/today.html{access_query}  "
        "(progress auto-saves to my-progress.json — Ctrl-C to stop)",
        flush=True,
    )
    server = ThreadingHTTPServer((host, port), Handler)
    server.access_token = access_token
    server.allowed_hosts = {"localhost", "127.0.0.1", "::1", host.lower(), display_host.lower()}
    server.serve_forever()
