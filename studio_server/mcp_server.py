from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

from .store import StudioStore


ROOT = Path(__file__).resolve().parents[1]
configured_data = Path(os.environ["CCA_STUDIO_DATA_DIR"]).expanduser() if os.environ.get("CCA_STUDIO_DATA_DIR") else None
store = StudioStore(ROOT, configured_data)
MCP_INSTRUCTIONS = """
Act as an advisory tutor, grader, and reviewer for a dyslexic beginner studying
for CCA-F. Start with get_tutor_briefing and get_current_session. Teach in
short visual-first chunks: plain meaning, tiny example, simple sketch, learner
action, then a brief check. Correctness, mastery, prerequisites, and review
scheduling are deterministic and server-owned. Never claim that an advisory
review changed progress. Use proposals for plan or content changes and leave
their acceptance to the learner in Study Studio.
""".strip()

TUTOR_BRIEFING: dict[str, Any] = {
    "role": "Tutor, grader, quizmaster, and architecture reviewer",
    "learner": {
        "level": "Complete beginner to technology and AI",
        "accessibility": "Dyslexic; use short chunks, clear headings, bold key terms, and visual examples",
        "learningLoop": ["watch", "draw", "build", "explain aloud", "flashcard"],
    },
    "goal": "Pass CCA-F with real applied-engineering understanding",
    "gradingLevels": ["Beginner", "Developing", "Exam-ready", "Strong"],
    "masteryRule": "Correctness and guess count are separate; passing with guesses is not mastery",
    "authority": {
        "server": ["correctness", "progression", "prerequisites", "mastery", "review scheduling"],
        "frontierModel": ["advisory grading", "failure-mode analysis", "study-plan proposals", "content-gap reports"],
        "learner": ["accept or reject proposals"],
    },
    "release": {
        "interactiveUnits": ["w1"],
        "remainingUnits": "Present in the protected manifest for staged migration",
        "legacyTutor": "/legacy/",
    },
    "guardrails": [
        "Do not change exam facts, answer keys, mastery, or curriculum through MCP",
        "Do not treat local-model advice as authoritative",
        "Do not expose private notes, progress databases, credentials, or confidential PDFs",
    ],
}

mcp = FastMCP("CCA-F Study Studio", instructions=MCP_INSTRUCTIONS)


@mcp.tool()
def get_tutor_briefing() -> dict[str, Any]:
    """Return the learner, teaching, authority, and safety contract for any frontier model."""
    return TUTOR_BRIEFING


@mcp.tool()
def get_current_session() -> dict[str, Any]:
    """Return the server-authoritative current W1 session."""
    return store.current_session()


@mcp.tool()
def get_review_packet(review_id: str | None = None) -> dict[str, Any] | None:
    """Return a pending review packet, optionally by id."""
    return store.review_packet(review_id)


@mcp.tool()
def submit_frontier_review(unit_id: str, notes: str, verdict: str, review_id: str | None = None) -> dict[str, Any]:
    """Record an advisory frontier review; it cannot complete a learner stage."""
    if unit_id != "w1":
        raise ValueError("Only W1 is available in this Studio version")
    review = store.record_frontier_review(unit_id, notes[:4_000], verdict[:500], review_id)
    if review is None:
        raise ValueError("No matching pending review packet")
    return review


@mcp.tool()
def propose_study_plan_update(summary: str, rationale: str, suggested_changes: list[str]) -> dict[str, Any]:
    """Create a pending plan proposal. Acceptance is advisory and cannot mutate curriculum."""
    return store.create_proposal("study_plan", {"summary": summary[:1_000], "rationale": rationale[:2_000], "suggestedChanges": suggested_changes[:20]})


@mcp.tool()
def report_content_gap(unit_id: str, gap: str, evidence: str) -> dict[str, Any]:
    """Record a curriculum-content gap proposal without changing course material."""
    return store.create_proposal("content_gap", {"unitId": unit_id, "gap": gap[:2_000], "evidence": evidence[:4_000]})


if __name__ == "__main__":
    mcp.run(transport="stdio")
