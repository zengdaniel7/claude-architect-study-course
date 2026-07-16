from __future__ import annotations

import asyncio
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from studio_server.app import BodyLimitMiddleware, TutorService, create_app
from studio_server.models import TutorTurnIn
from studio_server.store import StudioStore


def write_progress(tmp_path: Path, checks: list[bool] | None = None, extra: dict[str, str] | None = None) -> bytes:
    data = {
        "ccaf-pipeline": json.dumps({"unit": "w1", "checks": checks if checks is not None else [False] * 5}),
        **(extra or {}),
    }
    raw = json.dumps({"ts": 1, "data": data}, separators=(",", ":")).encode()
    (tmp_path / "my-progress.json").write_bytes(raw)
    return raw


def client_for(tmp_path: Path, checks: list[bool] | None = None, extra: dict[str, str] | None = None) -> tuple[TestClient, dict[str, str], Any]:
    write_progress(tmp_path, checks, extra)
    app = create_app(tmp_path)
    client = TestClient(app, base_url="http://localhost")
    return client, {"X-CCA-Instance": app.state.instance_token}, app


def attempt(client: TestClient, headers: dict[str, str], stage: str, payload: dict[str, Any], confidence: str | None = None) -> dict[str, Any]:
    response = client.post(
        "/api/attempts",
        headers=headers,
        json={"unitId": "w1", "stage": stage, "confidence": confidence, "payload": payload},
    )
    assert response.status_code == 200, response.text
    return response.json()


def quiz_payload(confidences: list[str] | None = None) -> dict[str, Any]:
    choices = [2, 1, 0, 0, 0]
    confidence = confidences or ["know"] * len(choices)
    return {
        "answers": [
            {"choice": choice, "confidence": confidence[index], "questionIndex": index}
            for index, choice in enumerate(choices)
        ]
    }


def pending_quiz_review(client: TestClient, headers: dict[str, str]) -> dict[str, Any]:
    response = client.get("/api/reviews/pending", headers=headers)
    assert response.status_code == 200
    reviews = response.json()["reviews"]
    assert len(reviews) == 1
    return reviews[0]


@pytest.mark.asyncio
async def test_body_limit_never_reads_a_get_body() -> None:
    called = False

    async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
        nonlocal called
        called = True
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive() -> dict[str, Any]:
        raise AssertionError("GET middleware must not wait for a body event")

    messages: list[dict[str, Any]] = []

    async def send(message: dict[str, Any]) -> None:
        messages.append(message)

    middleware = BodyLimitMiddleware(app)
    await middleware({"type": "http", "method": "GET", "headers": []}, receive, send)
    assert called is True
    assert messages[0]["status"] == 204


def test_import_is_lossless_contiguous_and_reported(tmp_path: Path) -> None:
    unknown = "ccaf-custom-future-key"
    original = write_progress(tmp_path, [True, False, True, True, True], {unknown: "opaque-value"})
    app = create_app(tmp_path)
    client = TestClient(app, base_url="http://localhost")
    headers = {"X-CCA-Instance": app.state.instance_token}

    session = client.get("/api/session/current", headers=headers).json()
    assert [stage["status"] for stage in session["stages"]] == [
        "complete", "current", "upcoming", "upcoming", "upcoming", "upcoming"
    ]
    assert (tmp_path / "my-progress.json").read_bytes() == original
    assert client.get("/my-progress.json", headers=headers).json() == json.loads(original)

    report = client.get("/api/migration/report", headers=headers).json()
    assert report["sourceFound"] is True
    assert report["sourceUnchanged"] is True
    assert unknown in report["unknownKeysPreserved"]


def test_stage_order_and_frontend_payload_contract(tmp_path: Path) -> None:
    client, headers, _ = client_for(tmp_path, [True, False, False, False, False])

    locked = attempt(client, headers, "quiz", {"total": 5, "score": 5, "guessed": 0})
    assert locked["feedback"]["tone"] == "info"
    assert locked["session"]["stage"] == "draw"

    draw = attempt(client, headers, "draw", {"strokeCount": 1, "description": ""})
    assert draw["feedback"]["tone"] == "success"
    assert draw["session"]["stage"] == "build"

    repair = attempt(client, headers, "build", {"fileName": "tiny-order.json"})
    assert repair["feedback"]["tone"] == "repair"

    built = attempt(client, headers, "build", {
        "fileName": "tiny-order.json",
        "fileText": '{"item":"tea","quantity":2}',
        "path": "/Users/me/Documents/study/tiny-order.json",
        "plainText": True,
        "independent": True,
        "practiceValid": True,
    })
    assert built["session"]["stage"] == "teach"

    taught = attempt(client, headers, "teach", {
        "words": "A folder contains the file. Its path names every folder, and json is the extension.",
        "rubric": [True, True, True, True],
    })
    assert taught["session"]["stage"] == "quiz"


