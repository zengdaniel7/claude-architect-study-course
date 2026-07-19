const { defineConfig, devices } = require("@playwright/test");

const ci = Boolean(process.env.CI);
const verbose = ci || process.env.CCA_STUDIO_VERBOSE === "1";
const studioBaseURL = process.env.CCA_STUDIO_E2E_URL || "http://127.0.0.1:8765";
const boundedTimeout = (name, fallback, maximum) => {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1_000), maximum) : fallback;
};
const testTimeout = boundedTimeout("CCA_STUDIO_TEST_TIMEOUT_MS", 90_000, 120_000);

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: testTimeout,
  globalTimeout: boundedTimeout("CCA_STUDIO_GLOBAL_TIMEOUT_MS", 10 * 60_000, 20 * 60_000),
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  maxFailures: ci ? 1 : 0,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: verbose
    ? [["line"], ["json", { outputFile: "test-results/playwright-report.json" }]]
    : [["list", { printSteps: true }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: [
    {
      command: "python3 scripts/serve_legacy_archive.py --port 4173",
      url: "http://127.0.0.1:4173/dashboard.html",
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
      stdout: verbose ? "pipe" : "ignore",
      stderr: verbose ? "pipe" : "ignore"
    },
    {
      command: "python3 scripts/e2e_studio_server.py",
      url: `${studioBaseURL}/__health`,
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
      stdout: verbose ? "pipe" : "ignore",
      stderr: verbose ? "pipe" : "ignore"
    }
  ],
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } }
  ]
});
