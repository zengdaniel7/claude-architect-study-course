#!/usr/bin/env python3
"""Run an isolated Studio server for browser tests."""

from __future__ import annotations

import tempfile
from pathlib import Path

import uvicorn

from studio_server.app import create_app


ROOT = Path(__file__).resolve().parents[1]


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="ccaf-studio-e2e-") as data:
        app = create_app(ROOT, Path(data), ROOT / "studio" / "dist")
        uvicorn.run(app, host="127.0.0.1", port=8765, log_level="warning")
