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

from studio_server.app import create_app


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="ccaf-studio-e2e-") as data:
        app = create_app(ROOT, Path(data), ROOT / "studio" / "dist")
        port = int(os.environ.get("CCA_STUDIO_E2E_PORT", "8765"))
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
