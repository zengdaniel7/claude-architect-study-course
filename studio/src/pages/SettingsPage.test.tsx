import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";

const mocks = vi.hoisted(() => ({
  demo: false,
  refreshSession: vi.fn(),
  fetchMigrationReport: vi.fn(),
  inspectBackup: vi.fn(),
  commitBackup: vi.fn(),
  commitLegacyImport: vi.fn(),
  downloadBackup: vi.fn(),
  ollamaAvailable: false,
  ollama: { status: "unavailable" }
}));

vi.mock("../StudioContext", () => ({
  useStudio: () => ({ demo: mocks.demo, refreshSession: mocks.refreshSession, ollamaAvailable: mocks.ollamaAvailable, ollama: mocks.ollama })
}));
vi.mock("../api", () => ({
  fetchMigrationReport: mocks.fetchMigrationReport,
  inspectBackup: mocks.inspectBackup,
  commitBackup: mocks.commitBackup,
  commitLegacyImport: mocks.commitLegacyImport,
  downloadBackup: mocks.downloadBackup
}));

describe("Settings recovery", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.demo = false;
    mocks.ollamaAvailable = false;
    mocks.ollama = { status: "unavailable" };
    mocks.refreshSession.mockReset().mockResolvedValue(undefined);
    mocks.fetchMigrationReport.mockReset().mockResolvedValue({ sourceFound: false, sourceUnchanged: true, status: "not_found" });
    mocks.inspectBackup.mockReset();
    mocks.commitBackup.mockReset();
    mocks.commitLegacyImport.mockReset();
    mocks.downloadBackup.mockReset();
  });

  it("hides every recovery control in preview mode", () => {
    mocks.demo = true;
    render(<SettingsPage />);
    expect(screen.queryByRole("heading", { name: "Recovery" })).not.toBeInTheDocument();
    expect(mocks.fetchMigrationReport).not.toHaveBeenCalled();
  });

  it("explains when an enabled local tutor is temporarily protected", () => {
    mocks.ollama = { status: "protected" };
    render(<SettingsPage />);

    expect(screen.getByRole("switch", { name: /Local tutor/i })).toBeChecked();
    expect(screen.getByText(/On, but paused to protect this Mac's memory/i)).toBeInTheDocument();
  });

  it("describes the local tutor as off when its switch is off", () => {
    localStorage.setItem("ccaf-studio-local-ai", "off");
    render(<SettingsPage />);

    expect(screen.getByRole("switch", { name: /Local tutor/i })).not.toBeChecked();
    expect(screen.getByText("Off. Saved hints remain available.")).toBeInTheDocument();
  });

  it("inspects a backup before an explicit restore and reloads the session", async () => {
    mocks.inspectBackup.mockResolvedValue({
      importToken: "11111111-1111-4111-8111-111111111111",
      valid: true,
      schemaVersion: 3,
      databaseId: "db-1",
      stateDigest: "digest-1",
      warning: "Confirm"
    });
    mocks.commitBackup.mockResolvedValue({ imported: true, databaseId: "db-1", stateDigest: "digest-1" });
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.upload(screen.getByLabelText("Choose backup"), new File(["backup"], "study.ccaf-backup", { type: "application/zip" }));
    expect(await screen.findByText("db-1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm restore" }));

    await waitFor(() => expect(mocks.commitBackup).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111"));
    expect(mocks.refreshSession).toHaveBeenCalledOnce();
    const status = screen.getByText("Backup restored. Session reloaded.");
    await waitFor(() => expect(status).toHaveFocus());
  });

  it("shows and confirms only a pending legacy import", async () => {
    mocks.fetchMigrationReport.mockResolvedValue({
      status: "pending_confirmation",
      sourceFound: true,
      sourceSha256: "a".repeat(64),
      sourceUnchanged: true,
      w1CandidateChecks: [true, true, false, false, false, false]
    });
    mocks.commitLegacyImport.mockResolvedValue({ imported: true, changed: true, session: {} });
    const user = userEvent.setup();
    render(<SettingsPage />);

    expect(await screen.findByText(/Candidate W1 checks: 2\/6\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Import legacy checks" }));
    await waitFor(() => expect(mocks.commitLegacyImport).toHaveBeenCalledWith("a".repeat(64)));
    expect(mocks.refreshSession).toHaveBeenCalledOnce();
  });
});