def test_guess_inflated_quiz_forces_review_and_retake(tmp_path: Path) -> None:
    client, headers, _ = client_for(tmp_path, [True, True, True, True, True])

    guessed = attempt(client, headers, "quiz", quiz_payload(["guess", "know", "know", "know", "know"]), "guess")
    assert guessed["feedback"]["tone"] == "repair"
    assert guessed["result"]["qualified"] is False
    assert guessed["result"]["correct"] == 5
    assert guessed["result"]["guessed"] == 1
    assert guessed["session"]["stage"] == "review"
    review = pending_quiz_review(client, headers)
    assert len(review["packet"]["cards"]) == 1
    assert review["packet"]["cards"][0]["source"] == "Correct guess"

    reviewed = attempt(client, headers, "review", {"reviewId": review["id"], "reviewed": 1, "finalGrade": "good"})
    assert reviewed["session"]["stage"] == "quiz"
    assert reviewed["session"]["mastery"] == "practiced"

    qualified = attempt(client, headers, "quiz", quiz_payload(), "know")
    assert qualified["result"]["qualified"] is True
    assert qualified["session"]["stage"] == "review"

    final_review = pending_quiz_review(client, headers)
    mastered = attempt(client, headers, "review", {"reviewId": final_review["id"], "reviewed": 1, "finalGrade": "good"})
    assert mastered["session"]["mastery"] == "mastered"
    assert mastered["session"]["progressPercent"] == 100


def test_restart_keeps_authoritative_progress(tmp_path: Path) -> None:
    client, headers, _ = client_for(tmp_path, [True, False, False, False, False])
    attempt(client, headers, "draw", {"strokeCount": 2, "description": ""})

    restarted = create_app(tmp_path)
    second = TestClient(restarted, base_url="http://localhost")
    session = second.get("/api/session/current", headers={"X-CCA-Instance": restarted.state.instance_token}).json()
    assert session["stage"] == "build"
    assert session["progressPercent"] == 33


def test_security_guards_token_origin_body_and_legacy_files(tmp_path: Path) -> None:
    client, headers, _ = client_for(tmp_path)
    assert client.get("/api/session/current").status_code == 401
    assert client.get("/api/session/current", headers={**headers, "Host": "example.com"}).status_code == 403
    assert client.get("/api/session/current", headers={**headers, "Origin": "https://example.com"}).status_code == 403
    assert client.get("/api/session/current", headers={**headers, "Origin": "http://localhost:9999"}).status_code == 403
    assert client.post("/__save", json={"ts": 1, "data": {}}).status_code == 401
    assert client.get("/legacy/.git/config").status_code == 404
    assert client.get("/legacy/.studio-data/studio.sqlite3").status_code == 404
    assert client.get("/legacy/my-progress.json").status_code == 404
    assert client.post("/api/attempts", headers=headers, content=b"x" * 1_000_001).status_code == 413
    invalid = client.post("/api/attempts", headers=headers, json={"unitId": "w1", "stage": "learn", "confidence": "certain", "payload": {}})
    assert invalid.status_code == 422
    assert client.post("/__save", headers={**headers, "Content-Type": "text/plain"}, content=b"{}").status_code == 415
    assert client.post("/__save", headers={**headers, "Content-Type": "application/json"}, content=b"{").status_code == 400
    assert client.post("/__save", headers=headers, json={"ts": -1, "data": {}}).status_code == 400


def test_bootstrap_sets_private_cookie_for_direct_legacy_use(tmp_path: Path) -> None:
    client, _, app = client_for(tmp_path)
    bootstrap = client.get("/api/bootstrap")
    assert bootstrap.status_code == 200
    assert bootstrap.cookies.get("cca_instance") == app.state.instance_token
    assert client.get("/my-progress.json").status_code == 200


def test_legacy_save_is_compatibility_only(tmp_path: Path) -> None:
    client, headers, _ = client_for(tmp_path)
    payload = {"ts": 2, "data": {"ccaf-pipeline": json.dumps({"unit": "w1", "checks": [True] * 5})}}
    saved = client.post("/__save", headers=headers, json=payload)
    assert saved.status_code == 200
    assert saved.json()["stored"] is True
    stale = client.post("/__save", headers=headers, json={"ts": 1, "data": {}})
    assert stale.status_code == 200
    assert stale.json() == {"ok": True, "stored": False, "ts": 2.0}
    assert client.get("/my-progress.json", headers=headers).json() == payload
    assert client.get("/api/session/current", headers=headers).json()["stage"] == "learn"


