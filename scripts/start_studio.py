#!/usr/bin/env python3
"""Prepare and launch Study Studio from fast, Mac-local runtime folders."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from build_legacy_archive import build_archive, verify_archive
from release_identity import backend_content_hash, verify_release


ROOT = Path(__file__).resolve().parents[1]
CACHE = Path.home() / "Library" / "Caches" / "CCA-F Study Studio"
DATA = Path.home() / "Library" / "Application Support" / "CCA-F Study Studio"
VENV = CACHE / "runtime"
SITE = CACHE / "site"
APP = CACHE / "app"
ARCHIVE = CACHE / "legacy"
REQUIREMENTS = ROOT / "requirements.txt"
APP_SIGNATURE = ".app-signature"


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


def app_content_hash(root: Path) -> str:
    if not root.is_dir() or root.is_symlink():
        raise ValueError("Cached Studio app is missing or is not a regular directory")
    files: list[Path] = []
    for item in root.rglob("*"):
        if item.is_symlink():
            raise ValueError(f"Cached Studio app contains a symlink: {item.relative_to(root)}")
        if not item.is_file() or item.name == APP_SIGNATURE or "__pycache__" in item.parts or item.suffix == ".pyc":
            continue
        files.append(item)
    value = hashlib.sha256()
    for item in sorted(files, key=lambda path: path.relative_to(root).as_posix()):
        value.update(item.relative_to(root).as_posix().encode("utf-8"))
        value.update(b"\0")
        value.update(hashlib.sha256(item.read_bytes()).digest())
    return value.hexdigest()


def verify_app_cache(root: Path, expected_backend_hash: str) -> dict[str, str]:
    marker = root / APP_SIGNATURE
    try:
        descriptor = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ValueError("Cached Studio app identity is missing or malformed") from error
    if not isinstance(descriptor, dict) or descriptor.get("backendContentSha256") != expected_backend_hash:
        raise ValueError("Cached Studio backend identity does not match the release")
    actual = app_content_hash(root)
    if descriptor.get("appContentSha256") != actual:
        raise ValueError("Cached Studio app file hash does not match its identity")
    return {"backendContentSha256": expected_backend_hash, "appContentSha256": actual}


def replace_tree(temporary: Path, target: Path, verifier=None) -> None:
    """Promote a verified staged directory while retaining the prior release."""
    if verifier is not None:
        verifier(temporary)
    previous = target.with_name(f"{target.name}.previous")
    older_previous = target.with_name(f"{target.name}.previous.old")
    shutil.rmtree(older_previous, ignore_errors=True)
    if previous.exists():
        previous.rename(older_previous)
    moved_previous = False
    promoted = False
    try:
        if target.exists():
            target.rename(previous)
            moved_previous = True
        temporary.rename(target)
        promoted = True
        if verifier is not None:
            verifier(target)
    except Exception:
        if promoted and target.exists():
            shutil.rmtree(target, ignore_errors=True)
        if not target.exists() and previous.exists():
            previous.rename(target)
        if older_previous.exists() and not previous.exists():
            older_previous.rename(previous)
        raise
    shutil.rmtree(older_previous, ignore_errors=True)


def ensure_runtime() -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    CACHE.chmod(0o700)
    DATA.chmod(0o700)
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


def sync_site(source: Path | None = None, target: Path | None = None) -> dict[str, object]:
    source = (source or ROOT / "studio" / "dist").resolve()
    target = (target or SITE).resolve()
    if not (source / "index.html").is_file():
        raise SystemExit("The Studio build is missing. Run `pnpm run studio:build` once, then launch again.")
    try:
        source_release = verify_release(source, ROOT)
    except ValueError as error:
        raise SystemExit(f"Studio build identity is invalid: {error}") from error
    source_id = str(source_release["releaseId"])
    try:
        current_release = verify_release(target, ROOT)
    except ValueError:
        current_release = None
    if current_release and current_release.get("releaseId") == source_id:
        return current_release
    temporary = CACHE / f"site-{os.getpid()}.tmp"
    shutil.rmtree(temporary, ignore_errors=True)
    try:
        shutil.copytree(source, temporary)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    replace_tree(temporary, target, verifier=lambda path: verify_release(path, ROOT))
    return source_release


def sync_app(root: Path | None = None, target: Path | None = None, cache: Path | None = None) -> None:
    root = (root or ROOT).resolve()
    target = (target or APP).resolve()
    cache = (cache or CACHE).resolve()
    server = root / "studio_server"
    runner = root / "scripts" / "run_studio_runtime.py"
    manifest = root / "studio" / "src" / "content" / "course-manifest.json"
    source_hash = backend_content_hash(root)
    try:
        verify_app_cache(target, source_hash)
        return
    except ValueError:
        pass
    cache.mkdir(parents=True, exist_ok=True)
    temporary = cache / f"app-{os.getpid()}.tmp"
    shutil.rmtree(temporary, ignore_errors=True)
    try:
        shutil.copytree(server, temporary / "studio_server", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        target_manifest = temporary / "studio" / "src" / "content" / "course-manifest.json"
        target_manifest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(manifest, target_manifest)
        shutil.copy2(runner, temporary / "run_studio_runtime.py")
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    signature = {
        "backendContentSha256": source_hash,
        "appContentSha256": app_content_hash(temporary),
    }
    (temporary / APP_SIGNATURE).write_text(json.dumps(signature, sort_keys=True), encoding="utf-8")
    replace_tree(temporary, target, verifier=lambda path: verify_app_cache(path, source_hash))


def sync_archive() -> None:
    temporary = CACHE / f"legacy-{os.getpid()}.tmp"
    shutil.rmtree(temporary, ignore_errors=True)
    try:
        build_archive(ROOT, temporary)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    replace_tree(temporary, ARCHIVE, verifier=verify_archive)


def main() -> None:
    runtime_python = ensure_runtime()
    sync_app()
    sync_archive()
    release = sync_site()
    try:
        verify_app_cache(APP, str(release["backendContentSha256"]))
    except ValueError as error:
        raise SystemExit("Cached Study Studio app identity does not match the verified release. Rebuild the cache and retry.")
    environment = os.environ.copy()
    environment.update({
        "CCA_STUDIO_SOURCE_ROOT": str(ARCHIVE),
        "CCA_STUDIO_APP_DIR": str(APP),
        "CCA_STUDIO_DATA_DIR": str(DATA),
        "CCA_STUDIO_DIST_DIR": str(SITE),
        "CCA_STUDIO_RELEASE_ID": str(release["releaseId"]),
        "CCA_STUDIO_APP_ID": str(release["appId"]),
        "CCA_STUDIO_MANIFEST_HASH": str(release["manifestHash"]),
        "CCA_STUDIO_BACKEND_HASH": str(release["backendContentSha256"]),
    })
    os.execve(
        str(runtime_python),
        [str(runtime_python), str(APP / "run_studio_runtime.py"), *sys.argv[1:]],
        environment,
    )


if __name__ == "__main__":
    main()
