from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


StageId = Literal["learn", "draw", "build", "teach", "quiz", "review"]
TutorMode = Literal["hint", "simplify", "classify"]
UUID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"


class AttemptIn(BaseModel):
    unitId: Literal["w1"]
    stage: StageId
    confidence: Literal["know", "maybe", "guess"] | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    attemptId: str | None = Field(default=None, min_length=36, max_length=36, pattern=UUID_PATTERN)
    clientStateVersion: int | None = Field(default=None, ge=0)
    manifestHash: str | None = Field(default=None, min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")


class ReviewCardRatingIn(BaseModel):
    ratingId: str = Field(min_length=36, max_length=36, pattern=UUID_PATTERN)
    rating: Literal["again", "hard", "good"]
    elapsedMs: int = Field(default=0, ge=0, le=3_600_000)


class BackupCommitIn(BaseModel):
    importToken: str = Field(min_length=36, max_length=36, pattern=UUID_PATTERN)


class LegacyImportCommitIn(BaseModel):
    sourceSha256: str = Field(min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")


class FrontierReviewIn(BaseModel):
    unitId: Literal["w1"]
    notes: str = Field(min_length=1, max_length=4_000)
    verdict: str = Field(min_length=1, max_length=500)
    reviewId: str | None = Field(default=None, min_length=1, max_length=128)


class SupervisorProposalIn(BaseModel):
    kind: Literal["study_plan", "content_gap"]
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
