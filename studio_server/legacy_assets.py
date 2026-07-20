from __future__ import annotations

from pathlib import Path


# Public, generated legacy tutor inputs. Repository metadata, source notes,
# progress backups, server code, and private material are intentionally absent.
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


def _allowed_directories() -> set[str]:
    directories: set[str] = set()
    for relative in LEGACY_ASSETS:
        parent = Path(relative).parent
        while parent != Path("."):
            directories.add(parent.as_posix())
            parent = parent.parent
    return directories


def verify_archive(root: Path) -> bool:
    if root.is_symlink():
        raise ValueError("Legacy archive root cannot be a symlink")
    root = root.resolve()
    if not root.is_dir():
        raise ValueError("Legacy archive root must be a regular directory")

    allowed_directories = _allowed_directories()
    actual: set[str] = set()
    for path in root.rglob("*"):
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            raise ValueError(f"Legacy archive cannot contain symlinks: {relative}")
        if path.is_dir():
            if relative not in allowed_directories:
                raise ValueError(f"Legacy archive contains an unexpected directory: {relative}")
            continue
        if not path.is_file():
            raise ValueError(f"Legacy archive contains an unsupported entry: {relative}")
        if relative != PRIVATE_IMPORT:
            actual.add(relative)

    if actual != set(LEGACY_ASSETS):
        raise ValueError(
            f"Legacy archive file set mismatch; extra={sorted(actual - set(LEGACY_ASSETS))}, "
            f"missing={sorted(set(LEGACY_ASSETS) - actual)}"
        )
    return True


def is_verified_archive(root: Path) -> bool:
    try:
        return verify_archive(root)
    except (OSError, ValueError):
        return False
