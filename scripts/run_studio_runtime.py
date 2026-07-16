#!/usr/bin/env python3
"""Cached runtime entry point. Use start_studio.py instead of calling directly."""

from __future__ import annotations

import argparse
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path


def port_available(port: int) -> bool:
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def health_ok(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/__health", timeout=0.5) as response:
            return response.status == 200
    except OSError:
        return False


def open_when_ready(url: str, port: int) -> None:
    for _ in range(40):
        if health_ok(port):
            webbrowser.open(url)
            return
        time.sleep(0.1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch CCA-F Study Studio")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args()

    if not port_available(args.port):
        if health_ok(args.port):
            url = f"http://127.0.0.1:{args.port}/"
            print(f"Study Studio is already running: {url}")
            if not args.no_open:
                webbrowser.open(url)
            return
        raise SystemExit(f"Port {args.port} is busy. Try --port {args.port + 1}.")

    source = Path(os.environ["CCA_STUDIO_SOURCE_ROOT"])
    app_dir = Path(os.environ["CCA_STUDIO_APP_DIR"])
    data = Path(os.environ["CCA_STUDIO_DATA_DIR"])
    site = Path(os.environ["CCA_STUDIO_DIST_DIR"])
    sys.path.insert(0, str(app_dir))

    from studio_server.app import create_app
    import uvicorn

    url = f"http://127.0.0.1:{args.port}/"
    print(f"CCA-F Study Studio: {url}", flush=True)
    print("Progress is stored privately in macOS Application Support. Press Control-C to stop.", flush=True)
    if not args.no_open:
        threading.Thread(target=open_when_ready, args=(url, args.port), daemon=True).start()
    uvicorn.run(create_app(source, data, site), host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
