#!/usr/bin/env python3
"""Build the explicitly allowlisted legacy asset archive for local Studio use."""

from __future__ import annotations

import shutil
import sys
import threading
from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from studio_server.legacy_assets import LEGACY_ASSETS, PRIVATE_IMPORT, verify_archive  # noqa: E402


T = TypeVar("T")


def run_with_heartbeat(
    label: str,
    operation: Callable[[], T],
    *,
    interval_seconds: float = 20.0,
) -> T:
    """Keep long setup work visibly alive without changing the operation."""
    stopped = threading.Event()

    def report() -> None:
        while not stopped.wait(interval_seconds):
            print(f"{label} Still working...", flush=True)

    reporter = threading.Thread(target=report, name="ccaf-progress-heartbeat", daemon=True)
    reporter.start()
    try:
        return operation()
    finally:
        stopped.set()
        reporter.join(timeout=1.0)


def build_archive(source: Path, destination: Path) -> None:
    source = source.resolve()
    destination = destination.resolve()
    destination.mkdir(parents=True, exist_ok=True)
    destination.chmod(0o700)
    for relative in sorted(LEGACY_ASSETS):
        source_path = source / relative
        if not source_path.is_file() or source_path.is_symlink():
            raise FileNotFoundError(f"Allowlisted legacy asset is missing: {source_path}")
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_path, target)
    progress = source / PRIVATE_IMPORT
    if progress.is_file() and not progress.is_symlink():
        private_import = destination / PRIVATE_IMPORT
        shutil.copyfile(progress, private_import)
        private_import.chmod(0o600)
    verify_archive(destination)
