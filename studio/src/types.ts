export type StageId = "learn" | "draw" | "build" | "teach" | "quiz" | "review";
export type StageStatus = "complete" | "current" | "upcoming" | "needs-review";
export type Confidence = "know" | "maybe" | "guess";

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
}
