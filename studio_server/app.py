from __future__ import annotations

import asyncio
import fcntl
import hmac
import json
import math
import os
import platform
import re
import secrets
import subprocess
from contextlib import asynccontextmanager
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from .models import (
    Advisory,
    AttemptIn,
    BackupCommitIn,
    ContentGapIn,
    FrontierReviewIn,
    LegacyImportCommitIn,
    ProposalDecisionIn,
    ReviewCardRatingIn,
    ReviewPrepareIn,
    SupervisorProposalIn,
    TutorTurnIn,
)
from .legacy_assets import is_verified_archive
from .store import (
    AttemptConflict,
    BackupValidationError,
    LegacyImportConflict,
    ReviewConflict,
    SCHEMA_VERSION,
    StudioStore,
)

MAX_BODY = 1_000_000
MAX_BACKUP_BODY = 25 * 1024 * 1024
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
OLLAMA_MODEL = "llama3.2:3b"
ALLOWED_HOSTS = {"localhost", "127.0.0.1", "::1"}
INSTANCE_COOKIE = "cca_instance"
LOW_MEMORY_FREE_PERCENT = 35
LOW_MEMORY_MAX_BYTES = 10 * 1024**3
LEGACY_KEY = re.compile(r"^ccaf-[A-Za-z0-9][A-Za-z0-9._-]*$")


class BodyLimitMiddleware:
    def __init__(self, app: Callable[..., Awaitable[None]], limit: int = MAX_BODY) -> None:
        self.app, self.limit = app, limit

    async def __call__(self, scope: dict[str, Any], receive: Callable[..., Awaitable[dict[str, Any]]], send: Callable[..., Awaitable[None]]) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        # Uvicorn does not promise an empty request-body event for bodyless
        # methods. Reading from receive() here can therefore stall every page
        # and API GET before FastAPI sees it.
        if scope.get("method", "GET").upper() in {"GET", "HEAD", "OPTIONS"}:
            await self.app(scope, receive, send)
            return
        headers = {key.decode().lower(): value.decode() for key, value in scope.get("headers", [])}
        try:
            path = str(scope.get("path", ""))
            limit = MAX_BACKUP_BODY if path == "/api/backups/import/inspect" else self.limit
            if int(headers.get("content-length", "0")) > limit:
                raise ValueError
        except ValueError:
            await self._reject(send)
            return
        messages: list[dict[str, Any]] = []
        size = 0
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] == "http.request":
                size += len(message.get("body", b""))
                if size > limit:
                    await self._reject(send)
                    return
                if not message.get("more_body", False):
                    break
            elif message["type"] == "http.disconnect":
                break
        index = 0

        async def replay() -> dict[str, Any]:
            nonlocal index
            if index < len(messages):
                message = messages[index]
                index += 1
                return message
            return {"type": "http.request", "body": b"", "more_body": False}

        await self.app(scope, replay, send)

    async def _reject(self, send: Callable[..., Awaitable[None]]) -> None:
        body = b'{"detail":"Request body too large"}'
        await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})


def _local_address(value: str, *, origin: bool = False) -> tuple[str, int] | None:
    try:
        parsed = urlsplit(value if origin else f"http://{value}")
        if origin and parsed.scheme != "http":
            return None
        if parsed.username is not None or parsed.password is not None:
            return None
        hostname = (parsed.hostname or "").lower()
        if hostname not in ALLOWED_HOSTS:
            return None
        return hostname, parsed.port or 80
    except ValueError:
        return None


def _host_allowed(value: str) -> bool:
    return _local_address(value) is not None


def _origin_allowed(value: str | None, host: str) -> bool:
    if not value:
        return True
    return _local_address(value, origin=True) == _local_address(host)


