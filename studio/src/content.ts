import manifestJson from "./content/course-manifest.json";
import type { CourseManifest, SessionState, StageId, StageState } from "./types";

function parseManifest(value: unknown): CourseManifest {
  if (!value || typeof value !== "object") throw new Error("Course manifest must be an object.");
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.units) || candidate.units.length !== 23) throw new Error("Course manifest must contain 23 units.");
  if (!candidate.media || typeof candidate.media !== "object") throw new Error("Course manifest must contain the reviewed media library.");
  const media = candidate.media as Record<string, unknown>;
  if (!Array.isArray(media.videos) || typeof media.playlistUrl !== "string") throw new Error("Course media library is incomplete.");
  for (const rawUnit of candidate.units) {
    if (!rawUnit || typeof rawUnit !== "object") throw new Error("Every course unit must be an object.");
    const unit = rawUnit as Record<string, unknown>;
    if (typeof unit.id !== "string" || !Array.isArray(unit.prereq) || !Array.isArray(unit.watch)) throw new Error("Course unit fields are incomplete.");
    if (!unit.watch.every((item) => Array.isArray(item) && item.length === 3 && item.every((part) => typeof part === "string"))) {
      throw new Error(`${unit.id} has an invalid video mapping.`);
    }
  }
  return value as CourseManifest;
}

export const manifest = parseManifest(manifestJson);

export const STAGES: { id: StageId; label: string }[] = [
  { id: "learn", label: "Learn" },
  { id: "draw", label: "Draw" },
  { id: "build", label: "Build" },
  { id: "teach", label: "Teach" },
  { id: "quiz", label: "Quiz" },
  { id: "review", label: "Review" }
];

export function buildStages(currentIndex: number, needsReview = false): StageState[] {
  return STAGES.map((stage, index) => ({
    ...stage,
    status: index < currentIndex
      ? "complete"
      : index === currentIndex
        ? needsReview ? "needs-review" : "current"
        : "upcoming"
  }));
}

export function demoSession(): SessionState {
  return {
    unitId: "w1",
    title: "Files, folders, and plain text",
    stage: "learn",
    stageIndex: 0,
    stages: buildStages(0),
    progressPercent: 0,
    dueReviews: 0,
    weeklyTopThree: [
      "Finish the Files and folders lesson",
      "Create and verify tiny-order.json",
      "Explain the file path in your own words"
    ],
    legacyImported: false,
    stateVersion: 0,
    manifestHash: "preview",
    mastery: "seen"
  };
}

export function unitById(unitId: string) {
  return manifest.units.find((unit) => unit.id === unitId) ?? manifest.units[0];
}

export function validateManifest(): string[] {
  const errors: string[] = [];
  const ids = new Set(manifest.units.map((unit) => unit.id));
  if (manifest.units.length !== 23) errors.push("The course must contain exactly 23 units.");
  if (ids.size !== manifest.units.length) errors.push("Unit IDs must be unique.");
  for (const unit of manifest.units) {
    for (const prerequisite of unit.prereq) {
      if (!ids.has(prerequisite)) errors.push(`${unit.id} has missing prerequisite ${prerequisite}.`);
    }
    if (!unit.watch.length) errors.push(`${unit.id} needs at least one learning resource.`);
    if (unit.watch.some((item) => item.length !== 3)) errors.push(`${unit.id} has an incomplete video mapping.`);
  }
  return errors;
}
