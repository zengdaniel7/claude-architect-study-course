from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


StageId = Literal["learn", "draw", "build", "teach", "quiz", "review"]
TutorMode = Literal["hint", "simplify", "classify"]


class AttemptIn(BaseModel):
    unitId: Literal["w1"]
    stage: StageId
    confidence: Literal["know", "maybe", "guess"] | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class TutorTurnIn(BaseModel):
    unitId: Literal["w1"]
    activityId: str = Field(min_length=1, max_length=128)
    mode: TutorMode
    learnerText: str | None = Field(default=None, max_length=4_000)
    turnId: str | None = Field(default=None, min_length=8, max_length=64, pattern=r"^[a-zA-Z0-9-]+$")


class ReviewPrepareIn(BaseModel):
    unitId: Literal["w1"] = "w1"


class ProposalDecisionIn(BaseModel):
    decision: Literal["accepted", "rejected"]
    note: str | None = Field(default=None, max_length=1_000)


class ContentGapIn(BaseModel):
    unitId: Literal["w1"]
    activityId: str = Field(min_length=1, max_length=128)
    note: str = Field(min_length=1, max_length=2_000)


class Advisory(BaseModel):
    mode: TutorMode
    advice: str = Field(min_length=1, max_length=2_000)
    nextQuestion: str = Field(min_length=1, max_length=500)
    label: Literal["needs_review", "ready_for_human_review", "unclear"]
