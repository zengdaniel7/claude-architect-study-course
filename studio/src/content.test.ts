import { describe, expect, it } from "vitest";
import { manifest, STAGES, validateManifest } from "./content";

describe("course manifest", () => {
  it("keeps all canonical units and valid prerequisites", () => {
    expect(manifest.units).toHaveLength(23);
    expect(validateManifest()).toEqual([]);
    expect(new Set(manifest.units.map((unit) => unit.id)).size).toBe(23);
  });

  it("keeps a complete six-stage learner loop", () => {
    expect(STAGES.map((stage) => stage.id)).toEqual(["learn", "draw", "build", "teach", "quiz", "review"]);
  });

  it("keeps answer keys and explanations paired", () => {
    for (const bank of Object.values(manifest.banks)) {
      for (const question of bank.questions) {
        expect(question.ans).toBeGreaterThanOrEqual(0);
        expect(question.ans).toBeLessThan(question.opts.length);
        expect(question.why.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
