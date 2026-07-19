import { buildStages, demoSession } from "./content";
import { PUBLIC_PREVIEW } from "./preview";
import type { AttemptResponse, BackupInspection, FrontierInboxDetail, FrontierInboxItem, MigrationReport, ReviewCard, ReviewRating, ReviewRatingResponse, SessionState, StageId, TutorResult } from "./types";

let instanceToken = "";
let demoMode = false;
export interface OllamaState {
  available: boolean;
  status: "ready" | "protected" | "unavailable";
  reason?: string | null;
}

let initialization: Promise<{ session: SessionState; demo: boolean; ollama: OllamaState }> | null = null;

class ApiRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await requestResponse(path, init);
  return response.json() as Promise<T>;
}

async function requestResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (instanceToken) headers.set("X-CCA-Instance", instanceToken);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), path === "/api/tutor/turn" ? 46_000 : 10_000);
  const forwardAbort = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    const response = await fetch(path, { ...init, headers, signal: controller.signal });
    if (!response.ok) throw new ApiRequestError(response.status, `${response.status} ${response.statusText}`);
    return response;
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", forwardAbort);
  }
}

export async function fetchCurrentSession(): Promise<SessionState> {
  if (demoMode) return demoSession();
  return request<SessionState>("/api/session/current");
}

export async function initializeApi(): Promise<{ session: SessionState; demo: boolean; ollama: OllamaState }> {
  if (!initialization) {
    initialization = (async () => {
      demoMode = PUBLIC_PREVIEW;
      if (demoMode) {
        return { session: demoSession(), demo: true, ollama: { available: false, status: "unavailable", reason: "AI is disabled in preview mode." } };
      }
      try {
        const bootstrap = await request<{ instanceToken: string; ollama?: OllamaState }>("/api/bootstrap");
        instanceToken = bootstrap.instanceToken;
        const session = await request<SessionState>("/api/session/current");
        return {
          session,
          demo: false,
          ollama: bootstrap.ollama ?? { available: false, status: "unavailable", reason: "Ollama status was not returned." }
        };
      } catch (error) {
        instanceToken = "";
        throw error;
      }
    })();
  }
  return initialization;
}

export async function submitAttempt(
  session: SessionState,
  stage: StageId,
  payload: Record<string, unknown>,
  confidence?: string,
  attemptId = crypto.randomUUID()
): Promise<AttemptResponse> {
  if (!demoMode) {
    try {
      return await request<AttemptResponse>("/api/attempts", {
        method: "POST",
        body: JSON.stringify({
          unitId: session.unitId,
          stage,
          confidence,
          payload,
          attemptId,
          clientStateVersion: session.stateVersion,
          manifestHash: session.manifestHash
        })
      });
    } catch (error) {
      if (!isAmbiguousRequestFailure(error)) throw error;
      try {
        const receipt = await fetchAttemptReceipt(attemptId);
        if (receipt) return receipt;
      } catch {
        // The original error is more useful if receipt reconciliation also cannot reach the server.
      }
      throw error;
    }
  }

  const nextIndex = Math.min(session.stageIndex + 1, 5);
  const isDone = session.stageIndex === 5;
  const next = {
    ...session,
    stageIndex: nextIndex,
    stage: (isDone ? "review" : ["learn", "draw", "build", "teach", "quiz", "review"][nextIndex]) as StageId,
    stages: buildStages(nextIndex),
    progressPercent: isDone ? 100 : Math.round((nextIndex / 6) * 100),
    mastery: isDone ? "mastered" as const : "practiced" as const
  };
  return {
    session: next,
    feedback: {
      tone: "success",
      title: isDone ? "W1 complete" : "Saved",
      message: isDone ? "Your preview lesson is complete. Progress is not saved." : "This preview action is temporary. Progress is not saved."
    },
    attemptId,
    stateVersion: next.stateVersion,
    manifestHash: next.manifestHash
  };
}

function isAmbiguousRequestFailure(error: unknown) {
  return error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError");
}

