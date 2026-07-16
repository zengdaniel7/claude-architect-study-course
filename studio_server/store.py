from __future__ import annotations

import json
import hashlib
import sqlite3
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


STAGES = (
    ("learn", "Learn"),
    ("draw", "Draw"),
    ("build", "Build"),
    ("teach", "Teach"),
    ("quiz", "Quiz"),
    ("review", "Review"),
)
W1_TITLE = "Files, folders, and plain text"
SCHEMA_VERSION = 2
KNOWN_LEGACY_KEYS = {
    "ccaf-pipeline",
    "ccaf-steps",
    "ccaf-curriculum",
    "ccaf-quizdone",
    "ccaf-evidence",
    "ccaf-last",
}


def now() -> str:
    return datetime.now(UTC).isoformat()


def compact(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=True)


class StudioStore:
    """Synchronous SQLite store; each request gets its own short-lived connection."""

    def __init__(self, root: Path, data_dir: Path | None = None) -> None:
        self.root = root.resolve()
        manifest_path = Path(__file__).resolve().parents[1] / "studio" / "src" / "content" / "course-manifest.json"
        try:
            self.manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
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
        self.data_dir = (data_dir or (self.root / ".studio-data")).expanduser().resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.path = self.data_dir / "studio.sqlite3"
        self._backup_before_schema_change()
        self._initialize()

    def _backup_before_schema_change(self) -> None:
        if not self.path.is_file():
            return
        try:
            with sqlite3.connect(self.path) as db:
                version = int(db.execute("PRAGMA user_version").fetchone()[0])
        except sqlite3.DatabaseError:
            return
        if version > SCHEMA_VERSION:
            raise RuntimeError(f"Studio database schema {version} is newer than supported schema {SCHEMA_VERSION}.")
        if version == SCHEMA_VERSION:
            return
        backup_dir = self.data_dir / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
        target = backup_dir / f"studio-v{version}-{stamp}.sqlite3"
        with sqlite3.connect(self.path) as source, sqlite3.connect(target) as backup:
            source.backup(backup)
        for old in sorted(backup_dir.glob("studio-*.sqlite3"), reverse=True)[5:]:
            old.unlink(missing_ok=True)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 10000")
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as db:
            db.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS legacy_imports (
                    id INTEGER PRIMARY KEY, source_path TEXT NOT NULL, raw_snapshot TEXT NOT NULL,
                    imported_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS legacy_values (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sessions (
                    unit_id TEXT PRIMARY KEY, title TEXT NOT NULL, stage_checks TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS attempts (
                    id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, stage TEXT NOT NULL,
                    confidence TEXT, payload_json TEXT NOT NULL, accepted INTEGER NOT NULL,
                    result_json TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS evidence (
                    id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, unit_id TEXT NOT NULL,
                    stage TEXT NOT NULL, evidence_json TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS mastery (
                    unit_id TEXT PRIMARY KEY, level TEXT NOT NULL, reason_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS tutor_turns (
                    id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, activity_id TEXT NOT NULL,
                    mode TEXT NOT NULL, learner_text TEXT, status TEXT NOT NULL,
                    advisory_json TEXT, created_at TEXT NOT NULL, completed_at TEXT
                );
                CREATE TABLE IF NOT EXISTS reviews (
                    id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, packet_json TEXT NOT NULL,
                    due_at TEXT NOT NULL, completed_at TEXT, source TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS proposals (
                    id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload_json TEXT NOT NULL,
                    status TEXT NOT NULL, decision_note TEXT, created_at TEXT NOT NULL, decided_at TEXT
                );
                CREATE TABLE IF NOT EXISTS frontier_reviews (
                    id TEXT PRIMARY KEY, review_id TEXT NOT NULL, unit_id TEXT NOT NULL,
                    notes TEXT NOT NULL, verdict TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS weekly_plans (
                    week_id TEXT PRIMARY KEY, top_three_json TEXT NOT NULL,
                    carryover_json TEXT NOT NULL, estimated_finish TEXT,
                    updated_at TEXT NOT NULL
                );
                """
            )
            if db.execute("SELECT 1 FROM metadata WHERE key = 'legacy_imported'").fetchone() is None:
                self._import_legacy(db)
            if db.execute("SELECT 1 FROM sessions WHERE unit_id = 'w1'").fetchone() is None:
                checks = self._legacy_w1_checks(db)
                timestamp = now()
                db.execute(
                    "INSERT INTO sessions VALUES (?, ?, ?, ?, ?)",
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
            db.executescript(
                """
                CREATE INDEX IF NOT EXISTS attempts_latest_quiz
                    ON attempts(unit_id, stage, accepted, created_at DESC);
                CREATE INDEX IF NOT EXISTS reviews_due
                    ON reviews(source, completed_at, due_at);
                CREATE UNIQUE INDEX IF NOT EXISTS one_pending_review_per_source
                    ON reviews(unit_id, source) WHERE completed_at IS NULL;
                """
            )
            db.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    def _import_legacy(self, db: sqlite3.Connection) -> None:
        source = self.root / "my-progress.json"
        raw = source.read_text(encoding="utf-8") if source.is_file() else "{}"
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
        for key, value in data.items():
            if isinstance(key, str) and key.startswith("ccaf-") and isinstance(value, str):
                db.execute("INSERT INTO legacy_values VALUES (?, ?)", (key, value))
        mapping = {
            "pipeline": data.get("ccaf-pipeline"),
            "steps": data.get("ccaf-steps"),
            "curriculum": data.get("ccaf-curriculum"),
            "quizDone": data.get("ccaf-quizdone"),
            "evidence": data.get("ccaf-evidence"),
            "last": data.get("ccaf-last"),
        }
        db.execute("INSERT INTO metadata VALUES (?, ?)", ("legacy_known_mapping", compact(mapping)))
        db.execute("INSERT INTO metadata VALUES (?, ?)", ("legacy_imported", "true" if source.is_file() else "false"))
        db.execute("INSERT INTO metadata VALUES (?, ?)", ("legacy_snapshot", raw))
        ccaf_keys = sorted(key for key in data if isinstance(key, str) and key.startswith("ccaf-"))
        report = {
            "sourceFound": source.is_file(),
            "sourceSha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
            "rawBytes": len(raw.encode("utf-8")),
            "ccafKeysImported": len(ccaf_keys),
            "knownKeys": sorted(key for key in ccaf_keys if key in KNOWN_LEGACY_KEYS),
            "unknownKeysPreserved": sorted(key for key in ccaf_keys if key not in KNOWN_LEGACY_KEYS),
            "sourceUnchanged": True,
        }
        db.execute("INSERT INTO metadata VALUES (?, ?)", ("legacy_migration_report", compact(report)))

    def _legacy_w1_checks(self, db: sqlite3.Connection) -> list[bool]:
        values = {row["key"]: row["value"] for row in db.execute("SELECT key, value FROM legacy_values")}
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
            "INSERT INTO reviews VALUES (?, 'w1', ?, ?, NULL, 'quiz')",
            (review_id, compact(packet), due_at or now()),
        )
        return review_id

    def _mastery_level(self, checks: list[bool]) -> str:
        if all(checks):
            return "mastered"
        return "practiced" if any(checks) else "seen"

    def current_session(self) -> dict[str, Any]:
        with self._connect() as db:
            checks = self._checks(db)
            imported = db.execute("SELECT value FROM metadata WHERE key = 'legacy_imported'").fetchone()
            due_rows = db.execute(
                "SELECT packet_json FROM reviews WHERE source = 'quiz' AND completed_at IS NULL AND due_at <= ?", (now(),)
            ).fetchall()
            plan = db.execute("SELECT top_three_json FROM weekly_plans WHERE week_id = 'current'").fetchone()
        due = 0
        for row in due_rows:
            try:
                cards = json.loads(row["packet_json"]).get("cards", [])
                due += len(cards) if isinstance(cards, list) else 0
            except (AttributeError, json.JSONDecodeError):
                continue
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
        }

    def record_attempt(self, unit_id: str, stage: str, confidence: str | None, payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
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
                if stage == "review":
                    db.execute(
                        "UPDATE reviews SET completed_at = ? WHERE id = ? AND unit_id = ? AND source = 'quiz' AND completed_at IS NULL",
                        (now(), result["reviewId"], unit_id),
                    )
                    if self._latest_quiz_qualified(db):
                        prior_interval = result.get("intervalDays", 0)
                        grade = payload.get("finalGrade")
                        next_interval = 2 if grade == "hard" else min(30, max(4, prior_interval * 2))
                        due_at = (datetime.now(UTC) + timedelta(days=next_interval)).isoformat()
                        self._insert_quiz_review(db, result["cards"], due_at, next_interval)
                        result["nextIntervalDays"] = next_interval
                    elif not maintenance_review:
                        checks[4] = False
                        checks[5] = False
                db.execute("UPDATE sessions SET stage_checks = ?, updated_at = ? WHERE unit_id = 'w1'", (compact(checks), now()))
            result.update({"passed": accepted, "expectedStage": expected, "mastered": all(checks), "maintenance": maintenance_review})
            attempt_id = str(uuid.uuid4())
            db.execute(
                "INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (attempt_id, unit_id, stage, confidence, compact(payload), int(accepted), compact(result), now()),
            )
            if accepted:
                db.execute(
                    "INSERT INTO evidence VALUES (?, ?, ?, ?, ?, ?)",
                    (str(uuid.uuid4()), attempt_id, unit_id, stage, compact(payload), now()),
                )
            db.execute(
                "INSERT OR REPLACE INTO mastery VALUES (?, ?, ?, ?)",
                (unit_id, self._mastery_level(checks), compact({"stageChecks": checks, "lastAttemptId": attempt_id}), now()),
            )
        session = self.current_session()
        feedback = self._feedback(stage, expected, accepted, result)
        return session, {"feedback": feedback, "result": result}

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
            passed = (
                payload.get("independent") is True
                and payload.get("plainText") is True
                and payload.get("practiceValid") is True
                and payload.get("fileName") == "tiny-order.json"
                and isinstance(file_text, str)
                and bool(file_text.strip())
                and path.endswith("/tiny-order.json")
            )
            return passed, {"requirement": "Verify tiny-order.json, its full path, plain-text mode, and independent work."}
        if stage == "teach":
            words_value = payload.get("words")
            words = words_value.strip() if isinstance(words_value, str) else ""
            rubric = payload.get("rubric")
            valid_rubric = isinstance(rubric, list) and len(rubric) == 4 and all(type(item) is bool for item in rubric)
            return len(words) >= 60 and valid_rubric and all(rubric), {"requirement": "Explain all four checklist ideas in at least 60 characters."}
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
            reviewed = payload.get("reviewed", 0)
            grade = payload.get("finalGrade")
            review_id = payload.get("reviewId")
            row = db.execute(
                "SELECT packet_json FROM reviews WHERE id = ? AND unit_id = 'w1' AND source = 'quiz' AND completed_at IS NULL AND due_at <= ?",
                (review_id, now()),
            ).fetchone() if isinstance(review_id, str) else None
            card_count = 0
            cards: list[dict[str, Any]] = []
            interval_days = 0
            if row is not None:
                try:
                    packet = json.loads(row["packet_json"])
                    saved_cards = packet.get("cards", [])
                    cards = saved_cards if isinstance(saved_cards, list) else []
                    card_count = len(cards)
                    interval_days = packet.get("intervalDays", 0)
                    interval_days = interval_days if type(interval_days) is int and interval_days >= 0 else 0
                except (AttributeError, json.JSONDecodeError):
                    card_count = 0
                    cards = []
            passed = type(reviewed) is int and reviewed >= max(1, card_count) and grade in {"hard", "good"} and row is not None
            return passed, {
                "reviewId": review_id,
                "cards": cards,
                "intervalDays": interval_days,
                "requirement": "Rate every card. Choose Hard or Got it before finishing; Again repeats the card.",
            }
        return False, {"requirement": "Unknown stage."}

    def _latest_quiz_qualified(self, db: sqlite3.Connection) -> bool:
        row = db.execute("SELECT result_json FROM attempts WHERE unit_id = 'w1' AND stage = 'quiz' AND accepted = 1 ORDER BY created_at DESC LIMIT 1").fetchone()
        if row is None:
            return False
        try:
            return bool(json.loads(row["result_json"]).get("qualified"))
        except json.JSONDecodeError:
            return False

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
        with self._connect() as db:
            cursor = db.execute(
                "INSERT OR IGNORE INTO tutor_turns VALUES (?, ?, ?, ?, ?, 'queued', NULL, ?, NULL)",
                (turn_id, unit_id, activity_id, mode, learner_text, now()),
            )
            if cursor.rowcount != 1:
                raise ValueError("Tutor turn ID already exists")
        return turn_id

    def set_tutor_turn(self, turn_id: str, status: str, advisory: dict[str, Any] | None = None) -> None:
        with self._connect() as db:
            db.execute(
                "UPDATE tutor_turns SET status = ?, advisory_json = ?, completed_at = ? WHERE id = ?",
                (status, compact(advisory) if advisory is not None else None, now() if status != "running" else None, turn_id),
            )

    def tutor_turn(self, turn_id: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM tutor_turns WHERE id = ?", (turn_id,)).fetchone()
        if row is None:
            return None
        return {"id": row["id"], "status": row["status"], "advisory": json.loads(row["advisory_json"]) if row["advisory_json"] else None}

    def prepare_review(self, unit_id: str, source: str = "learner") -> dict[str, Any]:
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT * FROM reviews WHERE unit_id = ? AND source = ? AND completed_at IS NULL ORDER BY due_at DESC LIMIT 1",
                (unit_id, source),
            ).fetchone()
            if existing is not None:
                return {
                    "id": existing["id"],
                    "dueAt": existing["due_at"],
                    "packet": json.loads(existing["packet_json"]),
                }
            packet = {"unitId": unit_id, "title": W1_TITLE, "prompts": ["Name a file, folder, path, and extension.", "Explain why JSON needs plain text."], "advisoryOnly": True}
            review_id = str(uuid.uuid4())
            db.execute("INSERT INTO reviews VALUES (?, ?, ?, ?, NULL, ?)", (review_id, unit_id, compact(packet), now(), source))
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
        return [{"id": row["id"], "unitId": row["unit_id"], "dueAt": row["due_at"], "packet": json.loads(row["packet_json"]), "source": row["source"]} for row in rows]

    def review_packet(self, review_id: str | None = None) -> dict[str, Any] | None:
        reviews = [review for review in self.pending_reviews() if review["source"] != "quiz"]
        if review_id is None:
            return reviews[0] if reviews else None
        return next((review for review in reviews if review["id"] == review_id), None)

    def record_frontier_review(self, unit_id: str, notes: str, verdict: str, review_id: str | None = None) -> dict[str, Any] | None:
        with self._connect() as db:
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
        with self._connect() as db:
            db.execute("INSERT INTO proposals VALUES (?, ?, ?, 'pending', NULL, ?, NULL)", (proposal_id, kind, compact(payload), now()))
        return {"id": proposal_id, "kind": kind, "status": "pending"}

    def decide_proposal(self, proposal_id: str, decision: str, note: str | None) -> dict[str, Any] | None:
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT id, kind, status FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
            if row is None:
                return None
            if row["status"] != "pending":
                return {"id": proposal_id, "kind": row["kind"], "status": row["status"], "note": None, "changed": False}
            db.execute(
                "UPDATE proposals SET status = ?, decision_note = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
                (decision, note, now(), proposal_id),
            )
        return {"id": proposal_id, "kind": row["kind"], "status": decision, "note": note, "changed": True}

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
        return json.loads(row["value"]) if row else {"sourceFound": False, "sourceUnchanged": True}

    def health_check(self) -> bool:
        try:
            with self._connect() as db:
                return db.execute("SELECT 1").fetchone()[0] == 1
        except sqlite3.DatabaseError:
            return False

    def save_legacy_snapshot(self, payload: dict[str, Any]) -> tuple[bool, float]:
        # Compatibility data is intentionally isolated from Studio mastery.
        with self._connect() as db:
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
