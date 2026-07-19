#!/usr/bin/env python3
"""Generate and verify the content identity for a built Studio site."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
from typing import Any


RELEASE_NAME = "release.json"
APP_ID = "ccaf-study-studio"
SUPPORTED_SCHEMA_MIN = 3
SUPPORTED_SCHEMA_MAX = 3
MANIFEST_RELATIVE = Path("studio/src/content/course-manifest.json")
REQUIREMENTS_RELATIVE = Path("requirements.txt")
REPO_ROOT = Path(__file__).resolve().parents[1]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _backend_files(root: Path) -> list[Path]:
    server = root / "studio_server"
    files = [item for item in server.rglob("*.py") if "__pycache__" not in item.parts]
    files.extend([root / "scripts" / "run_studio_runtime.py", root / MANIFEST_RELATIVE, root / REQUIREMENTS_RELATIVE])
    return sorted(files, key=lambda item: item.relative_to(root).as_posix())


def backend_content_hash(root: Path = REPO_ROOT) -> str:
    root = root.resolve()
    value = hashlib.sha256()
    for item in _backend_files(root):
        if not item.is_file():
            raise ValueError(f"Backend release input is missing: {item}")
        value.update(item.relative_to(root).as_posix().encode("utf-8"))
        value.update(b"\0")
        value.update(bytes.fromhex(_sha256(item)))
    return value.hexdigest()


def manifest_hash(root: Path = REPO_ROOT) -> str:
    manifest = root.resolve() / MANIFEST_RELATIVE
    if not manifest.is_file():
        raise ValueError(f"Protected course manifest is missing: {manifest}")
    return _sha256(manifest)


def release_id(frontend_hash: str, backend_hash: str, protected_manifest_hash: str) -> str:
    value = f"frontend:{frontend_hash}\0backend:{backend_hash}\0manifest:{protected_manifest_hash}".encode("utf-8")
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def _relative_files(dist: Path) -> list[Path]:
    return sorted(
        (
            item
            for item in dist.rglob("*")
            if item.is_file()
            and item.name != RELEASE_NAME
            and not item.name.startswith(f".{RELEASE_NAME}.")
        ),
        key=lambda item: item.relative_to(dist).as_posix(),
    )


def _entries(dist: Path) -> list[dict[str, Any]]:
    entries = []
    for path in _relative_files(dist):
        if path.is_symlink():
            raise ValueError(f"Release cannot contain symlinks: {path.relative_to(dist)}")
        relative = path.relative_to(dist).as_posix()
        entries.append({"path": relative, "bytes": path.stat().st_size, "sha256": _sha256(path)})
    return entries


def tree_hash(entries: list[dict[str, Any]]) -> str:
    encoded = "".join(
        f"{entry['path']}\0{entry['bytes']}\0{entry['sha256']}\n" for entry in entries
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def release_document(dist: Path, root: Path = REPO_ROOT) -> dict[str, Any]:
    entries = _entries(dist)
    frontend_hash = tree_hash(entries)
    protected_manifest_hash = manifest_hash(root)
    backend_hash = backend_content_hash(root)
    return {
        "schema": SUPPORTED_SCHEMA_MAX,
        "kind": "cca-f-study-studio",
        "appId": APP_ID,
        "releaseId": release_id(frontend_hash, backend_hash, protected_manifest_hash),
        "frontendContentSha256": frontend_hash,
        "contentSha256": frontend_hash,
        "manifestHash": protected_manifest_hash,
        "backendContentSha256": backend_hash,
        "supportedSchemaMin": SUPPORTED_SCHEMA_MIN,
        "supportedSchemaMax": SUPPORTED_SCHEMA_MAX,
        "files": entries,
    }


def write_release(dist: Path, root: Path = REPO_ROOT) -> dict[str, Any]:
    dist = dist.resolve()
    if not (dist / "index.html").is_file():
        raise ValueError(f"Studio build is missing {dist / 'index.html'}")
    document = release_document(dist, root)
    temporary = dist / f".{RELEASE_NAME}.{os.getpid()}.tmp"
    temporary.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, dist / RELEASE_NAME)
    return document


def read_release(dist: Path) -> dict[str, Any]:
    path = dist / RELEASE_NAME
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f"Cannot read {path}: {error}") from error
    if not isinstance(document, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return document


def verify_release(dist: Path, root: Path = REPO_ROOT) -> dict[str, Any]:
    dist = dist.resolve()
    document = read_release(dist)
    if document.get("schema") != SUPPORTED_SCHEMA_MAX or document.get("kind") != "cca-f-study-studio":
        raise ValueError(f"{dist / RELEASE_NAME} has an unsupported release identity")
    if document.get("appId") != APP_ID:
        raise ValueError(f"{dist / RELEASE_NAME} has an unsupported app identity")
    if document.get("supportedSchemaMin") != SUPPORTED_SCHEMA_MIN or document.get("supportedSchemaMax") != SUPPORTED_SCHEMA_MAX:
        raise ValueError(f"{dist / RELEASE_NAME} has an unsupported schema range")
    files = document.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError(f"{dist / RELEASE_NAME} has no generated files")

    expected_paths: set[str] = set()
    for entry in files:
        if not isinstance(entry, dict) or set(entry) != {"path", "bytes", "sha256"}:
            raise ValueError(f"{dist / RELEASE_NAME} has a malformed file entry")
        relative = entry["path"]
        if not isinstance(relative, str) or not relative or relative == RELEASE_NAME:
            raise ValueError(f"{dist / RELEASE_NAME} contains an invalid file path")
        parsed = PurePosixPath(relative)
        if parsed.is_absolute() or ".." in parsed.parts or "\\" in relative:
            raise ValueError(f"{dist / RELEASE_NAME} contains an unsafe file path: {relative}")
        if relative in expected_paths:
            raise ValueError(f"{dist / RELEASE_NAME} contains a duplicate file path: {relative}")
        expected_paths.add(relative)
        path = dist / Path(*parsed.parts)
        if path.is_symlink() or not path.is_file() or dist not in path.resolve().parents:
            raise ValueError(f"Release file is missing: {relative}")
        if entry["bytes"] != path.stat().st_size or entry["sha256"] != _sha256(path):
            raise ValueError(f"Release file hash mismatch: {relative}")

    actual_paths = {path.relative_to(dist).as_posix() for path in _relative_files(dist)}
    if actual_paths != expected_paths:
        extra = sorted(actual_paths - expected_paths)
        missing = sorted(expected_paths - actual_paths)
        raise ValueError(f"Release file set mismatch; extra={extra}, missing={missing}")

    entries = sorted(files, key=lambda entry: entry["path"])
    frontend_hash = tree_hash(entries)
    expected_manifest_hash = manifest_hash(root)
    expected_backend_hash = backend_content_hash(root)
    if document.get("frontendContentSha256") != frontend_hash or document.get("contentSha256") != frontend_hash:
        raise ValueError(f"{dist / RELEASE_NAME} has a frontend content hash mismatch")
    if document.get("manifestHash") != expected_manifest_hash:
        raise ValueError(f"{dist / RELEASE_NAME} has a protected manifest hash mismatch")
    if document.get("backendContentSha256") != expected_backend_hash:
        raise ValueError(f"{dist / RELEASE_NAME} has a backend content hash mismatch")
    if document.get("releaseId") != release_id(frontend_hash, expected_backend_hash, expected_manifest_hash):
        raise ValueError(f"{dist / RELEASE_NAME} has a content hash mismatch")
    return document


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("generate", "verify"))
    parser.add_argument("--dist", type=Path, default=Path("studio/dist"))
    parser.add_argument("--root", type=Path, default=REPO_ROOT)
    args = parser.parse_args()
    document = write_release(args.dist, args.root) if args.action == "generate" else verify_release(args.dist, args.root)
    print(f"Studio release {document['releaseId']} ({len(document['files'])} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
