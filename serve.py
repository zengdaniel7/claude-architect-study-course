#!/usr/bin/env python3
"""Serve the CCA-F study course AND auto-save progress to a real file.

    python3 serve.py          -> http://localhost:8000
    python3 serve.py 8010     -> custom port

Every tick/answer you make on the site is mirrored into my-progress.json
(in this folder) within half a second, and restored automatically if the
browser's copy is ever missing or older — so clearing browser data, switching
browsers, or reinstalling can't lose your progress.

Plain `python3 -m http.server` still works, but then progress lives only in
the browser. This server only listens on 127.0.0.1 (your machine, not the
network) and only accepts one kind of write: the progress snapshot.
"""
import json, os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
SAVE = os.path.join(ROOT, "my-progress.json")
BAK  = os.path.join(ROOT, "my-progress.backup.json")

class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
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
        # progress file must never be cached by the browser
        if self.path.split("?")[0].endswith("my-progress.json"):
            self.send_header("Cache-Control", "no-store")
        SimpleHTTPRequestHandler.end_headers(self)

    def log_message(self, *args):
        pass  # keep the terminal quiet

if __name__ == "__main__":
    os.chdir(ROOT)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"📚 CCA-F course: http://localhost:{port}  (progress auto-saves to my-progress.json — Ctrl-C to stop)")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
