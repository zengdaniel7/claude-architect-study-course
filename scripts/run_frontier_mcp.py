#!/usr/bin/env python3
"""Launch the HTTP-only Study Studio stdio MCP bridge.

This process never starts Study Studio and never opens its database. The MCP
tools return a clear unavailable response until the learner has launched the
local app and its supervisor endpoint is healthy.
"""

from __future__ import annotations

import os
import sys

from start_studio import APP, DATA, REQUIREMENTS, VENV, file_digest, sync_app


def fail(message: str) -> int:
    print(message, file=sys.stderr, flush=True)
    return 2


def main() -> int:
    runtime = VENV / "bin" / "python"
    marker = VENV / ".requirements-sha256"
    expected = file_digest(REQUIREMENTS)
    installed = marker.read_text(encoding="utf-8").strip() if marker.is_file() else ""
    if not runtime.is_file() or installed != expected:
        return fail("Study Studio runtime is not ready. Launch 'Start CCA-F Study Studio.command' once, then reconnect the MCP server.")

    # Refresh only the packaged Python module. sync_app copies source files;
    # it does not import the app or open the learner database.
    try:
        sync_app()
    except OSError as error:
        return fail(f"Could not refresh the Study Studio MCP bridge: {error}")

    environment = os.environ.copy()
    existing_path = environment.get("PYTHONPATH")
    environment["PYTHONPATH"] = str(APP) if not existing_path else f"{APP}{os.pathsep}{existing_path}"
    environment.setdefault("CCA_STUDIO_SERVER_URL", "http://127.0.0.1:8765")
    environment["CCA_STUDIO_DATA_DIR"] = str(DATA)
    os.execve(
        str(runtime),
        [str(runtime), "-m", "studio_server.mcp_server"],
        environment,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
