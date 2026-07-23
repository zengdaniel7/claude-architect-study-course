import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setUrl = (url: string) => {
  (window as typeof window & { happyDOM: { setURL: (value: string) => void } }).happyDOM.setURL(url);
};

describe("API initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("server unavailable")));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not disguise a local startup failure as unsaved demo mode", async () => {
    setUrl("http://localhost:8765/");
    const { initializeApi } = await import("./api");
    await expect(initializeApi()).rejects.toThrow("server unavailable");
  });

  it("keeps the static public course preview available without an API", async () => {
    setUrl("https://course.example/");
    vi.stubEnv("VITE_CCAF_PUBLIC_PREVIEW", "true");
    const { initializeApi } = await import("./api");
    const result = await initializeApi();
    expect(result.demo).toBe(true);
    expect(result.session.progressPercent).toBe(0);
    const attempt = await (await import("./api")).submitAttempt(result.session, "learn", { understoodPath: true });
    expect(attempt.feedback.message).toMatch(/not saved/i);
  });

  it("reconciles a timed-out attempt with its saved receipt before retrying", async () => {
    const attemptId = "11111111-1111-4111-8111-111111111111";
    const session = {
      unitId: "w1",
      title: "Files, folders, and plain text",
      stage: "learn" as const,
      stageIndex: 0,
      stages: [],
      progressPercent: 0,
      dueReviews: 0,
      weeklyTopThree: [],
      legacyImported: false,
      stateVersion: 4,
      manifestHash: "a".repeat(64)
    };
    const receipt = {
      session,
      feedback: { tone: "success" as const, title: "Saved", message: "Recorded" },
      attemptId,
      stateVersion: 5,
      manifestHash: "a".repeat(64)
    };
    const fetch = vi.fn()
      .mockRejectedValueOnce(new DOMException("timed out", "AbortError"))
      .mockResolvedValueOnce({ ok: true, json: async () => receipt });
    vi.stubGlobal("fetch", fetch);
    const { submitAttempt } = await import("./api");

    await expect(submitAttempt(session, "learn", { understoodPath: true }, undefined, attemptId)).resolves.toEqual(receipt);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      attemptId,
      clientStateVersion: 4,
      manifestHash: "a".repeat(64)
    });
    expect(fetch.mock.calls[1][0]).toBe(`/api/attempts/${attemptId}`);
  });
});
