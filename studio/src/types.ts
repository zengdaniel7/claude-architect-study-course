export type StageId = "learn" | "draw" | "build" | "teach" | "quiz" | "review";
export type StageStatus = "complete" | "current" | "upcoming" | "needs-review";
export type Confidence = "know" | "maybe" | "guess";
export type ReviewRating = "again" | "hard" | "good";

export interface StageState {
  id: StageId;
  label: string;
  status: StageStatus;
}

export interface SessionState {
  unitId: string;
  title: string;
  stage: StageId;
  stageIndex: number;
  stages: StageState[];
  progressPercent: number;
  dueReviews: number;
  weeklyTopThree: string[];
  legacyImported: boolean;
  stateVersion: number;
  manifestHash: string;
  mastery?: "seen" | "practiced" | "mastered";
}

export interface Feedback {
  tone: "success" | "repair" | "info";
  title: string;
  message: string;
  nextAction?: string;
}

export interface AttemptResponse {
  session: SessionState;
  feedback: Feedback;
  result?: Record<string, unknown>;
  attemptId: string;
  stateVersion: number;
  manifestHash: string;
  replayed?: boolean;
}

export interface TutorResult {
  advisory: true;
  summary: string;
  nextNudge: string;
  sourceIds: string[];
  uncertain: boolean;
  fallback?: boolean;
}

export interface QuizQuestion {
  q: string;
  opts: string[];
  ans: number;
  why: string;
}

export interface CourseUnit {
  id: string;
  level: string;
  title: string;
  one: string;
  prereq: string[];
  concepts: string[];
  exercise: string;
  quiz: string;
  notes: string;
  ask: string;
  watch: [string, string, string][];
}

export interface LessonSummary {
  plain: string;
  example: string;
  diagram: string[];
  danger: string;
}

export interface CourseManifest {
  sourceVersion: number;
  generatedFrom: string;
  units: CourseUnit[];
  lessons: Record<string, LessonSummary>;
  banks: Record<string, { questions: QuizQuestion[] }>;
  cards: Record<string, [string, string][]>;
}

export interface ReviewCard {
  id: string;
  front: string;
  back: string;
  source: string;
  repetitions?: number;
}

export interface ReviewRatingResponse {
  ratingId: string;
  reviewId: string;
  cardId: string;
  rating: ReviewRating;
  repeat: boolean;
  reviewComplete: boolean;
  remaining: number;
  queue: ReviewCard[];
  session: SessionState;
  feedback: Feedback;
  stateVersion: number;
  replayed?: boolean;
}

export interface BackupInspection {
  importToken: string;
  valid: boolean;
  schemaVersion: number;
  databaseId: string;
  stateDigest: string;
  warning: string;
}

export interface MigrationReport {
  status?: "pending_confirmation" | "imported" | "not_found";
  sourceFound: boolean;
  sourceSha256?: string;
  sourceUnchanged: boolean;
  w1CandidateChecks?: boolean[];
}

export interface FrontierInboxItem {
  id: string;
  kind: string;
  summary: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  decidedAt?: string | null;
  advisoryOnly: true;
}

export interface FrontierInboxDetail extends FrontierInboxItem {
  payload: Record<string, unknown>;
  decision?: { id: string; decision: "accepted" | "rejected"; note?: string | null; decided_at: string } | null;
}
