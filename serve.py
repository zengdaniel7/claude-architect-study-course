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
import hmac, json, os, secrets, sys
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))
SAVE = os.path.join(ROOT, "my-progress.json")
BAK  = os.path.join(ROOT, "my-progress.backup.json")

class Handler(SimpleHTTPRequestHandler):
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
        if not self._authorized():
            self.send_error(403); return
        super().do_GET()

    def do_HEAD(self):
        if not self._authorized():
            self.send_error(403); return
        super().do_HEAD()

    def do_POST(self):
        if not self._authorized():
            self.send_error(403); return
        if self.path.split("?")[0] != "/__save":
            self.send_error(404); return
        try:
            n = int(self.headers.get("Content-Length", 0))
            if not 0 < n <= 2_000_000:
                self.send_error(413); return
            data = json.loads(self.rfile.read(n))
            if not (isinstance(data.get("ts"), (int, float)) and isinstance(data.get("data"), dict)):
                self.send_error(400); return
            # keep the previous save as a one-step backup, write atomically
            if os.path.exists(SAVE):
                os.replace(SAVE, BAK)
            tmp = SAVE + ".tmp"
            with open(tmp, "w") as f:
                json.dump(data, f, indent=1)
            os.replace(tmp, SAVE)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
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
        # Local study pages change frequently; embedded previews must not keep
        # a stale script after a repair or progress migration.
        path = self.path.split("?")[0]
        if path.endswith((".html", ".js", ".css", ".json")):
            self.send_header("Cache-Control", "no-store")
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
    server.serve_forever()