export async function fetchAttemptReceipt(attemptId: string): Promise<AttemptResponse | null> {
  try {
    return await request<AttemptResponse>(`/api/attempts/${encodeURIComponent(attemptId)}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return null;
    throw error;
  }
}

export async function askTutor(
  unitId: string,
  activityId: string,
  mode: "hint" | "simplify" | "classify",
  learnerText = "",
  turnId?: string,
  signal?: AbortSignal
): Promise<TutorResult> {
  if (demoMode) {
    return {
      advisory: true,
      summary: "A path is the route through folders to one item.",
      nextNudge: "Start at your home folder, then name each folder you open before the file.",
      sourceIds: ["course:w1"],
      uncertain: false,
      fallback: true
    };
  }
  return request<TutorResult>("/api/tutor/turn", {
    method: "POST",
    body: JSON.stringify({ unitId, activityId, mode, learnerText, turnId }),
    signal
  });
}

export async function cancelTutor(turnId: string): Promise<void> {
  if (demoMode) return;
  await request(`/api/tutor/cancel/${encodeURIComponent(turnId)}`, { method: "POST" });
}

export async function fetchPendingReview(): Promise<{ reviewId: string; cards: ReviewCard[] } | null> {
  if (demoMode) return null;
  const response = await request<{ reviews: { id: string; packet?: { cards?: ReviewCard[] } }[] }>("/api/reviews/pending");
  const review = response.reviews.find((item) => Array.isArray(item.packet?.cards) && item.packet.cards.length > 0);
  return review ? { reviewId: review.id, cards: review.packet?.cards ?? [] } : null;
}

export async function rateReviewCard(
  session: SessionState,
  reviewId: string,
  cardId: string,
  rating: ReviewRating,
  elapsedMs: number,
  ratingId: string,
  demoQueue: ReviewCard[] = []
): Promise<ReviewRatingResponse> {
  if (!demoMode) {
    return request<ReviewRatingResponse>(`/api/reviews/${encodeURIComponent(reviewId)}/cards/${encodeURIComponent(cardId)}`, {
      method: "POST",
      body: JSON.stringify({ ratingId, rating, elapsedMs })
    });
  }
  const card = demoQueue.find((item) => item.id === cardId);
  const queue = demoQueue.filter((item) => item.id !== cardId);
  if (rating === "again" && card) queue.push({ ...card, repetitions: (card.repetitions ?? 0) + 1 });
  const reviewComplete = queue.length === 0;
  const nextSession: SessionState = reviewComplete ? {
    ...session,
    stages: buildStages(6),
    progressPercent: 100,
    mastery: "mastered",
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
      title: reviewComplete ? "Review saved" : rating === "again" ? "Again saved" : "Rating saved",
      message: reviewComplete ? "Your demo review is complete." : "Your next review card is ready."
    },
    stateVersion: nextSession.stateVersion
  };
}

function requireLocalMode() {
  if (demoMode) throw new Error("This control is available only in local mode.");
}

export async function downloadBackup(): Promise<{ blob: Blob; filename: string }> {
  requireLocalMode();
  const response = await requestResponse("/api/backups/export");
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename=\"?([^\";]+)\"?/)?.[1] ?? "ccaf-study-studio.ccaf-backup";
  return { blob: await response.blob(), filename };
}

export async function inspectBackup(file: File): Promise<BackupInspection> {
  requireLocalMode();
  return request<BackupInspection>("/api/backups/import/inspect", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file
  });
}

export async function commitBackup(importToken: string): Promise<{ imported: boolean; databaseId: string; stateDigest: string }> {
  requireLocalMode();
  return request("/api/backups/import/commit", { method: "POST", body: JSON.stringify({ importToken }) });
}

export async function fetchMigrationReport(): Promise<MigrationReport> {
  requireLocalMode();
  return request<MigrationReport>("/api/migration/report");
}

export async function commitLegacyImport(sourceSha256: string): Promise<{ imported: boolean; changed: boolean; session: SessionState }> {
  requireLocalMode();
  return request("/api/migration/legacy/commit", { method: "POST", body: JSON.stringify({ sourceSha256 }) });
}

export async function fetchFrontierInbox(): Promise<FrontierInboxItem[]> {
  requireLocalMode();
  const response = await request<{ items: FrontierInboxItem[] }>("/api/frontier/inbox");
  return response.items;
}

export async function fetchFrontierInboxDetail(proposalId: string): Promise<FrontierInboxDetail> {
  requireLocalMode();
  const response = await request<{ item: FrontierInboxDetail }>(`/api/frontier/inbox/${encodeURIComponent(proposalId)}`);
  return response.item;
}

export async function decideProposal(proposalId: string, decision: "accepted" | "rejected") {
  requireLocalMode();
  return request<{ proposal: { id: string; status: "accepted" | "rejected"; advisoryOnly: true } }>(`/api/proposals/${encodeURIComponent(proposalId)}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision })
  });
}

export async function recordContentGap(unitId: string, activityId: string, note: string): Promise<void> {
  if (demoMode) return;
  await request("/api/content-gaps", {
    method: "POST",
    body: JSON.stringify({ unitId, activityId, note })
  });
}

export async function prepareFrontierReview() {
  // Frontier Inbox is intentionally not rendered until the backend exposes typed items,
  // ownership, timestamps, and read-state semantics rather than only packet preparation.
  if (demoMode) return { prepared: false, demo: true };
  return request<{ prepared: boolean; reviewId: string }>("/api/reviews/prepare", { method: "POST" });
}

export function isDemoMode() {
  return demoMode;
}