def test_frontier_packet_and_content_gap_never_change_mastery(tmp_path: Path) -> None:
    client, headers, app = client_for(tmp_path, [True, False, False, False, False])
    before = client.get("/api/session/current", headers=headers).json()

    packet = client.post("/api/reviews/prepare", headers=headers).json()
    assert packet["prepared"] is True
    saved = app.state.store.record_frontier_review("w1", "The learner needs another visual.", "revise", packet["reviewId"])
    assert saved and saved["advisoryOnly"] is True

    gap = client.post("/api/content-gaps", headers=headers, json={
        "unitId": "w1", "activityId": "w1:draw", "note": "I have not learned paths yet."
    })
    assert gap.status_code == 200
    assert client.get("/api/session/current", headers=headers).json() == before


@pytest.mark.asyncio
async def test_ollama_request_is_small_schema_bound_and_unloaded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    store = StudioStore(tmp_path)
    service = TutorService(store)
    captured: dict[str, Any] = {}

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, Any]:
            return {"message": {"content": json.dumps({
                "mode": "hint", "advice": "Trace the folders first.",
                "nextQuestion": "Which part is the file?", "label": "needs_review"
            })}}

    class Client:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            captured["timeout"] = kwargs.get("timeout")

        async def __aenter__(self) -> "Client":
            return self

        async def __aexit__(self, *_: Any) -> None:
            return None

        async def post(self, url: str, json: dict[str, Any]) -> Response:
            captured["url"] = url
            captured["payload"] = json
            return Response()

    monkeypatch.setattr("studio_server.app.httpx.AsyncClient", Client)
    monkeypatch.setattr("studio_server.app._mac_memory_status", lambda: {"allowed": True, "status": "ready", "reason": None})
    result = await service._ask_ollama(TutorTurnIn(unitId="w1", activityId="w1:learn", mode="hint", learnerText="help"))
    assert result["source"] == "ollama"
    assert captured["timeout"] == 42.0
    assert captured["payload"]["keep_alive"] == 0
    assert captured["payload"]["options"]["num_ctx"] == 2048
    assert captured["payload"]["options"]["num_predict"] == 256
    assert captured["payload"]["stream"] is False
    assert captured["payload"]["format"]["additionalProperties"] is False


@pytest.mark.asyncio
async def test_tutor_turn_can_be_cancelled(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    store = StudioStore(tmp_path)
    service = TutorService(store)

    async def slow(_: TutorTurnIn) -> dict[str, Any]:
        await asyncio.sleep(30)
        return {}

    monkeypatch.setattr(service, "_ask_ollama", slow)
    body = TutorTurnIn(unitId="w1", activityId="w1:learn", mode="hint", turnId="cancel-turn-123")
    task = asyncio.create_task(service.turn(body))
    for _ in range(50):
        if store.tutor_turn("cancel-turn-123") is not None:
            break
        await asyncio.sleep(0.01)
    assert await service.cancel("cancel-turn-123") is True
    with pytest.raises(asyncio.CancelledError):
        await task
    assert store.tutor_turn("cancel-turn-123")["status"] == "cancelled"


def test_schema_upgrade_creates_bounded_backup(tmp_path: Path) -> None:
    data_dir = tmp_path / ".studio-data"
    data_dir.mkdir()
    database = data_dir / "studio.sqlite3"
    with sqlite3.connect(database) as db:
        db.execute("CREATE TABLE marker (value TEXT)")
        db.execute("INSERT INTO marker VALUES ('before-upgrade')")
        db.execute("PRAGMA user_version = 0")

    StudioStore(tmp_path)
    backups = list((data_dir / "backups").glob("studio-v0-*.sqlite3"))
    assert len(backups) == 1
    with sqlite3.connect(backups[0]) as backup:
        assert backup.execute("SELECT value FROM marker").fetchone()[0] == "before-upgrade"


def test_future_schema_is_rejected_without_rewriting_database(tmp_path: Path) -> None:
    data_dir = tmp_path / ".studio-data"
    data_dir.mkdir()
    database = data_dir / "studio.sqlite3"
    with sqlite3.connect(database) as db:
        db.execute("CREATE TABLE marker (value TEXT)")
        db.execute("INSERT INTO marker VALUES ('future')")
        db.execute("PRAGMA user_version = 999")

    with pytest.raises(RuntimeError, match="newer than supported"):
        StudioStore(tmp_path)
    with sqlite3.connect(database) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 999
        assert db.execute("SELECT value FROM marker").fetchone()[0] == "future"


def test_concurrent_writes_have_one_winner(tmp_path: Path) -> None:
    write_progress(tmp_path)
    store = StudioStore(tmp_path)

    with ThreadPoolExecutor(max_workers=4) as pool:
        attempts = list(pool.map(
            lambda _: store.record_attempt("w1", "learn", "know", {"completed": True})[1]["result"]["passed"],
            range(4),
        ))
    assert attempts.count(True) == 1

    with ThreadPoolExecutor(max_workers=4) as pool:
        review_ids = list(pool.map(lambda _: store.prepare_review("w1")["id"], range(4)))
    assert len(set(review_ids)) == 1

    review_id = review_ids[0]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(
            lambda _: store.record_frontier_review("w1", "Needs a visual.", "revise", review_id),
            range(4),
        ))
    assert sum(result is not None for result in results) == 1


