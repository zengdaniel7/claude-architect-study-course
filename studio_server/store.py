from __future__ import annotations

import json
import hashlib
import io
import os
import re
import shutil
import sqlite3
import threading
import time
import uuid
import zipfile
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import fcntl


STAGES = (
    ("learn", "Learn"),
    ("draw", "Draw"),
    ("build", "Build"),
    ("teach", "Teach"),
    ("quiz", "Quiz"),
    ("review", "Review"),
)
W1_TITLE = "Files, folders, and plain text"
SCHEMA_VERSION = 3
BACKUP_FORMAT_VERSION = 1
GRADER_VERSION = "w1-v2"
BACKUP_RETENTION = 7
MAX_BACKUP_EXPANDED_BYTES = 50 * 1024 * 1024
MAX_BACKUP_METADATA_BYTES = 64 * 1024
STATE_TABLES = (
    "metadata",
    "schema_migrations",
    "legacy_imports",
    "legacy_import_provenance",
    "legacy_values",
    "sessions",
    "attempts",
    "evidence",
    "mastery",
    "tutor_turns",
    "reviews",
    "review_card_state",
    "review_card_attempts",
    "proposals",
    "proposal_decisions",
    "frontier_reviews",
    "weekly_plans",
)
KNOWN_LEGACY_KEYS = {
    "ccaf-pipeline",
    "ccaf-steps",
    "ccaf-curriculum",
    "ccaf-quizdone",
    "ccaf-evidence",
    "ccaf-last",
}


class AttemptConflict(RuntimeError):
    """The client retried an ID with different data or stale state."""


class ReviewConflict(RuntimeError):
    """A review rating could not be reconciled safely."""


class BackupValidationError(RuntimeError):
    """A backup archive failed integrity or compatibility checks."""


class LegacyImportConflict(RuntimeError):
    """A legacy import changed after inspection or cannot be applied safely."""


def now() -> str:
    return datetime.now(UTC).isoformat()


def compact(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=True)


def canonical(value: Any) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=True, sort_keys=True).encode("utf-8")


