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
  });
});