def test_duplicate_tutor_turn_and_decided_proposal_are_conflicts(tmp_path: Path) -> None:
    client, headers, app = client_for(tmp_path)
    body = {"unitId": "w1", "activityId": "w1:learn", "mode": "hint", "turnId": "duplicate-turn-1"}
    app.state.store.create_tutor_turn("w1", "w1:learn", "hint", None, "duplicate-turn-1")
    assert client.post("/api/tutor/turn", headers=headers, json=body).status_code == 409

    proposal = app.state.store.create_proposal("study_plan", {"summary": "Keep W1 visual."})
    path = f'/api/proposals/{proposal["id"]}/decision'
    assert client.post(path, headers=headers, json={"decision": "accepted"}).status_code == 200
    assert client.post(path, headers=headers, json={"decision": "rejected"}).status_code == 409


def test_mastered_review_is_scheduled_and_again_cannot_finish(tmp_path: Path) -> None:
    client, headers, app = client_for(tmp_path, [True, True, True, True, True])
    qualified = attempt(client, headers, "quiz", quiz_payload(), "know")
    assert qualified["result"]["qualified"] is True
    immediate = pending_quiz_review(client, headers)
    mastered = attempt(client, headers, "review", {
        "reviewId": immediate["id"], "reviewed": 1, "finalGrade": "good"
    })
    assert mastered["session"]["mastery"] == "mastered"
    assert mastered["session"]["dueReviews"] == 0
    assert client.get("/api/reviews/pending", headers=headers).json()["reviews"] == []

    future = app.state.store.pending_reviews("quiz")
    assert len(future) == 1
    assert future[0]["packet"]["intervalDays"] == 4
    with app.state.store._connect() as db:
        db.execute("UPDATE reviews SET due_at = ? WHERE id = ?", ("2000-01-01T00:00:00+00:00", future[0]["id"]))

    assert client.get("/api/session/current", headers=headers).json()["dueReviews"] == 1
    due = pending_quiz_review(client, headers)
    repeated = attempt(client, headers, "review", {
        "reviewId": due["id"], "reviewed": 1, "finalGrade": "again"
    })
    assert repeated["result"]["passed"] is False
    assert repeated["session"]["mastery"] == "mastered"
    assert repeated["session"]["dueReviews"] == 1

    maintained = attempt(client, headers, "review", {
        "reviewId": due["id"], "reviewed": 2, "finalGrade": "hard"
    })
    assert maintained["result"]["maintenance"] is True
    assert maintained["feedback"]["title"] == "Review recorded"
    assert maintained["session"]["mastery"] == "mastered"
    assert maintained["session"]["dueReviews"] == 0
    next_review = app.state.store.pending_reviews("quiz")
    assert len(next_review) == 1
    assert next_review[0]["packet"]["intervalDays"] == 2


@pytest.mark.asyncio
async def test_memory_guard_never_starts_ollama(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    store = StudioStore(tmp_path)
    service = TutorService(store)
    monkeypatch.setattr(
        "studio_server.app._mac_memory_status",
        lambda: {"allowed": False, "status": "protected", "reason": "Memory pressure is high."},
    )

    class ForbiddenClient:
        def __init__(self, *_: Any, **__: Any) -> None:
            raise AssertionError("Ollama must not be contacted while the memory guard is active")

    monkeypatch.setattr("studio_server.app.httpx.AsyncClient", ForbiddenClient)
    result = await service._ask_ollama(TutorTurnIn(unitId="w1", activityId="w1:learn", mode="hint"))
    assert result["source"] == "resource_guard"
    assert "Memory pressure is high" in result["advice"]
