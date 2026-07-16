#!/usr/bin/env python3
"""Prepare and launch Study Studio from fast, Mac-local runtime folders."""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CACHE = Path.home() / "Library" / "Caches" / "CCA-F Study Studio"
DATA = Path.home() / "Library" / "Application Support" / "CCA-F Study Studio"
VENV = CACHE / "runtime"
SITE = CACHE / "site"
APP = CACHE / "app"
REQUIREMENTS = ROOT / "requirements.txt"


def python_version(executable: Path) -> tuple[int, int] | None:
    try:
        result = subprocess.run(
            [str(executable), "-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"],
            check=True,
            capture_output=True,
            text=True,
            timeout=3,
        )
        major, minor = result.stdout.strip().split(".", 1)
        return int(major), int(minor)
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def find_base_python() -> Path:
    candidates: list[Path] = []
    if os.environ.get("CCA_STUDIO_PYTHON"):
        candidates.append(Path(os.environ["CCA_STUDIO_PYTHON"]).expanduser())
    candidates.append(Path(sys.executable))
    candidates.extend(sorted((Path.home() / ".cache" / "codex-runtimes").glob("*/dependencies/python/bin/python3"), reverse=True))
    candidates.extend([Path("/opt/homebrew/bin/python3"), Path("/usr/local/bin/python3")])
    checked: set[Path] = set()
    for candidate in candidates:
        resolved = candidate.resolve() if candidate.exists() else candidate
        if resolved in checked:
            continue
        checked.add(resolved)
        version = python_version(candidate)
        if version is not None and version >= (3, 11):
            return candidate
    raise SystemExit("Study Studio needs Python 3.11 or newer. Open it from Codex, or install a current Python from python.org.")


def file_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def metadata_digest(root: Path, files: list[Path]) -> str:
    value = hashlib.sha256()
    for item in sorted(files):
        stat = item.stat()
        value.update(str(item.relative_to(root)).encode("utf-8"))
        value.update(f"{stat.st_size}:{stat.st_mtime_ns}".encode("ascii"))
    return value.hexdigest()


def replace_tree(temporary: Path, target: Path) -> None:
    previous = target.with_name(f"{target.name}.previous")
    shutil.rmtree(previous, ignore_errors=True)
    if target.exists():
        target.rename(previous)
    temporary.rename(target)
    shutil.rmtree(previous, ignore_errors=True)


def ensure_runtime() -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    runtime_python = VENV / "bin" / "python"
    marker = VENV / ".requirements-sha256"
    base_marker = VENV / ".base-python"
    base_python = find_base_python()
    base_identity = f"{base_python.resolve()}:{python_version(base_python)}"
    required = file_digest(REQUIREMENTS)
    existing_base = base_marker.read_text(encoding="utf-8").strip() if base_marker.is_file() else ""
    if not runtime_python.is_file() or existing_base != base_identity:
        print("Preparing the local Study Studio runtime once...", flush=True)
        shutil.rmtree(VENV, ignore_errors=True)
        subprocess.run([str(base_python), "-m", "venv", str(VENV)], check=True)
        base_marker.write_text(base_identity, encoding="utf-8")
    installed = marker.read_text(encoding="utf-8").strip() if marker.is_file() else ""
    if installed != required:
        subprocess.run(
            [str(runtime_python), "-m", "pip", "install", "--disable-pip-version-check", "-r", str(REQUIREMENTS)],
            check=True,
        )
        marker.write_text(required, encoding="utf-8")
    return runtime_python


def sync_site() -> None:
    source = ROOT / "studio" / "dist"
    files = [item for item in source.rglob("*") if item.is_file()]
    if not (source / "index.html").is_file():
        raise SystemExit("The Studio build is missing. Run `pnpm run studio:build` once, then launch again.")
    source_hash = metadata_digest(source, files)
    marker = SITE / ".site-signature"
    if marker.is_file() and marker.read_text(encoding="utf-8").strip() == source_hash:
        return
    temporary = CACHE / f"site-{os.getpid()}.tmp"
    shutil.rmtree(temporary, ignore_errors=True)
    shutil.copytree(source, temporary)
    (temporary / ".site-signature").write_text(source_hash, encoding="utf-8")
    replace_tree(temporary, SITE)


def sync_app() -> None:
    server = ROOT / "studio_server"
    runner = ROOT / "scripts" / "run_studio_runtime.py"
    manifest = ROOT / "studio" / "src" / "content" / "course-manifest.json"
    files = [item for item in server.rglob("*.py") if "__pycache__" not in item.parts] + [runner, manifest]
    source_hash = metadata_digest(ROOT, files)
    marker = APP / ".app-signature"
    if marker.is_file() and marker.read_text(encoding="utf-8").strip() == source_hash:
        return
    temporary = CACHE / f"app-{os.getpid()}.tmp"
    shutil.rmtree(temporary, ignore_errors=True)
    shutil.copytree(server, temporary / "studio_server", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    target_manifest = temporary / "studio" / "src" / "content" / "course-manifest.json"
    target_manifest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(manifest, target_manifest)
    shutil.copy2(runner, temporary / "run_studio_runtime.py")
    (temporary / ".app-signature").write_text(source_hash, encoding="utf-8")
    replace_tree(temporary, APP)


def main() -> None:
    runtime_python = ensure_runtime()
    sync_app()
    sync_site()
    environment = os.environ.copy()
    environment.update({
        "CCA_STUDIO_SOURCE_ROOT": str(ROOT),
        "CCA_STUDIO_APP_DIR": str(APP),
        "CCA_STUDIO_DATA_DIR": str(DATA),
        "CCA_STUDIO_DIST_DIR": str(SITE),
    })
    os.execve(
        str(runtime_python),
        [str(runtime_python), str(APP / "run_studio_runtime.py"), *sys.argv[1:]],
        environment,
    )


if __name__ == "__main__":
    main()
