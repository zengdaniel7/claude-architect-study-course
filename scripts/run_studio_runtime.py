#!/usr/bin/env python3
"""Cached runtime entry point. Use start_studio.py instead of calling directly."""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path
from urllib.parse import urlsplit


def port_available(port: int) -> bool:
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def _json_response(url: str) -> dict[str, object] | None:
    try:
        with urllib.request.urlopen(url, timeout=0.5) as response:
            if response.status != 200:
                return None
            payload = json.loads(response.read().decode("utf-8"))
            return payload if isinstance(payload, dict) else None
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None


def health_ok(
    port: int,
    expected_release_id: str | None = None,
    expected_manifest_hash: str | None = None,
    expected_backend_hash: str | None = None,
) -> bool:
    payload = _json_response(f"http://127.0.0.1:{port}/__health")
    if not payload or not all(payload.get(key) is True for key in ("ok", "sqlite", "save")):
        return False
    expected_fields = {
        "appId": os.environ.get("CCA_STUDIO_APP_ID"),
        "releaseId": expected_release_id,
        "manifestHash": expected_manifest_hash,
        "backendContentSha256": expected_backend_hash,
    }
    if payload.get("schemaVersion") not in {None, 3}:
        return False
    if any(expected is not None and payload.get(field) != expected for field, expected in expected_fields.items()):
        return False
    if expected_release_id is None:
        return True
    release = _json_response(f"http://127.0.0.1:{port}/release.json")
    return bool(
        release
        and all(
            expected is None or release.get(field) == expected
            for field, expected in expected_fields.items()
        )
    )


def open_when_ready(
    url: str,
    port: int,
    expected_release_id: str | None = None,
    expected_manifest_hash: str | None = None,
    expected_backend_hash: str | None = None,
) -> None:
    for _ in range(40):
        if health_ok(port, expected_release_id, expected_manifest_hash, expected_backend_hash):
            webbrowser.open(url)
            return
        time.sleep(0.1)


def recovery_app(app_id: str, release_id: str):
    """Return a read-only local screen when the authoritative store is locked."""
    from fastapi import FastAPI, Request
    from fastapi.responses import HTMLResponse, JSONResponse

    allowed_hosts = {"localhost", "127.0.0.1", "::1"}
    app = FastAPI(title="CCA-F Study Studio recovery", docs_url=None, redoc_url=None)

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        host = request.headers.get("host", "")
        try:
            hostname = (urlsplit(f"http://{host}").hostname or "").lower()
        except ValueError:
            hostname = ""
        if hostname not in allowed_hosts:
            return JSONResponse({"detail": "Local requests only"}, status_code=403)
        origin = request.headers.get("origin")
        if origin:
            try:
                origin_host = (urlsplit(origin).hostname or "").lower()
            except ValueError:
                origin_host = ""
            if origin_host not in allowed_hosts or origin_host != hostname:
                return JSONResponse({"detail": "Local requests only"}, status_code=403)
        return await call_next(request)

    @app.get("/__health")
    def recovery_health() -> dict[str, object]:
        return {
            "ok": False,
            "appId": app_id,
            "releaseId": release_id,
            "status": "recovery_required",
        }

    @app.get("/{path:path}", response_class=HTMLResponse)
    def recovery_screen(path: str = "") -> str:
        return """<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CCA-F Study Studio recovery</title>
<body style="font:20px/1.5 system-ui,sans-serif;max-width:42rem;margin:12vh auto;padding:0 1.25rem;color:#202124">
<main><h1>Study Studio recovery required</h1>
<p>Normal Study Studio is blocked because local progress storage could not be opened safely.</p>
<p>Recovery copies and backups were preserved. Restore a known-good copy, then restart Study Studio.</p>
<p>No learning data was changed by this recovery screen.</p></main>
</body></html>"""

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch CCA-F Study Studio")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args()
    expected_release_id = os.environ.get("CCA_STUDIO_RELEASE_ID")
    expected_app_id = os.environ.get("CCA_STUDIO_APP_ID")
    expected_manifest_hash = os.environ.get("CCA_STUDIO_MANIFEST_HASH")
    expected_backend_hash = os.environ.get("CCA_STUDIO_BACKEND_HASH")
    if not expected_app_id or not expected_release_id or not expected_manifest_hash or not expected_backend_hash:
        raise SystemExit("Studio release identity is missing. Rebuild the Studio before launching.")

    if not port_available(args.port):
        if health_ok(args.port, expected_release_id, expected_manifest_hash, expected_backend_hash):
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
        threading.Thread(
            target=open_when_ready,
            args=(url, args.port, expected_release_id, expected_manifest_hash, expected_backend_hash),
            daemon=True,
        ).start()
    try:
        application = create_app(source, data, site)
    except RuntimeError:
        print("Study Studio entered local recovery mode because storage could not be opened safely.", file=sys.stderr, flush=True)
        application = recovery_app(os.environ["CCA_STUDIO_APP_ID"], expected_release_id)
    uvicorn.run(application, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
