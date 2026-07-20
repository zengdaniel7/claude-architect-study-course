#!/usr/bin/env python3
"""Run an isolated Studio server for browser tests."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from build_legacy_archive import build_archive, run_with_heartbeat
from studio_server.app import create_app


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="ccaf-studio-e2e-") as data:
        archive = Path(data) / "legacy"
        print("[studio-e2e] Building the verified archive and temporary database...", flush=True)
        run_with_heartbeat("[studio-e2e]", lambda: build_archive(ROOT, archive))
        app = create_app(archive, Path(data), ROOT / "studio" / "dist")
        port = int(os.environ.get("CCA_STUDIO_E2E_PORT", "8765"))
        print(f"[studio-e2e] Temporary Studio ready on http://127.0.0.1:{port}", flush=True)
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
