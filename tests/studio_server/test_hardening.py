from __future__ import annotations

import io
import hashlib
import json
import stat
import sqlite3
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from studio_server.app import TutorService, _supervisor_token, create_app
from studio_server.legacy_assets import LEGACY_ASSETS
from studio_server.store import BackupValidationError, STATE_TABLES, StudioStore


def write_progress(root: Path, checks: list[bool] | None = None) -> None:
    payload = {
        "ts": 1,
        "data": {
            "ccaf-pipeline": json.dumps({"unit": "w1", "checks": checks or [False] * 5})
        },
    }
    (root / "my-progress.json").write_text(json.dumps(payload), encoding="utf-8")


def confirm_legacy(app: Any) -> None:
    report = app.state.store.migration_report()
    if report.get("status") == "pending_confirmation":
        app.state.store.commit_legacy_import(report["sourceSha256"])


def test_attempt_receipt_is_idempotent_and_rejects_stale_state(tmp_path: Path) -> None:
    write_progress(tmp_path)
    app = create_app(tmp_path)
    client = TestClient(app, base_url="http://localhost")
    headers = {"X-CCA-Instance": app.state.instance_token}
    attempt_id = str(uuid.uuid4())
    body = {
        "unitId": "w1",
        "stage": "learn",
        "confidence": "know",
        "payload": {"completed": True},
        "attemptId": attempt_id,
        "clientStateVersion": 0,
        "manifestHash": app.state.store.manifest_hash,
    }

    first = client.post("/api/attempts", headers=headers, json=body)
    assert first.status_code == 200
    assert first.json()["replayed"] is False
    assert first.json()["session"]["stateVersion"] == 1

    replay = client.post("/api/attempts", headers=headers, json=body)
    assert replay.status_code == 200
    assert replay.json()["replayed"] is True
    assert replay.json()["attemptId"] == attempt_id

    changed = client.post(
        "/api/attempts",
        headers=headers,
        json={**body, "payload": {"completed": False}},
    )
    assert changed.status_code == 409

    stale = client.post(
        "/api/attempts",
        headers=headers,
        json={
            **body,
            "attemptId": str(uuid.uuid4()),
            "stage": "draw",
            "payload": {"strokeCount": 1},
        },
    )
    assert stale.status_code == 409

    receipt = client.get(f"/api/attempts/{attempt_id}", headers=headers)
    assert receipt.status_code == 200
    assert receipt.json()["session"] == first.json()["session"]


def test_idempotent_save_acknowledgement_stays_under_budget(tmp_path: Path) -> None:
    write_progress(tmp_path)
    app = create_app(tmp_path)
    client = TestClient(app, base_url="http://localhost")
    headers = {"X-CCA-Instance": app.state.instance_token}
    body = {
        "unitId": "w1",
        "stage": "learn",
        "confidence": "know",
        "payload": {"completed": True},
        "attemptId": str(uuid.uuid4()),
        "clientStateVersion": 0,
        "manifestHash": app.state.store.manifest_hash,
    }

    latencies_ms: list[float] = []
    for _ in range(20):
        started = time.perf_counter()
        response = client.post("/api/attempts", headers=headers, json=body)
        latencies_ms.append((time.perf_counter() - started) * 1_000)
        assert response.status_code == 200

    p95 = sorted(latencies_ms)[18]
    assert p95 < 500, f"idempotent save acknowledgement p95 was {p95:.1f} ms"


def test_build_and_teach_are_graded_from_raw_evidence(tmp_path: Path) -> None:
    write_progress(tmp_path, [True, True, False, False, False])
    app = create_app(tmp_path)
    confirm_legacy(app)
    client = TestClient(app, base_url="http://localhost")
    headers = {"X-CCA-Instance": app.state.instance_token}

    formatted = client.post(
        "/api/attempts",
        headers=headers,
        json={
            "unitId": "w1",
            "stage": "build",
            "payload": {
                "fileName": "tiny-order.json",
                "fileText": r'{\rtf1 {"item":"tea","quantity":2}}',
                "path": "/Users/student/study/tiny-order.json",
                "plainText": True,
                "independent": True,
                "practiceValid": True,
            },
        },
    )
    assert formatted.status_code == 200
    assert formatted.json()["result"]["passed"] is False

    build = client.post(
        "/api/attempts",
        headers=headers,
        json={
            "unitId": "w1",
            "stage": "build",
            "payload": {
                "fileName": "tiny-order.json",
                "fileText": '{"item":"tea","quantity":2}',
                "path": "/Users/student/study/tiny-order.json",
                "plainText": False,
                "independent": False,
                "practiceValid": False,
            },
        },
    )
    assert build.status_code == 200
    assert build.json()["result"]["passed"] is True
    assert all(build.json()["result"]["objectiveChecks"].values())
    assert not any(build.json()["result"]["selfAttestations"].values())

    fake_rubric = client.post(
        "/api/attempts",
        headers=headers,
        json={
            "unitId": "w1",
            "stage": "teach",
            "payload": {"words": "This response is long enough but avoids every required technical idea on purpose completely.", "rubric": [True] * 4},
        },
    )
    assert fake_rubric.status_code == 200
    assert fake_rubric.json()["result"]["passed"] is False

    raw_words = (
        "A file is one saved item. A folder holds that file. The path shows where it lives, "
        "and the .json extension says what kind of plain text it is."
    )
    derived = client.post(
        "/api/attempts",
        headers=headers,
        json={"unitId": "w1", "stage": "teach", "payload": {"words": raw_words, "rubric": [False] * 4}},
    )
    assert derived.status_code == 200
    assert derived.json()["result"]["passed"] is True
    assert all(derived.json()["result"]["objectiveChecks"].values())


