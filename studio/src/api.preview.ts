import { buildStages, demoSession } from "./content";
import type {
  AttemptResponse,
  BackupInspection,
  FrontierInboxDetail,
  FrontierInboxItem,
  ReviewCard,
  ReviewRating,
  ReviewRatingResponse,
  SessionState,
  StageId,
  TutorResult
} from "./types";

export interface OllamaState {
  available: boolean;
  status: "ready" | "protected" | "unavailable";
  reason?: string | null;
}

// Mirrors api.ts so preview builds resolve the same named exports; the
// preview never performs network requests, so it is never thrown here.
export class ApiRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const stageIds: StageId[] = ["learn", "draw", "build", "teach", "quiz", "review"];

export async function fetchCurrentSession(): Promise<SessionState> {
  return demoSession();
}

export async function initializeApi() {
  return {
    session: demoSession(),
    demo: true,
    ollama: { available: false, status: "unavailable" as const, reason: "AI is disabled in preview mode." }
  };
}

export async function submitAttempt(
  session: SessionState,
  _stage: StageId,
  _payload: Record<string, unknown>,
  _confidence?: string,
  attemptId: string = crypto.randomUUID()
): Promise<AttemptResponse> {
  const nextIndex = Math.min(session.stageIndex + 1, stageIds.length - 1);
  const completed = session.stageIndex === stageIds.length - 1;
  const nextSession: SessionState = {
    ...session,
    stageIndex: nextIndex,
    stage: completed ? "review" : stageIds[nextIndex],
    stages: buildStages(completed ? stageIds.length : nextIndex),
    progressPercent: completed ? 100 : Math.round((nextIndex / stageIds.length) * 100),
    mastery: completed ? "mastered" : "practiced",
    stateVersion: session.stateVersion + 1
  };
  return {
    session: nextSession,
    feedback: {
      tone: "success",
      title: completed ? "Preview lesson complete" : "Preview step complete",
      message: "This preview action is temporary. Progress is not saved."
    },
    attemptId,
    stateVersion: nextSession.stateVersion,
    manifestHash: nextSession.manifestHash
  };
}

export async function askTutor(
  _unitId: string,
  _activityId: string,
  mode: "hint" | "simplify" | "classify",
  _learnerText = "",
  _turnId?: string,
  _signal?: AbortSignal
): Promise<TutorResult> {
  return {
    advisory: true,
    summary: mode === "simplify"
      ? "A folder holds things. A file is one saved thing. A path is the route to it."
      : "Start at the final dot: the extension tells you the file type. Then trace the folders before it.",
    nextNudge: "Which part of /Users/me/study/card.json is the file?",
    sourceIds: ["course:w1"],
    uncertain: false,
    fallback: true
  };
}

export async function cancelTutor(_turnId: string): Promise<void> {}

export async function fetchPendingReview(): Promise<null> {
  return null;
}

export async function rateReviewCard(
  session: SessionState,
  reviewId: string,
  cardId: string,
  rating: ReviewRating,
  _elapsedMs: number,
  ratingId: string,
  demoQueue: ReviewCard[] = []
): Promise<ReviewRatingResponse> {
  const card = demoQueue.find((item) => item.id === cardId);
  const queue = demoQueue.filter((item) => item.id !== cardId);
  if (rating === "again" && card) queue.push({ ...card, repetitions: (card.repetitions ?? 0) + 1 });
  const reviewComplete = queue.length === 0;
  const nextSession = reviewComplete ? {
    ...session,
    stages: buildStages(6),
    progressPercent: 100,
    mastery: "mastered" as const,
    stateVersion: session.stateVersion + 1
  } : session;
  return {
    ratingId,
    reviewId,
    cardId,
    rating,
    repeat: rating === "again",
    reviewComplete,
    remaining: queue.length,
    queue,
    session: nextSession,
    feedback: {
      tone: "success",
      title: reviewComplete ? "Preview review complete" : "Preview rating complete",
      message: "This preview action is temporary. Progress is not saved."
    },
    stateVersion: nextSession.stateVersion
  };
}

function localOnly(): never {
  throw new Error("This control is available only in local Study Studio.");
}

export async function downloadBackup(): Promise<{ blob: Blob; filename: string }> { return localOnly(); }
export async function inspectBackup(_file: File): Promise<BackupInspection> { return localOnly(); }
export async function commitBackup(_token: string): Promise<{ imported: boolean; databaseId: string; stateDigest: string }> { return localOnly(); }
export async function fetchMigrationReport(): Promise<never> { return localOnly(); }
export async function commitLegacyImport(_hash: string): Promise<{ imported: boolean; changed: boolean; session: SessionState }> { return localOnly(); }
export async function fetchFrontierInbox(): Promise<FrontierInboxItem[]> { return localOnly(); }
export async function fetchFrontierInboxDetail(_id: string): Promise<FrontierInboxDetail> { return localOnly(); }
export async function decideProposal(_id: string, _decision: "accepted" | "rejected"): Promise<never> { return localOnly(); }
export async function recordContentGap(_unitId: string, _activityId: string, _note: string): Promise<void> {}
export async function prepareFrontierReview() { return { prepared: false, demo: true }; }
export function isDemoMode() { return true; }
