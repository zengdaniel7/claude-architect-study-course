from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

from .store import StudioStore


ROOT = Path(__file__).resolve().parents[1]
configured_data = Path(os.environ["CCA_STUDIO_DATA_DIR"]).expanduser() if os.environ.get("CCA_STUDIO_DATA_DIR") else None
store = StudioStore(ROOT, configured_data)
mcp = FastMCP("CCA-F Study Studio", instructions="Read-only session access plus advisory review and proposal intake. Tools never change mastery or curriculum.")


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
