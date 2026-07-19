#!/usr/bin/env python3
"""Build the explicitly allowlisted legacy asset archive for local Studio use."""

from __future__ import annotations

import shutil
from pathlib import Path


# These are the legacy tutor's public, generated inputs. Repository metadata,
# source notes, progress, server code, and private material are intentionally absent.
LEGACY_ASSETS = frozenset(
    {
        "article-effective-agents.html",
        "article-multi-agent.html",
        "article-writing-tools.html",
        "concept-map.html",
        "course-data.js",
        "curriculum.html",
        "daily-pipeline.html",
        "dashboard.html",
        "draw.html",
        "engineer-path.html",
        "exam-facts.html",
        "exercise-library.js",
        "exercise.html",
        "exercises.js",
        "flashcards.html",
        "flashcards.js",
        "foundation-lab.html",
        "index.html",
        "learning-map.html",
        "lesson-quizzes.js",
        "my-plan.html",
        "nav.js",
        "notes-corrections.js",
        "notes-data.js",
        "notes.html",
        "pretest.html",
        "projects.html",
        "quiz.html",
        "quizzes.html",
        "quizzes.js",
        "read-aloud.js",
        "repair-map.html",
        "resources.html",
        "review.html",
        "study.css",
        "teachback.html",
        "timeline.html",
        "today.html",
        "tutor-bridge.html",
        "units-data.js",
        "video-data.js",
        "video-library.html",
        "video-ui.js",
        "fonts/AtkinsonHyperlegible-Bold.woff2",
        "fonts/AtkinsonHyperlegible-BoldItalic.woff2",
        "fonts/AtkinsonHyperlegible-Italic.woff2",
        "fonts/AtkinsonHyperlegible-Regular.woff2",
        "fonts/OFL.txt",
        "audio/foundation/d1-one-idea.mp3",
        "audio/foundation/d2-one-idea.mp3",
        "audio/foundation/w1-one-idea.mp3",
        "audio/foundation/w2-one-idea.mp3",
        "audio/foundation/w3-one-idea.mp3",
        "audio/foundation/w4-one-idea.mp3",
        "audio/foundation/w5-one-idea.mp3",
    }
)
PRIVATE_IMPORT = "my-progress.json"


def _asset_paths(root: Path) -> set[str]:
    return {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file() and path.name != PRIVATE_IMPORT
    }


def verify_archive(archive: Path) -> bool:
    actual = _asset_paths(archive)
    if actual != set(LEGACY_ASSETS):
        raise ValueError(
            f"Legacy archive file set mismatch; extra={sorted(actual - set(LEGACY_ASSETS))}, "
            f"missing={sorted(set(LEGACY_ASSETS) - actual)}"
        )
    return True


def build_archive(source: Path, destination: Path) -> None:
    source = source.resolve()
    destination = destination.resolve()
    destination.mkdir(parents=True, exist_ok=True)
    for relative in sorted(LEGACY_ASSETS):
        source_path = source / relative
        if not source_path.is_file():
            raise FileNotFoundError(f"Allowlisted legacy asset is missing: {source_path}")
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target)
    progress = source / PRIVATE_IMPORT
    if progress.is_file():
        shutil.copy2(progress, destination / PRIVATE_IMPORT)
    verify_archive(destination)