def _qualified_review(client: TestClient, headers: dict[str, str]) -> dict[str, Any]:
    choices = [2, 1, 0, 0, 0]
    response = client.post(
        "/api/attempts",
        headers=headers,
        json={
            "unitId": "w1",
            "stage": "quiz",
            "confidence": "know",
            "payload": {
                "answers": [
                    {"choice": choice, "confidence": "know", "questionIndex": index}
                    for index, choice in enumerate(choices)
                ]
            },
        },
    )
    assert response.status_code == 200
    review = client.get("/api/reviews/pending", headers=headers).json()["reviews"]
    assert len(review) == 1
    return review[0]


def test_each_review_rating_survives_retry_and_restart(tmp_path: Path) -> None:
    write_progress(tmp_path, [True] * 5)
    app = create_app(tmp_path)
    confirm_legacy(app)
    client = TestClient(app, base_url="http://localhost")
    headers = {"X-CCA-Instance": app.state.instance_token}
    review = _qualified_review(client, headers)
    card = review["packet"]["cards"][0]
    rating_id = str(uuid.uuid4())
    path = f'/api/reviews/{review["id"]}/cards/{card["id"]}'
    body = {"ratingId": rating_id, "rating": "again", "elapsedMs": 500}

    first = client.post(path, headers=headers, json=body)
    assert first.status_code == 200
    assert first.json()["repeat"] is True
    assert first.json()["remaining"] == 1
    replay = client.post(path, headers=headers, json=body)
    assert replay.status_code == 200
    assert replay.json()["replayed"] is True

    restarted = create_app(tmp_path)
    second = TestClient(restarted, base_url="http://localhost")
    second_headers = {"X-CCA-Instance": restarted.state.instance_token}
    saved = second.get("/api/reviews/pending", headers=second_headers).json()["reviews"][0]
    assert saved["packet"]["cards"][0]["repetitions"] == 1
    finished = second.post(
        path,
        headers=second_headers,
        json={"ratingId": str(uuid.uuid4()), "rating": "good", "elapsedMs": 300},
    )
    assert finished.status_code == 200
    assert finished.json()["reviewComplete"] is True
    assert finished.json()["session"]["mastery"] == "mastered"


def test_backup_export_inspect_and_restore_preserve_normalized_state(tmp_path: Path) -> None:
    write_progress(tmp_path)
    app = create_app(tmp_path)
    client = TestClient(app, base_url="http://localhost")
    headers = {"X-CCA-Instance": app.state.instance_token}
    client.post(
        "/api/attempts",
        headers=headers,
        json={"unitId": "w1", "stage": "learn", "payload": {"completed": True}},
    )
    exported = client.get("/api/backups/export", headers=headers)
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("application/zip")

    client.post(
        "/api/attempts",
        headers=headers,
        json={"unitId": "w1", "stage": "draw", "payload": {"strokeCount": 1}},
    )
    assert client.get("/api/session/current", headers=headers).json()["stage"] == "build"

    inspected = client.post(
        "/api/backups/import/inspect",
        headers={**headers, "Content-Type": "application/octet-stream"},
        content=exported.content,
    )
    assert inspected.status_code == 200
    committed = client.post(
        "/api/backups/import/commit",
        headers=headers,
        json={"importToken": inspected.json()["importToken"]},
    )
    assert committed.status_code == 200
    assert committed.json()["stateDigest"] == inspected.json()["stateDigest"]
    restored = client.get("/api/session/current", headers=headers).json()
    assert restored["stage"] == "draw"
    assert restored["stateVersion"] == 1


