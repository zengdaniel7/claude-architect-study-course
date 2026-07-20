#!/usr/bin/env python3
"""Serve only the generated legacy asset archive for browser tests."""

from __future__ import annotations

import argparse
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from build_legacy_archive import build_archive, run_with_heartbeat


ROOT = Path(__file__).resolve().parents[1]
BLOCKED_NAMES = {".git", ".agents", ".claude", ".studio-data", "my-progress.json", "my-progress.backup.json"}


class ArchiveHandler(SimpleHTTPRequestHandler):
    def _blocked(self) -> bool:
        parts = [part for part in Path(unquote(urlsplit(self.path).path)).parts if part not in {"/", "\\"}]
        return any(part in BLOCKED_NAMES or part.startswith(".") or part.endswith(".tmp") for part in parts)

    def do_GET(self) -> None:
        if self._blocked():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        if self._blocked():
            self.send_error(404)
            return
        super().do_HEAD()

    def log_message(self, *_: object) -> None:
        return


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="ccaf-legacy-e2e-") as data:
        archive = Path(data) / "legacy"
        print("[legacy-e2e] Building the verified read-only archive...", flush=True)
        run_with_heartbeat("[legacy-e2e]", lambda: build_archive(ROOT, archive))
        print(f"[legacy-e2e] Archive ready on http://127.0.0.1:{args.port}", flush=True)
        handler = lambda *args_, **kwargs: ArchiveHandler(*args_, directory=str(archive), **kwargs)
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
        try:
            server.serve_forever()
        finally:
            server.server_close()


if __name__ == "__main__":
    main()
