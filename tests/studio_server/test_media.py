"""Generated-media serving: only manifest-known, reviewed, checksum-clean files are served."""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from studio_server.app import create_app

REPO_ROOT = Path(__file__).resolve().parents[2]

MEDIA_BYTES = b"fake-mp4-payload-for-tests"
MEDIA_SHA = hashlib.sha256(MEDIA_BYTES).hexdigest()


def _write_manifest(root: Path, review_state: str = "reviewed", sha256: str = MEDIA_SHA) -> None:
    manifest_dir = root / "studio" / "src" / "content"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "notice": "test notice",
        "sourceCommit": "890b294",
        "items": [
            {
                "id": "video-overview",
                "type": "video",
                "title": "Test video",
                "focus": "Test focus",
                "durationSec": 5,
                "file": "ccaf-video-overview.mp4",
                "mime": "video/mp4",
                "sha256": sha256,
                "generatedOn": "2026-08-12",
                "reviewState": review_state,
            }
        ],
    }
    (manifest_dir / "generated-media.json").write_text(json.dumps(manifest), "utf-8")


def _client(tmp_path: Path, review_state: str = "reviewed", sha256: str = MEDIA_SHA, write_file: bool = True):
    root = tmp_path / "root"
    root.mkdir(parents=True, exist_ok=True)
    _write_manifest(root, review_state=review_state, sha256=sha256)
    media_dir = tmp_path / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    if write_file:
        (media_dir / "ccaf-video-overview.mp4").write_bytes(MEDIA_BYTES)
    app = create_app(root, data_dir=tmp_path / "data", media_dir=media_dir)
    client = TestClient(app, base_url="http://localhost")
    headers = {"X-CCA-Instance": app.state.instance_token}
    return client, headers


def test_reviewed_present_media_is_served_with_mime(tmp_path: Path) -> None:
    client, headers = _client(tmp_path)
    response = client.get("/media/video-overview")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("video/mp4")
    assert response.content == MEDIA_BYTES


def test_unknown_media_id_is_404(tmp_path: Path) -> None:
    client, headers = _client(tmp_path)
    assert client.get("/media/not-a-real-id").status_code == 404
    assert client.get("/media/..%2Fsecret").status_code == 404


def test_pending_review_media_is_not_served(tmp_path: Path) -> None:
    client, headers = _client(tmp_path, review_state="pending")
    response = client.get("/media/video-overview")
    assert response.status_code == 404
    assert "awaiting review" in response.json()["detail"]


def test_missing_file_is_404_with_honest_detail(tmp_path: Path) -> None:
    client, headers = _client(tmp_path, write_file=False)
    response = client.get("/media/video-overview")
    assert response.status_code == 404
    assert "not installed" in response.json()["detail"]


def test_checksum_mismatch_is_not_served(tmp_path: Path) -> None:
    client, headers = _client(tmp_path, sha256="0" * 64)
    response = client.get("/media/video-overview")
    assert response.status_code == 404
    assert "checksum" in response.json()["detail"]


def test_status_reports_presence_and_review_state(tmp_path: Path) -> None:
    client, headers = _client(tmp_path, review_state="pending")
    response = client.get("/api/media/status", headers=headers)
    assert response.status_code == 200
    items = {item["id"]: item for item in response.json()["items"]}
    entry = items["video-overview"]
    assert entry["present"] is True
    assert entry["state"] == "ok"
    assert entry["reviewState"] == "pending"


def test_status_requires_instance_token(tmp_path: Path) -> None:
    client, _ = _client(tmp_path)
    assert client.get("/api/media/status").status_code == 401


def test_status_marks_missing_and_corrupt_files(tmp_path: Path) -> None:
    client, headers = _client(tmp_path, write_file=False)
    items = {item["id"]: item for item in client.get("/api/media/status", headers=headers).json()["items"]}
    assert items["video-overview"]["present"] is False
    assert items["video-overview"]["state"] == "missing"

    corrupt_client, corrupt_headers = _client(tmp_path / "corrupt", sha256="f" * 64)
    items = {item["id"]: item for item in corrupt_client.get("/api/media/status", headers=corrupt_headers).json()["items"]}
    assert items["video-overview"]["present"] is False
    assert items["video-overview"]["state"] == "corrupt"


def test_spa_route_never_shadows_media_paths(tmp_path: Path) -> None:
    client, headers = _client(tmp_path, write_file=False)
    # media/ under the SPA catch-all must 404, not fall back to index.html
    response = client.get("/media/")
    assert response.status_code == 404


def test_repo_manifest_matches_shipped_assets() -> None:
    """The real tracked manifest must agree with the tracked frontend assets."""
    manifest = json.loads((REPO_ROOT / "studio" / "src" / "content" / "generated-media.json").read_text("utf-8"))
    assets = REPO_ROOT / "studio" / "src" / "assets" / "generated-media"
    for item in manifest["items"]:
        assert item["reviewState"] in {"pending", "reviewed"}
        assert len(item["sha256"]) == 64
        for key in ("thumbnail", "captions", "transcript"):
            if item.get(key):
                assert (assets / item[key]).is_file(), f"{item['id']} references missing asset {item[key]}"
        if item.get("transcript"):
            transcript = (assets / item["transcript"]).read_text("utf-8").lower()
            assert "notes win" in transcript, "transcript must carry the notes-win truth label"