def test_backup_rejects_malformed_and_foreign_manifest(tmp_path: Path) -> None:
    write_progress(tmp_path)
    app = create_app(tmp_path)
    client = TestClient(app, base_url="http://localhost")
    headers = {"X-CCA-Instance": app.state.instance_token, "Content-Type": "application/octet-stream"}
    assert client.post("/api/backups/import/inspect", headers=headers, content=b"not a zip").status_code == 400

    archive, _ = app.state.store.export_backup()
    with zipfile.ZipFile(archive, "r") as source:
        metadata = json.loads(source.read("metadata.json"))
        database = source.read("studio.sqlite3")
    metadata["manifestHash"] = "0" * 64
    forged = io.BytesIO()
    with zipfile.ZipFile(forged, "w", compression=zipfile.ZIP_DEFLATED) as target:
        target.writestr("metadata.json", json.dumps(metadata))
        target.writestr("studio.sqlite3", database)
    assert client.post("/api/backups/import/inspect", headers=headers, content=forged.getvalue()).status_code == 400


def test_backup_rejects_lookalike_schema_and_oversized_metadata(tmp_path: Path) -> None:
    store = StudioStore(tmp_path)
    lookalike = tmp_path / "lookalike.sqlite3"
    with sqlite3.connect(lookalike) as db:
        for table in STATE_TABLES:
            db.execute(f'CREATE TABLE "{table}" (value TEXT)')
        db.execute("PRAGMA user_version = 3")
    database = lookalike.read_bytes()
    metadata = {
        "appId": "ccaf-study-studio",
        "formatVersion": 1,
        "schemaVersion": 3,
        "manifestHash": store.manifest_hash,
        "databaseSha256": hashlib.sha256(database).hexdigest(),
        "stateDigest": "0" * 64,
    }
    forged = io.BytesIO()
    with zipfile.ZipFile(forged, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("metadata.json", json.dumps(metadata))
        archive.writestr("studio.sqlite3", database)
    with pytest.raises(BackupValidationError, match="schema"):
        store.inspect_backup(forged.getvalue())

    exported, _ = store.export_backup()
    with zipfile.ZipFile(exported, "r") as archive:
        valid_database = archive.read("studio.sqlite3")
    oversized = io.BytesIO()
    with zipfile.ZipFile(oversized, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("metadata.json", json.dumps({**metadata, "padding": "x" * 65_536}))
        archive.writestr("studio.sqlite3", valid_database)
    with pytest.raises(BackupValidationError, match="expands beyond"):
        store.inspect_backup(oversized.getvalue())


def test_backup_commit_rechecks_staged_database_inside_lock(tmp_path: Path) -> None:
    store = StudioStore(tmp_path)
    archive, _ = store.export_backup()
    inspected = store.inspect_backup(archive.read_bytes())
    staged = store.import_dir / f'{inspected["importToken"]}.sqlite3'
    with staged.open("ab") as handle:
        handle.write(b"changed")
    with pytest.raises(BackupValidationError, match="changed before import"):
        store.commit_backup_import(inspected["importToken"])


def test_failed_migration_rolls_back_and_preserves_recovery_copy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    data = tmp_path / ".studio-data"
    data.mkdir()
    database = data / "studio.sqlite3"
    with sqlite3.connect(database) as db:
        db.execute("CREATE TABLE marker (value TEXT)")
        db.execute("INSERT INTO marker VALUES ('before')")
        db.execute("PRAGMA user_version = 2")

    def fail_migration(*_: Any) -> None:
        raise RuntimeError("forced migration failure")

    monkeypatch.setattr(StudioStore, "_migrate_schema", fail_migration)
    with pytest.raises(RuntimeError, match="migration failed"):
        StudioStore(tmp_path)

    with sqlite3.connect(database) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 2
        assert db.execute("SELECT value FROM marker").fetchone()[0] == "before"
        assert db.execute("SELECT name FROM sqlite_master WHERE name = 'sessions'").fetchone() is None
    assert list((data / "backups").glob("studio-v2-*.sqlite3"))
    assert list((data / "recovery").glob("failed-*/studio.sqlite3"))


def test_corrupt_database_is_preserved_and_normal_startup_refuses(tmp_path: Path) -> None:
    data = tmp_path / ".studio-data"
    data.mkdir()
    (data / "studio.sqlite3").write_bytes(b"this is not sqlite")
    with pytest.raises(RuntimeError, match="Restore a verified backup"):
        StudioStore(tmp_path)
    copies = list((data / "recovery").glob("failed-*/studio.sqlite3"))
    assert len(copies) == 1
    assert copies[0].read_bytes() == b"this is not sqlite"


def test_supervisor_boundary_requires_its_own_token(tmp_path: Path) -> None:
    write_progress(tmp_path)
    app = create_app(tmp_path)
    client = TestClient(app, base_url="http://localhost")
    instance = {"X-CCA-Instance": app.state.instance_token}
    assert client.get("/api/supervisor/session", headers=instance).status_code == 401
    token = (app.state.store.data_dir / "supervisor.token").read_text(encoding="ascii")
    response = client.get("/api/supervisor/session", headers={"X-CCA-Supervisor": token})
    assert response.status_code == 200
    assert response.json()["release"]["appId"] == "ccaf-study-studio"
    health = client.get("/__health").json()
    assert health["ok"] is True
    assert health["schemaVersion"] == 3
    assert health["databaseId"] != "unknown"


def test_release_manifest_mismatch_blocks_grading(tmp_path: Path) -> None:
    write_progress(tmp_path)
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<main>Studio</main>", encoding="utf-8")
    (dist / "release.json").write_text(json.dumps({
        "appId": "ccaf-study-studio",
        "releaseId": "sha256:foreign",
        "manifestHash": "0" * 64,
        "supportedSchemaMin": 3,
        "supportedSchemaMax": 3,
    }), encoding="utf-8")
    app = create_app(tmp_path, dist_dir=dist)
    client = TestClient(app, base_url="http://localhost")
    headers = {"X-CCA-Instance": app.state.instance_token}
    assert client.get("/__health").json()["ok"] is False
    response = client.post(
        "/api/attempts",
        headers=headers,
        json={"unitId": "w1", "stage": "learn", "payload": {"completed": True}},
    )
    assert response.status_code == 409
    assert client.post("/api/reviews/prepare", headers=headers).status_code == 409
    report = app.state.store.migration_report()
    assert client.post(
        "/api/migration/legacy/commit",
        headers=headers,
        json={"sourceSha256": report["sourceSha256"]},
    ).status_code == 409


def test_verified_legacy_archive_is_viewable_but_server_read_only(tmp_path: Path) -> None:
    archive = tmp_path / "archive"
    for relative in LEGACY_ASSETS:
        path = archive / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("<h1>Archive</h1>" if relative == "dashboard.html" else "fixture", encoding="utf-8")
    app = create_app(archive, tmp_path / "data")
    client = TestClient(app, base_url="http://localhost")
    headers = {"X-CCA-Instance": app.state.instance_token}
    assert client.get("/legacy/dashboard.html").status_code == 200
    blocked = client.post(
        "/__save",
        headers=headers,
        json={"ts": 2, "data": {"ccaf-pipeline": "{}"}},
    )
    assert blocked.status_code == 410


def test_partial_legacy_archive_is_never_trusted(tmp_path: Path) -> None:
    archive = tmp_path / "archive"
    archive.mkdir()
    (archive / "dashboard.html").write_text("<h1>Incomplete</h1>", encoding="utf-8")
    app = create_app(archive, tmp_path / "data")
    client = TestClient(app, base_url="http://localhost")
    assert client.get("/legacy/dashboard.html").status_code == 404


def test_legacy_import_rechecks_source_after_inspection(tmp_path: Path) -> None:
    write_progress(tmp_path)
    app = create_app(tmp_path)
    report = app.state.store.migration_report()
    write_progress(tmp_path, [True] * 5)
    client = TestClient(app, base_url="http://localhost")
    response = client.post(
        "/api/migration/legacy/commit",
        headers={"X-CCA-Instance": app.state.instance_token},
        json={"sourceSha256": report["sourceSha256"]},
    )
    assert response.status_code == 409
    assert client.get(
        "/api/session/current", headers={"X-CCA-Instance": app.state.instance_token}
    ).json()["stage"] == "learn"


def test_supervisor_token_creation_is_private_and_race_safe(tmp_path: Path) -> None:
    with ThreadPoolExecutor(max_workers=8) as pool:
        tokens = list(pool.map(lambda _: _supervisor_token(tmp_path), range(16)))
    assert len(set(tokens)) == 1
    assert len(tokens[0]) >= 32
    assert stat.S_IMODE((tmp_path / "supervisor.token").stat().st_mode) == 0o600


def test_corrupt_review_packet_does_not_break_the_queue(tmp_path: Path) -> None:
    write_progress(tmp_path, [True] * 5)
    app = create_app(tmp_path)
    confirm_legacy(app)
    client = TestClient(app, base_url="http://localhost")
    headers = {"X-CCA-Instance": app.state.instance_token}
    review = _qualified_review(client, headers)
    with app.state.store._connect() as db:
        db.execute("UPDATE reviews SET packet_json = '{' WHERE id = ?", (review["id"],))
    response = client.get("/api/reviews/pending", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"reviews": []}


@pytest.mark.asyncio
async def test_malformed_ollama_inventory_is_treated_as_unavailable(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    write_progress(tmp_path)
    service = TutorService(StudioStore(tmp_path))

    class Response:
        is_success = True

        @staticmethod
        def json() -> list[str]:
            return ["malformed"]

    class Client:
        async def __aenter__(self) -> "Client":
            return self

        async def __aexit__(self, *_: Any) -> None:
            return None

        async def get(self, _: str) -> Response:
            return Response()

    monkeypatch.setattr("studio_server.app.httpx.AsyncClient", lambda **_: Client())
    assert await service.available() is False