def _safe_file(root: Path, path: str) -> Path | None:
    candidate = (root / path).resolve()
    blocked_names = {".git", ".studio-data", ".agents", ".claude", "__pycache__"}
    parts = Path(path).parts
    if not path or any(part in blocked_names or part.startswith(".") or "progress" in part.lower() or "temp" in part.lower() or part.endswith(".tmp") for part in parts):
        return None
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def _valid_legacy_save(payload: object) -> bool:
    if not isinstance(payload, dict) or not isinstance(payload.get("ts"), (int, float)) or isinstance(payload.get("ts"), bool):
        return False
    timestamp = float(payload["ts"])
    if not math.isfinite(timestamp) or timestamp < 0:
        return False
    data = payload.get("data")
    if not isinstance(data, dict) or len(data) > 1_000:
        return False
    total = 0
    for key, value in data.items():
        if not isinstance(key, str) or len(key) > 128 or not LEGACY_KEY.fullmatch(key) or key == "ccaf-sync-ts":
            return False
        if not isinstance(value, str) or len(value) > 100_000:
            return False
        total += len(key) + len(value)
        if total > 900_000:
            return False
    return True


def _release_identity(root: Path, dist: Path, store: StudioStore) -> dict[str, Any]:
    descriptor: dict[str, Any] = {}
    for candidate in (dist / "release.json", root / "release.json"):
        if not candidate.is_file():
            continue
        try:
            parsed = json.loads(candidate.read_text(encoding="utf-8"))
            if isinstance(parsed, dict):
                descriptor = parsed
                break
        except (OSError, json.JSONDecodeError):
            continue
    app_id = str(descriptor.get("appId") or "ccaf-study-studio")
    expected_app_id = os.environ.get("CCA_STUDIO_APP_ID")
    expected_release = os.environ.get("CCA_STUDIO_RELEASE_ID")
    descriptor_release = descriptor.get("releaseId")
    release_id = str(expected_release or descriptor_release or "development")
    release_manifest = descriptor.get("manifestHash")
    expected_manifest = os.environ.get("CCA_STUDIO_MANIFEST_HASH")
    schema_min = descriptor.get("supportedSchemaMin", SCHEMA_VERSION)
    schema_max = descriptor.get("supportedSchemaMax", SCHEMA_VERSION)
    backend_hash = descriptor.get("backendContentSha256")
    expected_backend = os.environ.get("CCA_STUDIO_BACKEND_HASH")
    compatible = app_id == "ccaf-study-studio" and (
        expected_app_id is None or expected_app_id == app_id
    ) and (
        release_manifest is None or release_manifest == store.manifest_hash
    ) and (
        expected_manifest is None or expected_manifest == store.manifest_hash == release_manifest
    ) and (
        expected_backend is None or expected_backend == backend_hash
    ) and type(schema_min) is int and type(schema_max) is int and schema_min <= SCHEMA_VERSION <= schema_max and (
        expected_release is None or descriptor_release is None or expected_release == descriptor_release
    )
    return {
        "appId": app_id,
        "releaseId": release_id,
        "schemaVersion": SCHEMA_VERSION,
        "manifestHash": store.manifest_hash,
        "backendContentSha256": backend_hash,
        "databaseId": store.database_identity(),
        "compatible": compatible,
    }


def _supervisor_token(data_dir: Path) -> str:
    path = data_dir / "supervisor.token"
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        os.fchmod(descriptor, 0o600)
        os.lseek(descriptor, 0, os.SEEK_SET)
        try:
            existing = os.read(descriptor, 512).decode("ascii").strip()
        except UnicodeDecodeError:
            existing = ""
        if 32 <= len(existing) <= 256 and re.fullmatch(r"[A-Za-z0-9_-]+", existing):
            token = existing
        else:
            token = secrets.token_urlsafe(32)
            encoded = token.encode("ascii")
            os.lseek(descriptor, 0, os.SEEK_SET)
            os.ftruncate(descriptor, 0)
            written = 0
            while written < len(encoded):
                written += os.write(descriptor, encoded[written:])
            os.fsync(descriptor)
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)
    return token


def _mac_memory_status() -> dict[str, Any]:
    """Return a cheap guard decision without loading the tutor model."""
    if platform.system() != "Darwin":
        return {"allowed": True, "status": "ready", "reason": None}
    try:
        physical = int(os.sysconf("SC_PHYS_PAGES")) * int(os.sysconf("SC_PAGE_SIZE"))
    except (OSError, ValueError):
        physical = 0
    try:
        result = subprocess.run(
            ["memory_pressure", "-Q"],
            check=False,
            capture_output=True,
            text=True,
            timeout=1.0,
        )
        match = re.search(r"free percentage:\s*(\d+)%", result.stdout, re.IGNORECASE)
        free_percent = int(match.group(1)) if match else None
    except (OSError, subprocess.TimeoutExpired, ValueError):
        free_percent = None
    protected = bool(
        physical
        and physical <= LOW_MEMORY_MAX_BYTES
        and free_percent is not None
        and free_percent < LOW_MEMORY_FREE_PERCENT
    )
    if protected:
        return {
            "allowed": False,
            "status": "protected",
            "reason": f"Local tutor stayed off because this Mac has only {free_percent}% free memory.",
            "freePercent": free_percent,
        }
    return {"allowed": True, "status": "ready", "reason": None, "freePercent": free_percent}