def parse_json(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def parse_strict_json(value: str) -> Any:
    def object_without_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, item in pairs:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = item
        return result

    def reject_constant(value: str) -> None:
        raise ValueError(f"Non-finite JSON number: {value}")

    return json.loads(value, object_pairs_hook=object_without_duplicates, parse_constant=reject_constant)


class StudioStore:
    """Synchronous SQLite store; each request gets its own short-lived connection."""

    def __init__(self, root: Path, data_dir: Path | None = None) -> None:
        self.root = root.resolve()
        manifest_path = Path(__file__).resolve().parents[1] / "studio" / "src" / "content" / "course-manifest.json"
        try:
            manifest_bytes = manifest_path.read_bytes()
            self.manifest = json.loads(manifest_bytes)
            self.quiz_questions = self.manifest["banks"]["w1"]["questions"]
            fallback = self.manifest["cards"]["w1"][0]
            self.fallback_review_card = {
                "id": "w1-fallback",
                "front": f"What is a {str(fallback[0]).lower()}?",
                "back": fallback[1],
                "source": "Lesson concept",
            }
        except (OSError, KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Invalid Studio course manifest: {manifest_path}") from error
        self.manifest_hash = hashlib.sha256(manifest_bytes).hexdigest()
        self.data_dir = (data_dir or (self.root / ".studio-data")).expanduser().resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir.chmod(0o700)
        self.path = self.data_dir / "studio.sqlite3"
        self.backup_dir = self.data_dir / "backups"
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir.chmod(0o700)
        self.import_dir = self.data_dir / "imports"
        self.import_dir.mkdir(parents=True, exist_ok=True)
        self.import_dir.chmod(0o700)
        self.lock_path = self.data_dir / "studio.migration.lock"
        self._write_lock = threading.RLock()
        self._prune_import_staging()
        existed = self.path.is_file()
        self._initialize()
        self.path.chmod(0o600)
        if existed:
            self.create_verified_backup("boot")

    @contextmanager
    def _migration_lock(self):
        with self.lock_path.open("a+b") as handle:
            self.lock_path.chmod(0o600)
            deadline = time.monotonic() + 10.0
            while True:
                try:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Another Study Studio process is updating storage. Close it and try again.")
                    time.sleep(0.05)
            try:
                yield
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 10000")
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    @staticmethod
    def _file_sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    @staticmethod
    def _fsync_directory(path: Path) -> None:
        descriptor = os.open(path, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    @staticmethod
    def _database_status(path: Path) -> tuple[str, int]:
        try:
            with sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10.0) as db:
                quick_check = str(db.execute("PRAGMA quick_check").fetchone()[0])
                version = int(db.execute("PRAGMA user_version").fetchone()[0])
        except sqlite3.DatabaseError as error:
            raise RuntimeError(f"Database could not be verified: {path.name}") from error
        return quick_check, version

    def create_verified_backup(self, label: str) -> Path:
        """Create a standalone, checksum-verified SQLite snapshot."""
        if not self.path.is_file():
            raise RuntimeError("Studio database does not exist yet")
        safe_label = re.sub(r"[^a-zA-Z0-9_-]+", "-", label).strip("-") or "backup"
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
        target = self.backup_dir / f"studio-{safe_label}-{stamp}.sqlite3"
        with self._write_lock:
            with sqlite3.connect(self.path, timeout=10.0) as source:
                source.execute("PRAGMA busy_timeout = 10000")
                source.execute("PRAGMA wal_checkpoint(FULL)")
                source.execute("VACUUM INTO ?", (str(target),))
            quick_check, version = self._database_status(target)
            if quick_check != "ok":
                target.unlink(missing_ok=True)
                raise RuntimeError(f"Backup integrity check failed: {quick_check}")
            target.chmod(0o600)
            with target.open("rb") as handle:
                os.fsync(handle.fileno())
            metadata = {
                "createdAt": now(),
                "label": safe_label,
                "schemaVersion": version,
                "sha256": self._file_sha256(target),
            }
            metadata_path = target.with_suffix(".json")
            with metadata_path.open("x", encoding="utf-8") as handle:
                handle.write(compact(metadata))
                handle.flush()
                os.fsync(handle.fileno())
            metadata_path.chmod(0o600)
            self._fsync_directory(self.backup_dir)
            self._prune_backups()
        return target

    def _prune_backups(self) -> None:
        backups = sorted(self.backup_dir.glob("studio-*.sqlite3"), key=lambda path: path.stat().st_mtime, reverse=True)
        for old in backups[BACKUP_RETENTION:]:
            old.unlink(missing_ok=True)
            old.with_suffix(".json").unlink(missing_ok=True)

    def _prune_import_staging(self) -> None:
        cutoff = datetime.now(UTC).timestamp() - 24 * 60 * 60
        for candidate in self.import_dir.iterdir():
            if candidate.is_file() and candidate.stat().st_mtime < cutoff:
                candidate.unlink(missing_ok=True)

    def _preserve_failed_database(self, reason: str) -> Path:
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
        recovery = self.data_dir / "recovery"
        recovery.mkdir(parents=True, exist_ok=True)
        recovery.chmod(0o700)
        destination = recovery / f"failed-{stamp}"
        destination.mkdir(parents=True, exist_ok=False)
        destination.chmod(0o700)
        for source in (self.path, Path(f"{self.path}-wal"), Path(f"{self.path}-shm")):
            if source.is_file():
                target = destination / source.name
                shutil.copy2(source, target)
                target.chmod(0o600)
        reason_path = destination / "reason.txt"
        reason_path.write_text(reason[:500], encoding="utf-8")
        reason_path.chmod(0o600)
        return destination

    def _initialize(self) -> None:
        with self._migration_lock():
            existed = self.path.is_file()
            version = 0
            if existed:
                try:
                    with self._connect() as check_db:
                        integrity = check_db.execute("PRAGMA quick_check").fetchone()[0]
                        if integrity != "ok":
                            self._preserve_failed_database(f"Pre-migration integrity check failed: {integrity}")
                            raise RuntimeError("Studio database integrity check failed. A recovery copy was preserved.")
                        version = int(check_db.execute("PRAGMA user_version").fetchone()[0])
                except sqlite3.DatabaseError as error:
                    self._preserve_failed_database(f"Database open failed: {type(error).__name__}")
                    raise RuntimeError("Studio database could not be opened. Restore a verified backup before continuing.") from error
            if version > SCHEMA_VERSION:
                raise RuntimeError(f"Studio database schema {version} is newer than supported schema {SCHEMA_VERSION}.")
            if existed and version < SCHEMA_VERSION:
                self.create_verified_backup(f"v{version}")

            try:
                with self._connect() as db:
                    db.execute("PRAGMA journal_mode=WAL")
                    db.execute("BEGIN EXCLUSIVE")
                    self._create_schema(db)
                    self._migrate_schema(db, version)
                    self._seed(db, version)
                    db.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
                    db.execute(
                        "INSERT OR REPLACE INTO schema_migrations VALUES (?, ?, ?)",
                        (SCHEMA_VERSION, "authoritative evidence, durable reviews, and recovery", now()),
                    )
                    db.commit()
            except Exception as error:
                self._preserve_failed_database(f"Schema migration failed: {type(error).__name__}")
                raise RuntimeError("Studio migration failed. The database and verified backup were preserved.") from error

            with self._connect() as db:
                integrity = db.execute("PRAGMA quick_check").fetchone()[0]
                if integrity != "ok":
                    self._preserve_failed_database(f"Post-migration integrity check failed: {integrity}")
                    raise RuntimeError("Studio database failed its post-migration integrity check. A recovery copy was preserved.")

    def _create_schema(self, db: sqlite3.Connection) -> None:
        statements = (
            "CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS legacy_imports (id INTEGER PRIMARY KEY, source_path TEXT NOT NULL, raw_snapshot TEXT NOT NULL, imported_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS legacy_import_provenance (id TEXT PRIMARY KEY, source_kind TEXT NOT NULL, source_path TEXT, source_sha256 TEXT NOT NULL, status TEXT NOT NULL, report_json TEXT NOT NULL, imported_at TEXT NOT NULL, UNIQUE(source_kind, source_sha256))",
            "CREATE TABLE IF NOT EXISTS legacy_values (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS sessions (unit_id TEXT PRIMARY KEY, title TEXT NOT NULL, stage_checks TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, state_version INTEGER NOT NULL DEFAULT 0)",
            "CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, stage TEXT NOT NULL, confidence TEXT, payload_json TEXT NOT NULL, accepted INTEGER NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL, request_hash TEXT, client_state_version INTEGER, manifest_hash TEXT, grader_version TEXT, response_json TEXT)",
            "CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, unit_id TEXT NOT NULL, stage TEXT NOT NULL, evidence_json TEXT NOT NULL, created_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS mastery (unit_id TEXT PRIMARY KEY, level TEXT NOT NULL, reason_json TEXT NOT NULL, updated_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS tutor_turns (id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, activity_id TEXT NOT NULL, mode TEXT NOT NULL, learner_text TEXT, status TEXT NOT NULL, advisory_json TEXT, created_at TEXT NOT NULL, completed_at TEXT)",
            "CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, packet_json TEXT NOT NULL, due_at TEXT NOT NULL, completed_at TEXT, source TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS review_card_state (review_id TEXT NOT NULL, card_id TEXT NOT NULL, queue_position INTEGER NOT NULL, status TEXT NOT NULL, repetitions INTEGER NOT NULL DEFAULT 0, last_rating TEXT, prior_interval_days INTEGER NOT NULL DEFAULT 0, next_due_at TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(review_id, card_id))",
            "CREATE TABLE IF NOT EXISTS review_card_attempts (id TEXT PRIMARY KEY, review_id TEXT NOT NULL, card_id TEXT NOT NULL, rating TEXT NOT NULL, elapsed_ms INTEGER NOT NULL, request_hash TEXT NOT NULL, response_json TEXT, created_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL, decision_note TEXT, created_at TEXT NOT NULL, decided_at TEXT)",
            "CREATE TABLE IF NOT EXISTS proposal_decisions (id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL UNIQUE, decision TEXT NOT NULL, note TEXT, decided_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS frontier_reviews (id TEXT PRIMARY KEY, review_id TEXT NOT NULL, unit_id TEXT NOT NULL, notes TEXT NOT NULL, verdict TEXT NOT NULL, created_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS weekly_plans (week_id TEXT PRIMARY KEY, top_three_json TEXT NOT NULL, carryover_json TEXT NOT NULL, estimated_finish TEXT, updated_at TEXT NOT NULL)",
        )
        for statement in statements:
            db.execute(statement)

    def _migrate_schema(self, db: sqlite3.Connection, version: int) -> None:
        if version >= SCHEMA_VERSION:
            return
        additions = {
            "sessions": (("state_version", "INTEGER NOT NULL DEFAULT 0"),),
            "attempts": (
                ("request_hash", "TEXT"),
                ("client_state_version", "INTEGER"),
                ("manifest_hash", "TEXT"),
                ("grader_version", "TEXT"),
                ("response_json", "TEXT"),
            ),
            "review_card_attempts": (("response_json", "TEXT"),),
        }
        for table, columns in additions.items():
            existing = {row["name"] for row in db.execute(f"PRAGMA table_info({table})")}
            for name, definition in columns:
                if name not in existing:
                    db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")

    def _seed(self, db: sqlite3.Connection, previous_version: int) -> None:
        if db.execute("SELECT 1 FROM metadata WHERE key = 'legacy_imported'").fetchone() is None:
            self._import_legacy(db, apply_progress=previous_version > 0)
        if db.execute("SELECT 1 FROM metadata WHERE key = 'database_id'").fetchone() is None:
            db.execute("INSERT INTO metadata (key, value) VALUES ('database_id', ?)", (str(uuid.uuid4()),))
        if db.execute("SELECT 1 FROM sessions WHERE unit_id = 'w1'").fetchone() is None:
            checks = self._legacy_w1_checks(db)
            timestamp = now()
            db.execute(
                "INSERT INTO sessions (unit_id, title, stage_checks, created_at, updated_at, state_version) VALUES (?, ?, ?, ?, ?, 0)",
                ("w1", W1_TITLE, compact(checks), timestamp, timestamp),
            )
        if db.execute("SELECT 1 FROM mastery WHERE unit_id = 'w1'").fetchone() is None:
            checks = self._checks(db)
            db.execute(
                "INSERT INTO mastery VALUES (?, ?, ?, ?)",
                ("w1", self._mastery_level(checks), compact({"stageChecks": checks}), now()),
            )
        if db.execute("SELECT 1 FROM weekly_plans WHERE week_id = 'current'").fetchone() is None:
            db.execute(
                "INSERT INTO weekly_plans VALUES (?, ?, ?, NULL, ?)",
                (
                    "current",
                    compact([
                        "Finish the current W1 step",
                        "Create tiny-order.json independently",
                        "Explain the path in your own words",
                    ]),
                    "[]",
                    now(),
                ),
            )
        checks = self._checks(db)
        if checks[4] and not checks[5] and db.execute(
            "SELECT 1 FROM reviews WHERE unit_id = 'w1' AND source = 'quiz' AND completed_at IS NULL"
        ).fetchone() is None:
            self._insert_quiz_review(db, [self.fallback_review_card])
        seen_pending: set[tuple[str, str]] = set()
        for row in db.execute(
            "SELECT id, unit_id, source FROM reviews WHERE completed_at IS NULL ORDER BY due_at DESC, id DESC"
        ).fetchall():
            key = (row["unit_id"], row["source"])
            if key in seen_pending:
                db.execute("UPDATE reviews SET completed_at = ? WHERE id = ?", (now(), row["id"]))
            else:
                seen_pending.add(key)
        for row in db.execute(
            "SELECT id, packet_json, due_at FROM reviews WHERE source = 'quiz' AND completed_at IS NULL"
        ).fetchall():
            packet = parse_json(row["packet_json"], {})
            self._ensure_review_cards(db, row["id"], packet, row["due_at"])
        for row in db.execute(
            "SELECT id, status, decision_note, decided_at FROM proposals WHERE status IN ('accepted', 'rejected')"
        ).fetchall():
            db.execute(
                """
                INSERT OR IGNORE INTO proposal_decisions (id, proposal_id, decision, note, decided_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), row["id"], row["status"], row["decision_note"], row["decided_at"] or now()),
            )
        db.execute("DROP INDEX IF EXISTS one_pending_review_per_source")
        db.execute("CREATE INDEX IF NOT EXISTS attempts_latest_quiz ON attempts(unit_id, stage, accepted, created_at DESC)")
        db.execute("CREATE INDEX IF NOT EXISTS reviews_due ON reviews(source, completed_at, due_at)")
        db.execute("CREATE INDEX IF NOT EXISTS review_card_queue ON review_card_state(review_id, status, queue_position)")

    def _import_legacy(self, db: sqlite3.Connection, *, apply_progress: bool) -> None:
        source = self.root / "my-progress.json"
        source_found = source.is_file() and not source.is_symlink()
        try:
            raw = source.read_text(encoding="utf-8") if source_found else "{}"
        except (OSError, UnicodeDecodeError):
            raw = "{}"
            source_found = False
        try:
            parsed = json.loads(raw)
            data = parsed.get("data", {}) if isinstance(parsed, dict) else {}
            data = data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            parsed, data = {}, {}
        db.execute(
            "INSERT INTO legacy_imports (source_path, raw_snapshot, imported_at) VALUES (?, ?, ?)",
            (str(source), raw, now()),
        )
        if apply_progress:
            for key, value in data.items():
                if isinstance(key, str) and key.startswith("ccaf-") and isinstance(value, str):
                    db.execute("INSERT OR REPLACE INTO legacy_values VALUES (?, ?)", (key, value))
        mapping = {
            "pipeline": data.get("ccaf-pipeline"),
            "steps": data.get("ccaf-steps"),
            "curriculum": data.get("ccaf-curriculum"),
            "quizDone": data.get("ccaf-quizdone"),
            "evidence": data.get("ccaf-evidence"),
            "last": data.get("ccaf-last"),
        }
        db.execute("INSERT INTO metadata VALUES (?, ?)", ("legacy_known_mapping", compact(mapping)))
        imported = source_found and apply_progress
        db.execute("INSERT INTO metadata VALUES (?, ?)", ("legacy_imported", "true" if imported else "false"))
        db.execute("INSERT INTO metadata VALUES (?, ?)", ("legacy_snapshot", raw))
        ccaf_keys = sorted(key for key in data if isinstance(key, str) and key.startswith("ccaf-"))
        candidate_values = {
            key: value for key, value in data.items()
            if isinstance(key, str) and isinstance(value, str) and key.startswith("ccaf-")
        }
        report = {
            "sourceFound": source_found,
            "sourceSha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
            "rawBytes": len(raw.encode("utf-8")),
            "ccafKeysFound": len(ccaf_keys),
            "ccafKeysImported": len(ccaf_keys) if imported else 0,
            "knownKeys": sorted(key for key in ccaf_keys if key in KNOWN_LEGACY_KEYS),
            "unknownKeysPreserved": sorted(key for key in ccaf_keys if key not in KNOWN_LEGACY_KEYS),
            "sourceUnchanged": True,
            "status": "imported" if imported else ("pending_confirmation" if source_found else "not_found"),
            "w1CandidateChecks": self._legacy_checks_from_values(candidate_values),
        }
        db.execute("INSERT INTO metadata VALUES (?, ?)", ("legacy_migration_report", compact(report)))
        db.execute(
            """
            INSERT OR IGNORE INTO legacy_import_provenance
                (id, source_kind, source_path, source_sha256, status, report_json, imported_at)
            VALUES (?, 'legacy_progress_file', ?, ?, ?, ?, ?)
            """,
            (str(uuid.uuid4()), str(source), report["sourceSha256"], report["status"], compact(report), now()),
        )

    def _legacy_w1_checks(self, db: sqlite3.Connection) -> list[bool]:
        values = {row["key"]: row["value"] for row in db.execute("SELECT key, value FROM legacy_values")}
        return self._legacy_checks_from_values(values)

    @staticmethod
    def _legacy_checks_from_values(values: dict[str, str]) -> list[bool]:
        checks: list[Any] = []
        for key in ("ccaf-steps", "ccaf-pipeline"):
            try:
                payload = json.loads(values.get(key, "{}"))
            except json.JSONDecodeError:
                continue
            if key == "ccaf-steps":
                payload = payload.get("w1", {}) if isinstance(payload, dict) else {}
            if key == "ccaf-pipeline" and (not isinstance(payload, dict) or payload.get("unit") != "w1"):
                continue
            candidate = payload.get("checks", []) if isinstance(payload, dict) else []
            if isinstance(candidate, list) and len(candidate) == 5:
                checks = candidate
                break
        # Legacy records contain five non-quiz steps. Only a contiguous prefix
        # seeds the Studio; later legacy flags never bypass server progression.
        legacy = [bool(value) for value in checks] + [False] * (5 - len(checks))
        staged = [legacy[0], legacy[1], legacy[2], legacy[3], False, legacy[4]]
        prefix = 0
        while prefix < len(staged) and staged[prefix]:
            prefix += 1
        return [index < prefix for index in range(len(STAGES))]

    def _checks(self, db: sqlite3.Connection) -> list[bool]:
        row = db.execute("SELECT stage_checks FROM sessions WHERE unit_id = 'w1'").fetchone()
        checks = json.loads(row["stage_checks"]) if row else []
        return [bool(value) for value in checks[: len(STAGES)]] + [False] * max(0, len(STAGES) - len(checks))

    def _insert_quiz_review(
        self,
        db: sqlite3.Connection,
        cards: list[dict[str, Any]],
        due_at: str | None = None,
        interval_days: int = 0,
    ) -> str:
        review_id = str(uuid.uuid4())
        packet = {"unitId": "w1", "cards": cards, "intervalDays": interval_days, "advisoryOnly": False}
        db.execute(
            "INSERT INTO reviews (id, unit_id, packet_json, due_at, completed_at, source) VALUES (?, 'w1', ?, ?, NULL, 'quiz')",
            (review_id, compact(packet), due_at or now()),
        )
        self._ensure_review_cards(db, review_id, packet, due_at or now())
        return review_id

    def _ensure_review_cards(
        self,
        db: sqlite3.Connection,
        review_id: str,
        packet: dict[str, Any],
        due_at: str,
    ) -> None:
        cards = packet.get("cards", []) if isinstance(packet, dict) else []
        interval = packet.get("intervalDays", 0) if isinstance(packet, dict) else 0
        interval = interval if type(interval) is int and interval >= 0 else 0
        for position, card in enumerate(cards if isinstance(cards, list) else []):
            if not isinstance(card, dict):
                continue
            card_id = card.get("id")
            if not isinstance(card_id, str) or not card_id:
                card_id = f"{review_id}-{position}"
                card["id"] = card_id
            status = "pending" if due_at <= now() else "scheduled"
            db.execute(
                """
                INSERT OR IGNORE INTO review_card_state
                    (review_id, card_id, queue_position, status, repetitions, last_rating,
                     prior_interval_days, next_due_at, updated_at)
                VALUES (?, ?, ?, ?, 0, NULL, ?, ?, ?)
                """,
                (review_id, card_id, position, status, interval, due_at, now()),
            )

    def _mastery_level(self, checks: list[bool]) -> str:
        if all(checks):
            return "mastered"
        return "practiced" if any(checks) else "seen"

    def current_session(self) -> dict[str, Any]:
        with self._connect() as db:
            return self._session_from_db(db)

    def _session_from_db(self, db: sqlite3.Connection) -> dict[str, Any]:
        checks = self._checks(db)
        session_row = db.execute("SELECT state_version FROM sessions WHERE unit_id = 'w1'").fetchone()
        imported = db.execute("SELECT value FROM metadata WHERE key = 'legacy_imported'").fetchone()
        due = int(db.execute(
            """
            SELECT COUNT(*)
            FROM review_card_state AS cards
            JOIN reviews ON reviews.id = cards.review_id
            WHERE reviews.source = 'quiz' AND reviews.completed_at IS NULL
              AND cards.status IN ('pending', 'scheduled')
              AND cards.next_due_at <= ?
            """,
            (now(),),
        ).fetchone()[0])
        plan = db.execute("SELECT top_three_json FROM weekly_plans WHERE week_id = 'current'").fetchone()
        first_open = next((index for index, done in enumerate(checks) if not done), len(STAGES))
        stages = [
            {"id": stage_id, "label": label, "status": "complete" if checks[index] else ("current" if index == first_open else "upcoming")}
            for index, (stage_id, label) in enumerate(STAGES)
        ]
        complete = first_open == len(STAGES)
        return {
            "unitId": "w1",
            "title": W1_TITLE,
            "stage": STAGES[first_open][0] if not complete else "review",
            "stageIndex": first_open if not complete else len(STAGES) - 1,
            "stages": stages,
            "progressPercent": round(sum(checks) * 100 / len(STAGES)),
            "dueReviews": due,
            "weeklyTopThree": json.loads(plan["top_three_json"]) if plan else [],
            "legacyImported": bool(imported and imported["value"] == "true"),
            "mastery": self._mastery_level(checks),
            "stateVersion": int(session_row["state_version"]) if session_row else 0,
            "manifestHash": self.manifest_hash,
        }

    def record_attempt(
        self,
        unit_id: str,
        stage: str,
        confidence: str | None,
        payload: dict[str, Any],
        *,
        attempt_id: str | None = None,
        client_state_version: int | None = None,
        manifest_hash: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        attempt_id = attempt_id or str(uuid.uuid4())
        request_document = {
            "unitId": unit_id,
            "stage": stage,
            "confidence": confidence,
            "payload": payload,
            "clientStateVersion": client_state_version,
            "manifestHash": manifest_hash,
        }
        request_hash = hashlib.sha256(canonical(request_document)).hexdigest()

        with self._write_lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT request_hash, response_json FROM attempts WHERE id = ?",
                (attempt_id,),
            ).fetchone()
            if existing is not None:
                if existing["request_hash"] != request_hash:
                    raise AttemptConflict("attemptId was already used with different evidence")
                saved = parse_json(existing["response_json"], None)
                if not isinstance(saved, dict) or not isinstance(saved.get("session"), dict):
                    raise AttemptConflict("The saved attempt receipt is unavailable")
                saved = {**saved, "replayed": True}
                return saved["session"], {key: value for key, value in saved.items() if key != "session"}

            if manifest_hash is not None and manifest_hash != self.manifest_hash:
                raise AttemptConflict("Course version changed. Reload Study Studio before saving this work.")
            session_row = db.execute(
                "SELECT state_version FROM sessions WHERE unit_id = ?",
                (unit_id,),
            ).fetchone()
            if session_row is None:
                raise AttemptConflict("Study session was not found")
            state_version = int(session_row["state_version"])
            if client_state_version is not None and client_state_version != state_version:
                raise AttemptConflict(
                    f"Saved progress is newer than this page (server {state_version}, client {client_state_version})."
                )

            checks = self._checks(db)
            current_index = next((index for index, done in enumerate(checks) if not done), len(STAGES))
            expected = STAGES[current_index][0] if current_index < len(STAGES) else None
            passed, result = self._score(stage, payload, db)
            maintenance_review = expected is None and stage == "review" and passed
            accepted = passed and (stage == expected or maintenance_review)
            if accepted:
                if not maintenance_review:
                    checks[current_index] = True
                if stage == "quiz":
                    db.execute(
                        "UPDATE reviews SET completed_at = ? WHERE unit_id = ? AND source = 'quiz' AND completed_at IS NULL",
                        (now(), unit_id),
                    )
                    cards = result.get("reviewCards") or [self.fallback_review_card]
                    self._insert_quiz_review(db, cards)
                state_version += 1
                db.execute(
                    "UPDATE sessions SET stage_checks = ?, updated_at = ?, state_version = ? WHERE unit_id = ?",
                    (compact(checks), now(), state_version, unit_id),
                )

            result.update({
                "passed": accepted,
                "expectedStage": expected,
                "mastered": all(checks),
                "maintenance": maintenance_review,
                "graderVersion": GRADER_VERSION,
            })
            feedback = self._feedback(stage, expected, accepted, result)
            session = self._session_from_db(db)
            response = {
                "session": session,
                "feedback": feedback,
                "result": result,
                "attemptId": attempt_id,
                "stateVersion": state_version,
                "manifestHash": self.manifest_hash,
                "graderVersion": GRADER_VERSION,
                "replayed": False,
            }
            db.execute(
                """
                INSERT INTO attempts
                    (id, unit_id, stage, confidence, payload_json, accepted, result_json,
                     created_at, request_hash, client_state_version, manifest_hash,
                     grader_version, response_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    attempt_id,
                    unit_id,
                    stage,
                    confidence,
                    compact(payload),
                    int(accepted),
                    compact(result),
                    now(),
                    request_hash,
                    client_state_version,
                    manifest_hash or self.manifest_hash,
                    GRADER_VERSION,
                    compact(response),
                ),
            )
            if accepted:
                evidence = {
                    "raw": payload,
                    "objectiveChecks": result.get("objectiveChecks"),
                    "selfAttestations": result.get("selfAttestations"),
                }
                db.execute(
                    "INSERT INTO evidence (id, attempt_id, unit_id, stage, evidence_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (str(uuid.uuid4()), attempt_id, unit_id, stage, compact(evidence), now()),
                )
            db.execute(
                "INSERT OR REPLACE INTO mastery (unit_id, level, reason_json, updated_at) VALUES (?, ?, ?, ?)",
                (unit_id, self._mastery_level(checks), compact({"stageChecks": checks, "lastAttemptId": attempt_id}), now()),
            )
        return session, {key: value for key, value in response.items() if key != "session"}

    def attempt_receipt(self, attempt_id: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute("SELECT response_json FROM attempts WHERE id = ?", (attempt_id,)).fetchone()
        saved = parse_json(row["response_json"], None) if row is not None else None
        return saved if isinstance(saved, dict) else None

    def _score(self, stage: str, payload: dict[str, Any], db: sqlite3.Connection) -> tuple[bool, dict[str, Any]]:
        if stage == "learn":
            return payload.get("understoodPath") is True or payload.get("completed") is True, {"requirement": "Point to the folders, file, and extension."}
        if stage == "draw":
            description_value = payload.get("description")
            description = description_value.strip() if isinstance(description_value, str) else ""
            strokes = payload.get("strokeCount", 0)
            return (type(strokes) is int and strokes > 0) or len(description) >= 20, {"requirement": "Add one drawn stroke or a 20-character path description."}
        if stage == "build":
            path_value = payload.get("path")
            file_text = payload.get("fileText")
            path = path_value.strip() if isinstance(path_value, str) else ""
            parsed_file: Any = None
            if isinstance(file_text, str) and "\x00" not in file_text and not file_text.lstrip().startswith("{\\rtf"):
                try:
                    parsed_file = parse_strict_json(file_text)
                except (json.JSONDecodeError, ValueError):
                    parsed_file = None
            content_valid = (
                isinstance(parsed_file, dict)
                and isinstance(parsed_file.get("item"), str)
                and bool(parsed_file["item"].strip())
                and type(parsed_file.get("quantity")) is int
                and parsed_file["quantity"] > 0
            )
            objective = {
                "exactFileName": payload.get("fileName") == "tiny-order.json",
                "pathEndsWithFile": path.replace("\\", "/").endswith("/tiny-order.json"),
                "validPlainTextJson": parsed_file is not None,
                "requiredOrderFields": content_valid,
            }
            passed = all(objective.values())
            return passed, {
                "requirement": "Choose tiny-order.json with valid plain-text JSON, the item and quantity fields, and its full path.",
                "objectiveChecks": objective,
                "selfAttestations": {
                    "usedPlainTextMode": payload.get("plainText") is True,
                    "workedIndependently": payload.get("independent") is True,
                    "practiceCheckPassed": payload.get("practiceValid") is True,
                },
            }
        if stage == "teach":
            words_value = payload.get("words")
            words = words_value.strip() if isinstance(words_value, str) else ""
            objective = {
                "minimumLength": len(words) >= 60,
                "file": re.search(r"\bfile\b", words, re.IGNORECASE) is not None,
                "folder": re.search(r"\bfolder\b", words, re.IGNORECASE) is not None,
                "path": re.search(r"\bpath\b|/users/", words, re.IGNORECASE) is not None,
                "plainTextOrExtension": re.search(r"extension|plain[ -]?text|\.json", words, re.IGNORECASE) is not None,
            }
            return all(objective.values()), {
                "requirement": "Explain file, folder, path, and extension or plain text in at least 60 characters.",
                "objectiveChecks": objective,
                "selfAttestations": {
                    "clientRubric": payload.get("rubric"),
                    "audioPracticed": payload.get("audioPracticed") is True,
                },
            }
        if stage == "quiz":
            answers = payload.get("answers")
            total = len(self.quiz_questions)
            requirement = "Answer every question; mastery requires 80%+ with zero guesses."
            if not isinstance(answers, list) or len(answers) != total:
                return False, {"score": 0.0, "correct": 0, "total": total, "guessed": 0, "qualified": False, "requirement": requirement}
            normalized: list[tuple[int, str] | None] = [None] * total
            for answer in answers:
                if type(answer) is not dict or set(answer) != {"choice", "confidence", "questionIndex"}:
                    return False, {"score": 0.0, "correct": 0, "total": total, "guessed": 0, "qualified": False, "requirement": requirement}
                question_index = answer.get("questionIndex")
                choice = answer.get("choice")
                answer_confidence = answer.get("confidence")
                if (
                    type(question_index) is not int
                    or not 0 <= question_index < total
                    or normalized[question_index] is not None
                    or type(choice) is not int
                    or not 0 <= choice < len(self.quiz_questions[question_index]["opts"])
                    or answer_confidence not in {"know", "maybe", "guess"}
                ):
                    return False, {"score": 0.0, "correct": 0, "total": total, "guessed": 0, "qualified": False, "requirement": requirement}
                normalized[question_index] = (choice, answer_confidence)
            correct = 0
            guessed = 0
            review_cards: list[dict[str, Any]] = []
            for question_index, item in enumerate(normalized):
                if item is None:
                    return False, {"score": 0.0, "correct": 0, "total": total, "guessed": 0, "qualified": False, "requirement": requirement}
                choice, answer_confidence = item
                question = self.quiz_questions[question_index]
                is_correct = choice == question["ans"]
                correct += int(is_correct)
                guessed += int(answer_confidence == "guess")
                if not is_correct or answer_confidence == "guess":
                    review_cards.append({
                        "id": f"w1-{question_index}",
                        "front": question["q"],
                        "back": f'{question["opts"][question["ans"]]} — {question["why"]}',
                        "source": "Correct guess" if is_correct else "Missed question",
                    })
            score = correct / total if total else 0.0
            return True, {"score": score, "correct": correct, "total": total, "guessed": guessed, "qualified": score >= 0.8 and guessed == 0, "reviewCards": review_cards, "requirement": requirement}
        if stage == "review":
            review_id = payload.get("reviewId")
            row = db.execute(
                "SELECT id FROM reviews WHERE id = ? AND unit_id = 'w1' AND source = 'quiz'",
                (review_id,),
            ).fetchone() if isinstance(review_id, str) else None
            remaining = 1
            if row is not None:
                remaining = int(db.execute(
                    """
                    SELECT COUNT(*) FROM review_card_state
                    WHERE review_id = ? AND status IN ('pending', 'scheduled') AND next_due_at <= ?
                    """,
                    (review_id, now()),
                ).fetchone()[0])
            return row is not None and remaining == 0, {
                "reviewId": review_id,
                "remainingCards": remaining,
                "requirement": "Save a rating on every card. Again must be repeated before the review can finish.",
            }
        return False, {"requirement": "Unknown stage."}

    def _latest_quiz_qualified(self, db: sqlite3.Connection) -> bool:
        row = db.execute("SELECT result_json FROM attempts WHERE unit_id = 'w1' AND stage = 'quiz' AND accepted = 1 ORDER BY created_at DESC LIMIT 1").fetchone()
        if row is None:
            return False
        result = parse_json(row["result_json"], {})
        return bool(result.get("qualified")) if isinstance(result, dict) else False

    def rate_review_card(
        self,
        review_id: str,
        card_id: str,
        rating: str,
        elapsed_ms: int,
        rating_id: str,
    ) -> dict[str, Any]:
        request_document = {
            "reviewId": review_id,
            "cardId": card_id,
            "rating": rating,
            "elapsedMs": elapsed_ms,
        }
        request_hash = hashlib.sha256(canonical(request_document)).hexdigest()
        with self._write_lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT request_hash, response_json FROM review_card_attempts WHERE id = ?",
                (rating_id,),
            ).fetchone()
            if existing is not None:
                if existing["request_hash"] != request_hash:
                    raise ReviewConflict("ratingId was already used for a different card rating")
                saved = parse_json(existing["response_json"], None)
                if not isinstance(saved, dict):
                    raise ReviewConflict("The saved rating receipt is unavailable")
                return {**saved, "replayed": True}

            review = db.execute(
                """
                SELECT id, packet_json, due_at FROM reviews
                WHERE id = ? AND unit_id = 'w1' AND source = 'quiz' AND completed_at IS NULL
                """,
                (review_id,),
            ).fetchone()
            if review is None:
                raise ReviewConflict("This review is no longer active")
            packet = parse_json(review["packet_json"], {})
            if not isinstance(packet, dict):
                raise ReviewConflict("The saved review packet is damaged")
            self._ensure_review_cards(db, review_id, packet, review["due_at"])
            card = db.execute(
                "SELECT * FROM review_card_state WHERE review_id = ? AND card_id = ?",
                (review_id, card_id),
            ).fetchone()
            if card is None:
                raise ReviewConflict("Card does not belong to this review")
            if card["status"] not in {"pending", "scheduled"} or not card["next_due_at"] or card["next_due_at"] > now():
                raise ReviewConflict("Card is not due yet")

            timestamp = now()
            repetitions = int(card["repetitions"]) + 1
            qualified = self._latest_quiz_qualified(db)
            next_interval = 0
            if rating == "again":
                queue_position = int(db.execute(
                    "SELECT COALESCE(MAX(queue_position), 0) + 1 FROM review_card_state WHERE review_id = ?",
                    (review_id,),
                ).fetchone()[0])
                db.execute(
                    """
                    UPDATE review_card_state
                    SET queue_position = ?, status = 'pending', repetitions = ?, last_rating = 'again',
                        next_due_at = ?, updated_at = ?
                    WHERE review_id = ? AND card_id = ?
                    """,
                    (queue_position, repetitions, timestamp, timestamp, review_id, card_id),
                )
            else:
                prior_interval = int(card["prior_interval_days"])
                next_interval = 2 if rating == "hard" else min(30, max(4, prior_interval * 2))
                next_due = (datetime.now(UTC) + timedelta(days=next_interval)).isoformat()
                next_status = "scheduled" if qualified else "complete"
                db.execute(
                    """
                    UPDATE review_card_state
                    SET status = ?, repetitions = ?, last_rating = ?, prior_interval_days = ?,
                        next_due_at = ?, updated_at = ?
                    WHERE review_id = ? AND card_id = ?
                    """,
                    (next_status, repetitions, rating, next_interval, next_due, timestamp, review_id, card_id),
                )

            remaining = int(db.execute(
                """
                SELECT COUNT(*) FROM review_card_state
                WHERE review_id = ? AND status IN ('pending', 'scheduled') AND next_due_at <= ?
                """,
                (review_id, now()),
            ).fetchone()[0])
            cycle_complete = remaining == 0
            checks = self._checks(db)
            maintenance = all(checks)
            if cycle_complete:
                if qualified:
                    if checks[4] and not checks[5]:
                        checks[5] = True
                    next_due_row = db.execute(
                        "SELECT MIN(next_due_at) FROM review_card_state WHERE review_id = ? AND status = 'scheduled'",
                        (review_id,),
                    ).fetchone()
                    if next_due_row and next_due_row[0]:
                        db.execute("UPDATE reviews SET due_at = ? WHERE id = ?", (next_due_row[0], review_id))
                else:
                    db.execute("UPDATE reviews SET completed_at = ? WHERE id = ?", (timestamp, review_id))
                    if checks[4] and not checks[5]:
                        checks[4] = False
                        checks[5] = False

            state_version = int(db.execute(
                "SELECT state_version FROM sessions WHERE unit_id = 'w1'"
            ).fetchone()[0]) + 1
            db.execute(
                "UPDATE sessions SET stage_checks = ?, state_version = ?, updated_at = ? WHERE unit_id = 'w1'",
                (compact(checks), state_version, timestamp),
            )
            db.execute(
                "INSERT OR REPLACE INTO mastery (unit_id, level, reason_json, updated_at) VALUES ('w1', ?, ?, ?)",
                (self._mastery_level(checks), compact({"stageChecks": checks, "lastReviewRatingId": rating_id}), timestamp),
            )
            session = self._session_from_db(db)
            queue = self._due_review_cards(db, review_id, packet)
            if rating == "again":
                feedback = {
                    "tone": "info",
                    "title": "Again saved",
                    "message": "This card stays in today's queue and will repeat.",
                    "nextAction": "review",
                }
            elif not cycle_complete:
                feedback = {
                    "tone": "success",
                    "title": "Rating saved",
                    "message": "Your next due card is ready.",
                    "nextAction": "review",
                }
            elif qualified:
                feedback = {
                    "tone": "success",
                    "title": "Review saved",
                    "message": f"This card will return in {next_interval} days.",
                    "nextAction": "archive" if not maintenance else "home",
                }
            else:
                feedback = {
                    "tone": "repair",
                    "title": "Review saved; retake the quiz",
                    "message": "The guessed or missed idea is reviewed. A zero-guess quiz is the next step.",
                    "nextAction": "quiz",
                }
            response = {
                "ratingId": rating_id,
                "reviewId": review_id,
                "cardId": card_id,
                "rating": rating,
                "repeat": rating == "again",
                "reviewComplete": cycle_complete,
                "remaining": remaining,
                "nextIntervalDays": next_interval or None,
                "queue": queue,
                "session": session,
                "feedback": feedback,
                "stateVersion": state_version,
                "replayed": False,
            }
            db.execute(
                """
                INSERT INTO review_card_attempts
                    (id, review_id, card_id, rating, elapsed_ms, request_hash, response_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (rating_id, review_id, card_id, rating, elapsed_ms, request_hash, compact(response), timestamp),
            )
        return response

    def _due_review_cards(
        self,
        db: sqlite3.Connection,
        review_id: str,
        packet: dict[str, Any],
    ) -> list[dict[str, Any]]:
        cards = packet.get("cards", []) if isinstance(packet, dict) else []
        by_id = {
            card.get("id"): card
            for card in cards
            if isinstance(card, dict) and isinstance(card.get("id"), str)
        }
        rows = db.execute(
            """
            SELECT card_id, repetitions, queue_position FROM review_card_state
            WHERE review_id = ? AND status IN ('pending', 'scheduled') AND next_due_at <= ?
            ORDER BY queue_position, card_id
            """,
            (review_id, now()),
        ).fetchall()
        return [
            {**by_id[row["card_id"]], "repetitions": int(row["repetitions"])}
            for row in rows
            if row["card_id"] in by_id
        ]

    def _feedback(self, stage: str, expected: str | None, accepted: bool, result: dict[str, Any]) -> dict[str, str]:
        if accepted:
            if result.get("maintenance"):
                return {
                    "tone": "success",
                    "title": "Review recorded",
                    "message": f'This card will return in {result.get("nextIntervalDays", 4)} days.',
                    "nextAction": "home",
                }
            next_index = next((index for index, item in enumerate(STAGES) if item[0] == stage), -1) + 1
            if stage == "quiz" and not result.get("qualified", False):
                return {"tone": "repair", "title": "Quiz finished; review is ready", "message": "Your score or guess count is not mastery yet. Review the flagged cards, then retake the quiz.", "nextAction": "review"}
            next_action = "W1 is mastered." if result["mastered"] else (f"Continue with {STAGES[next_index][0]}." if next_index < len(STAGES) else "Finish W1.")
            return {"tone": "success", "title": "Evidence recorded", "message": "This stage passed the deterministic W1 rule.", "nextAction": next_action}
        if expected is not None and stage != expected:
            return {"tone": "info", "title": "Stage is locked", "message": f"Complete {expected} before submitting {stage}.", "nextAction": expected}
        return {"tone": "repair", "title": "Try one small repair", "message": result["requirement"], "nextAction": stage}

    def create_tutor_turn(self, unit_id: str, activity_id: str, mode: str, learner_text: str | None, turn_id: str | None = None) -> str:
        turn_id = turn_id or str(uuid.uuid4())
        with self._write_lock, self._connect() as db:
            cursor = db.execute(
                "INSERT OR IGNORE INTO tutor_turns VALUES (?, ?, ?, ?, ?, 'queued', NULL, ?, NULL)",
                (turn_id, unit_id, activity_id, mode, learner_text, now()),
            )
            if cursor.rowcount != 1:
                raise ValueError("Tutor turn ID already exists")
        return turn_id

    def set_tutor_turn(self, turn_id: str, status: str, advisory: dict[str, Any] | None = None) -> None:
        with self._write_lock, self._connect() as db:
            db.execute(
                "UPDATE tutor_turns SET status = ?, advisory_json = ?, completed_at = ? WHERE id = ?",
                (status, compact(advisory) if advisory is not None else None, now() if status != "running" else None, turn_id),
            )

    def tutor_turn(self, turn_id: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM tutor_turns WHERE id = ?", (turn_id,)).fetchone()
        if row is None:
            return None
        return {"id": row["id"], "status": row["status"], "advisory": parse_json(row["advisory_json"], None)}

    def prepare_review(self, unit_id: str, source: str = "learner") -> dict[str, Any]:
        with self._write_lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT * FROM reviews WHERE unit_id = ? AND source = ? AND completed_at IS NULL ORDER BY due_at DESC LIMIT 1",
                (unit_id, source),
            ).fetchone()
            if existing is not None:
                return {
                    "id": existing["id"],
                    "dueAt": existing["due_at"],
                    "packet": parse_json(existing["packet_json"], {}),
                }
            packet = {"unitId": unit_id, "title": W1_TITLE, "prompts": ["Name a file, folder, path, and extension.", "Explain why JSON needs plain text."], "advisoryOnly": True}
            review_id = str(uuid.uuid4())
            db.execute(
                "INSERT INTO reviews (id, unit_id, packet_json, due_at, completed_at, source) VALUES (?, ?, ?, ?, NULL, ?)",
                (review_id, unit_id, compact(packet), now(), source),
            )
        return {"id": review_id, "dueAt": now(), "packet": packet}

    def pending_reviews(self, source: str | None = None, due_only: bool = False) -> list[dict[str, Any]]:
        with self._connect() as db:
            if source is None and due_only:
                rows = db.execute("SELECT * FROM reviews WHERE completed_at IS NULL AND due_at <= ? ORDER BY due_at", (now(),)).fetchall()
            elif source is None:
                rows = db.execute("SELECT * FROM reviews WHERE completed_at IS NULL ORDER BY due_at").fetchall()
            elif due_only:
                rows = db.execute(
                    "SELECT * FROM reviews WHERE source = ? AND completed_at IS NULL AND due_at <= ? ORDER BY due_at",
                    (source, now()),
                ).fetchall()
            else:
                rows = db.execute("SELECT * FROM reviews WHERE source = ? AND completed_at IS NULL ORDER BY due_at", (source,)).fetchall()
            reviews: list[dict[str, Any]] = []
            for row in rows:
                packet = parse_json(row["packet_json"], None)
                if not isinstance(packet, dict):
                    continue
                if row["source"] == "quiz":
                    cards = self._due_review_cards(db, row["id"], packet) if due_only else packet.get("cards", [])
                    if due_only and not cards:
                        continue
                    packet = {**packet, "cards": cards if isinstance(cards, list) else []}
                reviews.append({
                    "id": row["id"],
                    "unitId": row["unit_id"],
                    "dueAt": row["due_at"],
                    "packet": packet,
                    "source": row["source"],
                })
        return reviews

    def review_packet(self, review_id: str | None = None) -> dict[str, Any] | None:
        reviews = [review for review in self.pending_reviews() if review["source"] != "quiz"]
        if review_id is None:
            return reviews[0] if reviews else None
        return next((review for review in reviews if review["id"] == review_id), None)

    def record_frontier_review(self, unit_id: str, notes: str, verdict: str, review_id: str | None = None) -> dict[str, Any] | None:
        with self._write_lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if review_id is None:
                row = db.execute(
                    "SELECT * FROM reviews WHERE unit_id = ? AND source != 'quiz' AND completed_at IS NULL ORDER BY due_at LIMIT 1",
                    (unit_id,),
                ).fetchone()
            else:
                row = db.execute(
                    "SELECT * FROM reviews WHERE id = ? AND unit_id = ? AND source != 'quiz' AND completed_at IS NULL",
                    (review_id, unit_id),
                ).fetchone()
            if row is None or db.execute("SELECT 1 FROM frontier_reviews WHERE review_id = ?", (row["id"],)).fetchone() is not None:
                return None
            frontier_id = str(uuid.uuid4())
            db.execute(
                "INSERT INTO frontier_reviews VALUES (?, ?, ?, ?, ?, ?)",
                (frontier_id, row["id"], unit_id, notes, verdict, now()),
            )
            db.execute("UPDATE reviews SET completed_at = ? WHERE id = ?", (now(), row["id"]))
        return {"id": frontier_id, "reviewId": row["id"], "unitId": unit_id, "advisoryOnly": True}

    def create_proposal(self, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        proposal_id = str(uuid.uuid4())
        with self._write_lock, self._connect() as db:
            db.execute("INSERT INTO proposals VALUES (?, ?, ?, 'pending', NULL, ?, NULL)", (proposal_id, kind, compact(payload), now()))
        return {"id": proposal_id, "kind": kind, "status": "pending"}

    def decide_proposal(self, proposal_id: str, decision: str, note: str | None) -> dict[str, Any] | None:
        with self._write_lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT id, kind, status FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
            if row is None:
                return None
            if row["status"] != "pending" or db.execute(
                "SELECT 1 FROM proposal_decisions WHERE proposal_id = ?", (proposal_id,)
            ).fetchone() is not None:
                return {"id": proposal_id, "kind": row["kind"], "status": row["status"], "note": None, "changed": False}
            decision_id = str(uuid.uuid4())
            decided_at = now()
            db.execute(
                "INSERT INTO proposal_decisions (id, proposal_id, decision, note, decided_at) VALUES (?, ?, ?, ?, ?)",
                (decision_id, proposal_id, decision, note, decided_at),
            )
            db.execute(
                "UPDATE proposals SET status = ?, decision_note = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
                (decision, note, decided_at, proposal_id),
            )
        return {
            "id": proposal_id,
            "decisionId": decision_id,
            "kind": row["kind"],
            "status": decision,
            "note": note,
            "changed": True,
            "advisoryOnly": True,
        }

    def frontier_inbox(self) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute(
                """
                SELECT id, kind, payload_json, status, created_at, decided_at
                FROM proposals ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
                LIMIT 200
                """
            ).fetchall()
        items: list[dict[str, Any]] = []
        for row in rows:
            payload = parse_json(row["payload_json"], {})
            items.append({
                "id": row["id"],
                "kind": row["kind"],
                "summary": self._proposal_summary(row["kind"], payload),
                "status": row["status"],
                "createdAt": row["created_at"],
                "decidedAt": row["decided_at"],
                "advisoryOnly": True,
            })
        return items

    def frontier_item(self, proposal_id: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
            decision = db.execute(
                "SELECT id, decision, note, decided_at FROM proposal_decisions WHERE proposal_id = ?",
                (proposal_id,),
            ).fetchone()
        if row is None:
            return None
        payload = parse_json(row["payload_json"], {})
        return {
            "id": row["id"],
            "kind": row["kind"],
            "summary": self._proposal_summary(row["kind"], payload),
            "payload": payload,
            "status": row["status"],
            "createdAt": row["created_at"],
            "decision": dict(decision) if decision else None,
            "advisoryOnly": True,
        }

    @staticmethod
    def _proposal_summary(kind: str, payload: Any) -> str:
        if isinstance(payload, dict):
            for key in ("gap", "summary", "note", "title"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()[:240]
        return kind.replace("_", " ").capitalize()

    def progress_snapshot(self) -> dict[str, Any]:
        with self._connect() as db:
            row = db.execute("SELECT value FROM metadata WHERE key = 'legacy_snapshot'").fetchone()
        try:
            return json.loads(row["value"]) if row else {}
        except json.JSONDecodeError:
            return {}

    def migration_report(self) -> dict[str, Any]:
        with self._connect() as db:
            row = db.execute("SELECT value FROM metadata WHERE key = 'legacy_migration_report'").fetchone()
        report = parse_json(row["value"], None) if row else None
        return report if isinstance(report, dict) else {"sourceFound": False, "sourceUnchanged": True}

    def commit_legacy_import(self, source_sha256: str) -> dict[str, Any]:
        source = self.root / "my-progress.json"
        with self._write_lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            report_row = db.execute("SELECT value FROM metadata WHERE key = 'legacy_migration_report'").fetchone()
            report = parse_json(report_row["value"], {}) if report_row else {}
            if not isinstance(report, dict) or report.get("sourceSha256") != source_sha256:
                raise LegacyImportConflict("Legacy progress has not been inspected by this Studio database")
            if report.get("status") == "imported":
                return {"imported": True, "changed": False, "report": report, "session": self._session_from_db(db)}
            if not source.is_file() or source.is_symlink():
                raise LegacyImportConflict("The inspected legacy progress file is no longer available")
            try:
                raw_bytes = source.read_bytes()
                raw = raw_bytes.decode("utf-8")
            except (OSError, UnicodeDecodeError) as error:
                raise LegacyImportConflict("Legacy progress could not be read as UTF-8 JSON") from error
            actual_sha = hashlib.sha256(raw_bytes).hexdigest()
            if actual_sha != source_sha256:
                raise LegacyImportConflict("Legacy progress changed after inspection. Inspect it again before importing.")
            try:
                parsed = json.loads(raw)
                data = parsed.get("data", {}) if isinstance(parsed, dict) else {}
            except json.JSONDecodeError as error:
                raise LegacyImportConflict("Legacy progress is not valid JSON") from error
            if not isinstance(data, dict):
                raise LegacyImportConflict("Legacy progress does not contain a valid data object")
            values = {
                key: value for key, value in data.items()
                if isinstance(key, str) and key.startswith("ccaf-") and isinstance(value, str)
            }
            candidate = self._legacy_checks_from_values(values)
            for key, value in values.items():
                db.execute("INSERT OR REPLACE INTO legacy_values (key, value) VALUES (?, ?)", (key, value))
            current = self._checks(db)
            merged = [saved or incoming for saved, incoming in zip(current, candidate)]
            changed = merged != current
            state_version = int(db.execute(
                "SELECT state_version FROM sessions WHERE unit_id = 'w1'"
            ).fetchone()[0]) + int(changed)
            db.execute(
                "UPDATE sessions SET stage_checks = ?, state_version = ?, updated_at = ? WHERE unit_id = 'w1'",
                (compact(merged), state_version, now()),
            )
            report = {
                **report,
                "status": "imported",
                "importedAt": now(),
                "studioStateWonConflicts": True,
                "w1AppliedChecks": merged,
                "laterUnitData": "archival",
                "ccafKeysImported": len(values),
                "sourceUnchanged": True,
            }
            db.execute("UPDATE metadata SET value = 'true' WHERE key = 'legacy_imported'")
            db.execute("UPDATE metadata SET value = ? WHERE key = 'legacy_snapshot'", (raw,))
            db.execute("UPDATE metadata SET value = ? WHERE key = 'legacy_migration_report'", (compact(report),))
            db.execute(
                "UPDATE legacy_import_provenance SET status = 'imported', report_json = ?, imported_at = ? WHERE source_kind = 'legacy_progress_file' AND source_sha256 = ?",
                (compact(report), now(), source_sha256),
            )
            db.execute(
                "INSERT OR REPLACE INTO mastery (unit_id, level, reason_json, updated_at) VALUES ('w1', ?, ?, ?)",
                (self._mastery_level(merged), compact({"stageChecks": merged, "legacyImport": source_sha256}), now()),
            )
            session = self._session_from_db(db)
        return {"imported": True, "changed": changed, "report": report, "session": session}

    @staticmethod
    def _normalized_state_digest(path: Path) -> str:
        normalized: dict[str, list[list[Any]]] = {}
        with sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10.0) as db:
            for table in STATE_TABLES:
                columns = [row[1] for row in db.execute(f"PRAGMA table_info({table})")]
                if not columns:
                    normalized[table] = []
                    continue
                order = ", ".join(str(index) for index in range(1, len(columns) + 1))
                normalized[table] = [list(row) for row in db.execute(f"SELECT * FROM {table} ORDER BY {order}")]
        return hashlib.sha256(compact(normalized).encode("utf-8")).hexdigest()

    @staticmethod
    def _schema_signature(path: Path) -> dict[str, Any]:
        with sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10.0) as db:
            objects = db.execute(
                "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
            ).fetchall()
            tables = {name for kind, name in objects if kind == "table"}
            unexpected_tables = tables - set(STATE_TABLES)
            missing_tables = set(STATE_TABLES) - tables
            executable_objects = [(kind, name) for kind, name in objects if kind in {"trigger", "view"}]
            if unexpected_tables or missing_tables or executable_objects:
                raise BackupValidationError("Backup database schema contains unexpected objects")

            signature: dict[str, Any] = {}
            for table in STATE_TABLES:
                columns = [
                    (str(row[1]), str(row[2]).upper(), int(row[3]), row[4], int(row[5]))
                    for row in db.execute(f'PRAGMA table_info("{table}")')
                ]
                indexes = []
                for row in db.execute(f'PRAGMA index_list("{table}")'):
                    index_name = str(row[1]).replace('"', '""')
                    index_columns = tuple(
                        str(info[2]) for info in db.execute(f'PRAGMA index_info("{index_name}")')
                    )
                    indexes.append((int(row[2]), str(row[3]), int(row[4]), index_columns))
                foreign_keys = [tuple(row) for row in db.execute(f'PRAGMA foreign_key_list("{table}")')]
                signature[table] = {
                    "columns": columns,
                    "indexes": sorted(indexes, key=repr),
                    "foreignKeys": foreign_keys,
                }
        return signature

    def _validate_backup_schema(self, path: Path) -> None:
        candidate = self._schema_signature(path)
        expected = self._schema_signature(self.path)
        if candidate != expected:
            raise BackupValidationError("Backup database schema does not match this Studio release")

    def database_identity(self) -> str:
        with self._connect() as db:
            row = db.execute("SELECT value FROM metadata WHERE key = 'database_id'").fetchone()
        return str(row["value"]) if row else "unknown"

    def export_backup(self) -> tuple[Path, dict[str, Any]]:
        snapshot = self.create_verified_backup("export")
        metadata = {
            "appId": "ccaf-study-studio",
            "formatVersion": BACKUP_FORMAT_VERSION,
            "schemaVersion": SCHEMA_VERSION,
            "manifestHash": self.manifest_hash,
            "databaseId": self._database_id_for_path(snapshot),
            "databaseSha256": self._file_sha256(snapshot),
            "stateDigest": self._normalized_state_digest(snapshot),
            "createdAt": now(),
        }
        archive_path = self.backup_dir / f"ccaf-study-studio-{datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ')}.ccaf-backup"
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            archive.writestr("metadata.json", compact(metadata))
            archive.write(snapshot, "studio.sqlite3")
        archive_path.chmod(0o600)
        with archive_path.open("rb") as handle:
            os.fsync(handle.fileno())
        self._fsync_directory(self.backup_dir)
        archives = sorted(self.backup_dir.glob("*.ccaf-backup"), key=lambda path: path.stat().st_mtime, reverse=True)
        for old in archives[BACKUP_RETENTION:]:
            old.unlink(missing_ok=True)
        return archive_path, metadata

    @staticmethod
    def _database_id_for_path(path: Path) -> str:
        with sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10.0) as db:
            try:
                row = db.execute("SELECT value FROM metadata WHERE key = 'database_id'").fetchone()
            except sqlite3.DatabaseError:
                row = None
        return str(row[0]) if row else "unknown"

    def inspect_backup(self, archive_bytes: bytes) -> dict[str, Any]:
        if not archive_bytes or len(archive_bytes) > 25 * 1024 * 1024:
            raise BackupValidationError("Backup must be between 1 byte and 25 MB")
        token = str(uuid.uuid4())
        staged_database = self.import_dir / f"{token}.sqlite3"
        try:
            with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as archive:
                infos = archive.infolist()
                names = [info.filename for info in infos]
                if sorted(names) != ["metadata.json", "studio.sqlite3"] or len(set(names)) != 2:
                    raise BackupValidationError("Backup contains unexpected files")
                by_name = {info.filename: info for info in infos}
                if (
                    sum(info.file_size for info in infos) > MAX_BACKUP_EXPANDED_BYTES
                    or by_name["metadata.json"].file_size > MAX_BACKUP_METADATA_BYTES
                    or any(info.compress_size > 25 * 1024 * 1024 for info in infos)
                ):
                    raise BackupValidationError("Backup expands beyond the allowed size")
                metadata = parse_strict_json(archive.read("metadata.json").decode("utf-8"))
                database_bytes = archive.read("studio.sqlite3")
        except BackupValidationError:
            raise
        except (zipfile.BadZipFile, zipfile.LargeZipFile, KeyError, OSError, RuntimeError, ValueError, UnicodeDecodeError) as error:
            raise BackupValidationError("Backup archive is malformed") from error
        if not isinstance(metadata, dict):
            raise BackupValidationError("Backup metadata is malformed")
        expected = {
            "appId": "ccaf-study-studio",
            "formatVersion": BACKUP_FORMAT_VERSION,
            "schemaVersion": SCHEMA_VERSION,
            "manifestHash": self.manifest_hash,
        }
        for key, value in expected.items():
            if metadata.get(key) != value:
                raise BackupValidationError(f"Backup {key} is not compatible with this Studio release")
        database_sha = hashlib.sha256(database_bytes).hexdigest()
        if metadata.get("databaseSha256") != database_sha:
            raise BackupValidationError("Backup database checksum does not match")
        with staged_database.open("xb") as handle:
            handle.write(database_bytes)
            handle.flush()
            os.fsync(handle.fileno())
        staged_database.chmod(0o600)
        try:
            quick_check, version = self._database_status(staged_database)
            self._validate_backup_schema(staged_database)
            state_digest = self._normalized_state_digest(staged_database)
            if quick_check != "ok" or version != SCHEMA_VERSION:
                raise BackupValidationError("Backup database failed its integrity or schema check")
            if metadata.get("stateDigest") != state_digest:
                raise BackupValidationError("Backup state digest does not match")
        except Exception:
            staged_database.unlink(missing_ok=True)
            raise
        record = {
            "token": token,
            "databaseSha256": database_sha,
            "stateDigest": state_digest,
            "databaseId": self._database_id_for_path(staged_database),
            "createdAt": now(),
        }
        record_path = self.import_dir / f"{token}.json"
        with record_path.open("x", encoding="utf-8") as handle:
            handle.write(compact(record))
            handle.flush()
            os.fsync(handle.fileno())
        record_path.chmod(0o600)
        self._fsync_directory(self.import_dir)
        return {
            "importToken": token,
            "valid": True,
            "schemaVersion": SCHEMA_VERSION,
            "databaseId": record["databaseId"],
            "stateDigest": state_digest,
            "warning": "Import replaces Studio progress only after you confirm.",
        }

    def commit_backup_import(self, token: str) -> dict[str, Any]:
        if not re.fullmatch(r"[0-9a-f-]{36}", token):
            raise BackupValidationError("Invalid import token")
        record_path = self.import_dir / f"{token}.json"
        staged_database = self.import_dir / f"{token}.sqlite3"
        with self._migration_lock(), self._write_lock:
            if record_path.is_symlink() or staged_database.is_symlink():
                raise BackupValidationError("Import inspection files are not trusted")
            try:
                record_text = record_path.read_text(encoding="utf-8") if record_path.is_file() else None
            except (OSError, UnicodeDecodeError) as error:
                raise BackupValidationError("Import inspection record could not be read") from error
            record = parse_json(record_text, None)
            if not isinstance(record, dict) or not staged_database.is_file():
                raise BackupValidationError("Import inspection expired or was not found")
            try:
                inspected_at = datetime.fromisoformat(str(record["createdAt"]))
                if inspected_at.utcoffset() is None:
                    raise ValueError("timestamp has no timezone")
            except (KeyError, TypeError, ValueError) as error:
                raise BackupValidationError("Import inspection record is malformed") from error
            if (datetime.now(UTC) - inspected_at).total_seconds() > 24 * 60 * 60:
                raise BackupValidationError("Import inspection expired; inspect the backup again")
            expected_sha = record.get("databaseSha256")
            expected_digest = record.get("stateDigest")
            if self._file_sha256(staged_database) != expected_sha:
                raise BackupValidationError("Inspected backup changed before import")

            rollback = self.create_verified_backup("pre-import")
            incoming = self.data_dir / f"studio.incoming-{token}.sqlite3"
            failed = self.import_dir / f"{token}.failed.sqlite3"
            incoming.unlink(missing_ok=True)
            failed.unlink(missing_ok=True)
            try:
                with self._connect() as db:
                    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                shutil.copyfile(staged_database, incoming)
                incoming.chmod(0o600)
                with incoming.open("rb") as handle:
                    os.fsync(handle.fileno())
                if self._file_sha256(incoming) != expected_sha:
                    raise BackupValidationError("Inspected backup changed while it was being imported")
                quick_check, version = self._database_status(incoming)
                self._validate_backup_schema(incoming)
                if (
                    quick_check != "ok"
                    or version != SCHEMA_VERSION
                    or self._normalized_state_digest(incoming) != expected_digest
                ):
                    raise BackupValidationError("Imported database no longer matches its inspection")
                os.replace(incoming, self.path)
                self._fsync_directory(self.data_dir)
                Path(f"{self.path}-wal").unlink(missing_ok=True)
                Path(f"{self.path}-shm").unlink(missing_ok=True)
                self._fsync_directory(self.data_dir)
                quick_check, version = self._database_status(self.path)
                if (
                    quick_check != "ok"
                    or version != SCHEMA_VERSION
                    or self._file_sha256(self.path) != expected_sha
                    or self._normalized_state_digest(self.path) != expected_digest
                ):
                    raise BackupValidationError("Imported database failed verification")
            except Exception as error:
                if self.path.is_file():
                    shutil.copy2(self.path, failed)
                    failed.chmod(0o600)
                shutil.copyfile(rollback, incoming)
                incoming.chmod(0o600)
                with incoming.open("rb") as handle:
                    os.fsync(handle.fileno())
                os.replace(incoming, self.path)
                self._fsync_directory(self.data_dir)
                restored_check, restored_version = self._database_status(self.path)
                if restored_check != "ok" or restored_version != SCHEMA_VERSION:
                    raise RuntimeError("Backup import and automatic rollback both failed") from error
                raise BackupValidationError("Import failed; the previous verified database was restored") from error
            finally:
                incoming.unlink(missing_ok=True)
            record_path.unlink(missing_ok=True)
            staged_database.unlink(missing_ok=True)
            self._fsync_directory(self.import_dir)
        return {
            "imported": True,
            "databaseId": self.database_identity(),
            "stateDigest": self._normalized_state_digest(self.path),
            "rollbackBackup": rollback.name,
        }

    def health_check(self) -> bool:
        try:
            with self._connect() as db:
                return db.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        except sqlite3.DatabaseError:
            return False

    def save_legacy_snapshot(self, payload: dict[str, Any]) -> tuple[bool, float]:
        # Compatibility data is intentionally isolated from Studio mastery.
        with self._write_lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT value FROM metadata WHERE key = 'legacy_snapshot'").fetchone()
            current_timestamp = -1.0
            if row is not None:
                try:
                    current = json.loads(row["value"])
                    timestamp = current.get("ts") if isinstance(current, dict) else None
                    if isinstance(timestamp, (int, float)) and not isinstance(timestamp, bool):
                        current_timestamp = float(timestamp)
                except json.JSONDecodeError:
                    pass
            incoming_timestamp = float(payload["ts"])
            if incoming_timestamp <= current_timestamp:
                return False, current_timestamp
            db.execute("INSERT OR REPLACE INTO metadata VALUES (?, ?)", ("legacy_snapshot", compact(payload)))
        return True, incoming_timestamp