class TutorService:
    def __init__(self, store: StudioStore) -> None:
        self.store = store
        self.lock = asyncio.Lock()
        self.tasks: dict[str, asyncio.Task[Any]] = {}

    async def available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=0.5) as client:
                response = await client.get("http://127.0.0.1:11434/api/tags")
            return response.is_success and any(item.get("name") == OLLAMA_MODEL for item in response.json().get("models", []))
        except (httpx.HTTPError, AttributeError, KeyError, TypeError, ValueError):
            return False

    async def availability(self) -> dict[str, Any]:
        resource = await asyncio.to_thread(_mac_memory_status)
        if not resource["allowed"]:
            return {**resource, "available": False, "model": OLLAMA_MODEL}
        available = await self.available()
        return {
            **resource,
            "available": available,
            "status": "ready" if available else "unavailable",
            "reason": None if available else "The local tutor model is not installed or Ollama is not running.",
            "model": OLLAMA_MODEL,
        }

    async def turn(self, body: TutorTurnIn) -> dict[str, Any]:
        turn_id = self.store.create_tutor_turn(body.unitId, body.activityId, body.mode, body.learnerText, body.turnId)
        task = asyncio.current_task()
        if task is not None:
            self.tasks[turn_id] = task
        try:
            try:
                async with asyncio.timeout(45.0):
                    async with self.lock:
                        self.store.set_tutor_turn(turn_id, "running")
                        advisory = await self._ask_ollama(body)
            except TimeoutError:
                advisory = {"source": "fallback", **self._fallback(body, "The local tutor timed out, so it was unloaded and the saved lesson hint was used.")}
            self.store.set_tutor_turn(turn_id, "completed", advisory)
            return {
                "advisory": True,
                "summary": advisory["advice"],
                "nextNudge": advisory["nextQuestion"],
                "sourceIds": ["course:w1"],
                "uncertain": advisory["label"] == "unclear",
                "fallback": advisory["source"] != "ollama",
                "turnId": turn_id,
            }
        except asyncio.CancelledError:
            self.store.set_tutor_turn(turn_id, "cancelled")
            raise
        finally:
            self.tasks.pop(turn_id, None)

    async def cancel(self, turn_id: str) -> bool:
        record = self.store.tutor_turn(turn_id)
        task = self.tasks.get(turn_id)
        if record is None or record["status"] in {"completed", "cancelled"}:
            return False
        self.store.set_tutor_turn(turn_id, "cancelled")
        if task is not None:
            task.cancel()
        return True

    async def shutdown(self) -> None:
        tasks = list(self.tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _ask_ollama(self, body: TutorTurnIn) -> dict[str, Any]:
        resource = await asyncio.to_thread(_mac_memory_status)
        if not resource["allowed"]:
            return {"source": "resource_guard", **self._fallback(body, str(resource["reason"]))}
        schema = {
            "type": "object",
            "additionalProperties": False,
            "required": ["mode", "advice", "nextQuestion", "label"],
            "properties": {
                "mode": {"type": "string", "enum": ["hint", "simplify", "classify"]},
                "advice": {"type": "string", "maxLength": 2000},
                "nextQuestion": {"type": "string", "maxLength": 500},
                "label": {"type": "string", "enum": ["needs_review", "ready_for_human_review", "unclear"]},
            },
        }
        prompt = (
            "You are a local CCA-F study helper. Your answer is advisory only: never score, unlock, "
            "or claim mastery. Give one concise response about W1 files, folders, paths, extensions, and plain text. "
            f"Mode: {body.mode}. Learner text: {body.learnerText or '(none)'}. Return only the requested JSON."
        )
        request = {"model": OLLAMA_MODEL, "stream": False, "format": schema, "keep_alive": 0, "options": {"num_ctx": 2048, "num_predict": 256, "temperature": 0}, "messages": [{"role": "user", "content": prompt}]}
        try:
            async with httpx.AsyncClient(timeout=42.0) as client:
                response = await client.post(OLLAMA_URL, json=request)
                response.raise_for_status()
            parsed = json.loads(response.json()["message"]["content"])
            advice = Advisory.model_validate(parsed).model_dump(mode="json")
            if advice["mode"] != body.mode:
                raise ValueError("mode mismatch")
            return {"source": "ollama", **advice}
        except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            return {"source": "fallback", **self._fallback(body)}

    def _fallback(self, body: TutorTurnIn, reason: str | None = None) -> dict[str, str]:
        advice = {
            "hint": "Start at the final dot: the extension tells you the file type. Then trace the folders before it.",
            "simplify": "A folder holds things. A file is one saved thing. A path is the route to it.",
            "classify": "This needs a human check against the W1 rubric; the server will not use it for mastery.",
        }[body.mode]
        if reason:
            advice = f"{reason} {advice}"
        return {"mode": body.mode, "advice": advice, "nextQuestion": "Which part of /Users/me/study/card.json is the file?", "label": "needs_review"}


def create_app(root: Path | None = None, data_dir: Path | None = None, dist_dir: Path | None = None) -> FastAPI:
    explicit_root = root is not None
    root = (root or Path(__file__).resolve().parents[1]).resolve()
    configured_data = data_dir
    if configured_data is None and not explicit_root and os.environ.get("CCA_STUDIO_DATA_DIR"):
        configured_data = Path(os.environ["CCA_STUDIO_DATA_DIR"]).expanduser()
    configured_dist = dist_dir
    if configured_dist is None and not explicit_root and os.environ.get("CCA_STUDIO_DIST_DIR"):
        configured_dist = Path(os.environ["CCA_STUDIO_DIST_DIR"]).expanduser()
    store = StudioStore(root, configured_data)
    tutor = TutorService(store)
    dist = (configured_dist or (root / "studio" / "dist")).resolve()
    release = _release_identity(root, dist, store)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        await tutor.shutdown()

    app = FastAPI(title="CCA-F Study Studio", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.add_middleware(BodyLimitMiddleware)
    app.state.store = store
    app.state.instance_token = secrets.token_urlsafe(32)
    app.state.supervisor_token = _supervisor_token(store.data_dir)
    app.state.tutor = tutor
    app.state.release = release
    legacy_archive_verified = is_verified_archive(root)

    def require_release() -> None:
        if not app.state.release["compatible"]:
            raise HTTPException(409, "Studio files come from different releases. Restart Study Studio before grading.")

    @app.middleware("http")
    async def local_only(request: Request, call_next: Callable[[Request], Awaitable[Any]]) -> Any:
        host = request.headers.get("host", "")
        if not _host_allowed(host) or not _origin_allowed(request.headers.get("origin"), host):
            return JSONResponse({"detail": "Local requests only"}, status_code=403)
        supervisor = request.url.path.startswith("/api/supervisor/")
        protected = supervisor or (
            request.url.path.startswith("/api/") and request.url.path != "/api/bootstrap"
        ) or request.url.path in {"/my-progress.json", "/__save"}
        if supervisor:
            supplied = request.headers.get("X-CCA-Supervisor", "")
            if not supplied or not hmac.compare_digest(supplied, app.state.supervisor_token):
                return JSONResponse({"detail": "Missing or invalid supervisor token"}, status_code=401)
        elif protected:
            supplied = request.headers.get("X-CCA-Instance", "") or request.cookies.get(INSTANCE_COOKIE, "")
            if not supplied or not hmac.compare_digest(supplied, app.state.instance_token):
                return JSONResponse({"detail": "Missing or invalid X-CCA-Instance"}, status_code=401)
        response = await call_next(request)
        if request.method == "GET" and (
            request.url.path in {"/api/bootstrap", "/legacy", "/legacy/"}
            or request.url.path.startswith("/legacy/")
        ):
            response.set_cookie(INSTANCE_COOKIE, app.state.instance_token, httponly=True, samesite="strict", path="/")
        response.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api/") or request.url.path in {"/my-progress.json", "/__save"} else response.headers.get("Cache-Control", "no-cache")
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=(self)"
        if request.url.path.startswith("/legacy/"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; "
                "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; media-src 'self' blob: https:; "
                "frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self'"
            )
        else:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; "
                "script-src 'self'; style-src 'self'; img-src 'self' data:; "
                "media-src 'self' blob:; connect-src 'self'"
            )
        return response

    @app.get("/api/bootstrap")
    async def bootstrap() -> dict[str, Any]:
        availability = await app.state.tutor.availability()
        return {
            "instanceToken": app.state.instance_token,
            "mode": "local",
            "ollama": availability,
            **app.state.release,
        }

    @app.get("/api/session/current")
    def current_session() -> dict[str, Any]:
        return store.current_session()

    @app.post("/api/attempts")
    def attempts(body: AttemptIn) -> dict[str, Any]:
        require_release()
        try:
            session, outcome = store.record_attempt(
                body.unitId,
                body.stage,
                body.confidence,
                body.payload,
                attempt_id=body.attemptId,
                client_state_version=body.clientStateVersion,
                manifest_hash=body.manifestHash,
            )
        except AttemptConflict as error:
            raise HTTPException(409, str(error)) from error
        return {"session": session, **outcome}

    @app.get("/api/attempts/{attempt_id}")
    def attempt_receipt(attempt_id: str) -> dict[str, Any]:
        receipt = store.attempt_receipt(attempt_id)
        if receipt is None:
            raise HTTPException(404, "Attempt receipt not found")
        return receipt

    @app.post("/api/tutor/turn")
    async def tutor_turn(body: TutorTurnIn) -> dict[str, Any]:
        try:
            return await app.state.tutor.turn(body)
        except ValueError as error:
            raise HTTPException(409, str(error)) from error

    @app.post("/api/tutor/cancel/{turn_id}")
    async def cancel_tutor_turn(turn_id: str) -> dict[str, Any]:
        return {"id": turn_id, "cancelled": await app.state.tutor.cancel(turn_id)}

    @app.post("/api/reviews/prepare")
    def prepare_review(body: ReviewPrepareIn = ReviewPrepareIn()) -> dict[str, Any]:
        require_release()
        review = store.prepare_review(body.unitId)
        return {"prepared": True, "reviewId": review["id"]}

    @app.get("/api/reviews/pending")
    def pending_reviews() -> dict[str, Any]:
        return {"reviews": store.pending_reviews("quiz", due_only=True)}

    @app.post("/api/reviews/{review_id}/cards/{card_id}")
    def rate_review_card(review_id: str, card_id: str, body: ReviewCardRatingIn) -> dict[str, Any]:
        require_release()
        try:
            return store.rate_review_card(review_id, card_id, body.rating, body.elapsedMs, body.ratingId)
        except ReviewConflict as error:
            raise HTTPException(409, str(error)) from error

    @app.get("/api/backups/export")
    def export_backup() -> FileResponse:
        archive, _ = store.export_backup()
        return FileResponse(
            archive,
            media_type="application/zip",
            filename=archive.name,
            headers={"Cache-Control": "no-store"},
        )

    @app.post("/api/backups/import/inspect")
    async def inspect_backup(request: Request) -> dict[str, Any]:
        content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if content_type not in {"application/octet-stream", "application/zip", "application/x-zip-compressed"}:
            raise HTTPException(415, "Expected a CCA-F backup archive")
        try:
            return store.inspect_backup(await request.body())
        except BackupValidationError as error:
            raise HTTPException(400, str(error)) from error

    @app.post("/api/backups/import/commit")
    def commit_backup(body: BackupCommitIn) -> dict[str, Any]:
        require_release()
        try:
            result = store.commit_backup_import(body.importToken)
        except BackupValidationError as error:
            raise HTTPException(400, str(error)) from error
        app.state.release = _release_identity(root, dist, store)
        return result

    @app.get("/api/migration/report")
    def migration_report() -> dict[str, Any]:
        return store.migration_report()

    @app.post("/api/migration/legacy/commit")
    def commit_legacy_import(body: LegacyImportCommitIn) -> dict[str, Any]:
        require_release()
        try:
            return store.commit_legacy_import(body.sourceSha256)
        except LegacyImportConflict as error:
            raise HTTPException(409, str(error)) from error

    @app.post("/api/content-gaps")
    def content_gap(body: ContentGapIn) -> dict[str, Any]:
        proposal = store.create_proposal(
            "content_gap",
            {"unitId": body.unitId, "activityId": body.activityId, "gap": body.note, "source": "learner"},
        )
        return {"recorded": True, "proposal": proposal}

    @app.get("/api/frontier/inbox")
    def frontier_inbox() -> dict[str, Any]:
        return {"items": store.frontier_inbox()}

    @app.get("/api/frontier/inbox/{proposal_id}")
    def frontier_item(proposal_id: str) -> dict[str, Any]:
        item = store.frontier_item(proposal_id)
        if item is None:
            raise HTTPException(404, "Frontier item not found")
        return {"item": item}

    @app.get("/api/supervisor/session")
    def supervisor_session() -> dict[str, Any]:
        return {"session": store.current_session(), "release": _release_identity(root, dist, store)}

    @app.get("/api/supervisor/reviews")
    def supervisor_reviews(review_id: str | None = None) -> dict[str, Any]:
        return {"review": store.review_packet(review_id)}

    @app.post("/api/supervisor/frontier-reviews")
    def supervisor_frontier_review(body: FrontierReviewIn) -> dict[str, Any]:
        result = store.record_frontier_review(body.unitId, body.notes, body.verdict, body.reviewId)
        if result is None:
            raise HTTPException(409, "No matching pending review packet")
        return {"review": result}

    @app.post("/api/supervisor/proposals")
    def supervisor_proposal(body: SupervisorProposalIn) -> dict[str, Any]:
        encoded_size = len(json.dumps(body.payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))
        if encoded_size > 20_000:
            raise HTTPException(413, "Proposal is too large")
        return {"proposal": store.create_proposal(body.kind, body.payload)}

    @app.post("/api/proposals/{proposal_id}/decision")
    def proposal_decision(proposal_id: str, body: ProposalDecisionIn) -> dict[str, Any]:
        proposal = store.decide_proposal(proposal_id, body.decision, body.note)
        if proposal is None:
            raise HTTPException(404, "Proposal not found")
        if not proposal["changed"]:
            raise HTTPException(409, "Proposal already decided")
        return {"proposal": proposal}

    @app.get("/__health")
    def health() -> dict[str, Any]:
        sqlite_ok = store.health_check()
        identity = _release_identity(root, dist, store)
        return {
            "ok": sqlite_ok and identity["compatible"],
            "sqlite": sqlite_ok,
            "save": sqlite_ok,
            "quickCheck": "ok" if sqlite_ok else "failed",
            **identity,
        }

    @app.get("/my-progress.json")
    def progress() -> dict[str, Any]:
        return store.progress_snapshot()

    @app.post("/__save")
    async def save(request: Request) -> dict[str, Any]:
        if legacy_archive_verified:
            raise HTTPException(410, "The Week 2-23 archive is read-only")
        if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
            raise HTTPException(415, "Expected application/json")
        try:
            payload = await request.json()
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise HTTPException(400, "Malformed JSON") from error
        if not _valid_legacy_save(payload):
            raise HTTPException(400, "Invalid legacy progress snapshot")
        stored, timestamp = store.save_legacy_snapshot(payload)
        return {"ok": True, "stored": stored, "ts": timestamp}

    @app.get("/legacy/{path:path}")
    def legacy(path: str) -> FileResponse:
        if not legacy_archive_verified:
            raise HTTPException(404, "Legacy archive is unavailable")
        file = _safe_file(root, path)
        if file is None:
            raise HTTPException(404, "Not found")
        return FileResponse(file)

    @app.get("/")
    @app.get("/{path:path}")
    def spa(path: str = "") -> FileResponse:
        if path.startswith(("api/", "legacy/", "__")) or path == "my-progress.json":
            raise HTTPException(404, "Not found")
        requested = _safe_file(dist, path) if path else None
        index = dist / "index.html"
        if requested is not None:
            return FileResponse(requested)
        if index.is_file():
            return FileResponse(index)
        raise HTTPException(404, "Studio SPA build not found")

    return app
