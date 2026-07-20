import { Cpu, Download, Eye, Gauge, RotateCcw, Upload, Volume2 } from "../icons";
import { useEffect, useRef, useState } from "react";
import { commitBackup, commitLegacyImport, downloadBackup, fetchMigrationReport, inspectBackup } from "../api";
import { useStudio } from "../StudioContext";
import type { BackupInspection, MigrationReport } from "../types";
import { Button } from "../components/atoms/Button";
import { PUBLIC_PREVIEW } from "../preview";

type Status = { tone: "success" | "error"; message: string } | null;

function RecoverySection() {
  const { refreshSession } = useStudio();
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [migration, setMigration] = useState<MigrationReport | null>(null);
  const [busy, setBusy] = useState<"download" | "inspect" | "restore" | "legacy" | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const statusRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void fetchMigrationReport().then(setMigration).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (status) statusRef.current?.focus({ preventScroll: true });
  }, [status]);

  async function download() {
    setBusy("download");
    setStatus(null);
    try {
      const backup = await downloadBackup();
      const href = URL.createObjectURL(backup.blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = backup.filename;
      link.click();
      URL.revokeObjectURL(href);
      setStatus({ tone: "success", message: "Backup downloaded." });
    } catch {
      setStatus({ tone: "error", message: "Backup download did not start." });
    } finally {
      setBusy(null);
    }
  }

  async function chooseBackup(file: File | undefined) {
    if (!file) return;
    setBusy("inspect");
    setInspection(null);
    setStatus(null);
    try {
      setInspection(await inspectBackup(file));
      setStatus({ tone: "success", message: "Backup checked. Confirm restore to continue." });
    } catch {
      setStatus({ tone: "error", message: "That backup could not be checked." });
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (!inspection) return;
    setBusy("restore");
    setStatus(null);
    try {
      await commitBackup(inspection.importToken);
      await refreshSession();
      setInspection(null);
      setStatus({ tone: "success", message: "Backup restored. Session reloaded." });
    } catch {
      setStatus({ tone: "error", message: "Restore did not finish. Your current database was kept." });
    } finally {
      setBusy(null);
    }
  }

  async function importLegacy() {
    if (!migration?.sourceSha256) return;
    setBusy("legacy");
    setStatus(null);
    try {
      await commitLegacyImport(migration.sourceSha256);
      await refreshSession();
      setMigration((report) => report ? { ...report, status: "imported" } : report);
      setStatus({ tone: "success", message: "Legacy checks imported. Session reloaded." });
    } catch {
      setStatus({ tone: "error", message: "Legacy import did not finish. Source progress was not changed." });
    } finally {
      setBusy(null);
    }
  }

  const candidateChecks = migration?.w1CandidateChecks?.filter(Boolean).length ?? 0;
  return (
    <section className="recovery-section" aria-labelledby="recovery-title">
      <div className="section-heading"><RotateCcw size={22} aria-hidden="true" /><div><span className="eyebrow">Local recovery</span><h2 id="recovery-title">Recovery</h2></div></div>
      <div className="recovery-row">
        <div><b>Backup</b><small>Download a private recovery copy.</small></div>
        <Button kind="secondary" icon={<Download size={18} />} disabled={busy !== null} onClick={() => void download()}>{busy === "download" ? "Preparing…" : "Download backup"}</Button>
      </div>
      <div className="recovery-row">
        <div><b>Restore a backup</b><small>Check a .ccaf-backup file before it can replace Studio progress.</small></div>
        <label className="button button--secondary recovery-file"><Upload size={18} aria-hidden="true" /><span>{busy === "inspect" ? "Checking…" : "Choose backup"}</span><input type="file" accept=".ccaf-backup,application/zip,application/x-zip-compressed" disabled={busy !== null} onChange={(event) => void chooseBackup(event.target.files?.[0])} /></label>
      </div>
      {inspection ? <div className="recovery-summary" aria-label="Backup inspection summary"><span><b>Database</b>{inspection.databaseId}</span><span><b>Schema</b>{inspection.schemaVersion}</span><span><b>Digest</b>{inspection.stateDigest}</span><Button kind="danger" disabled={busy !== null} onClick={() => void restore()}>{busy === "restore" ? "Restoring…" : "Confirm restore"}</Button></div> : null}
      {migration?.status === "pending_confirmation" ? <div className="recovery-row recovery-row--legacy">
        <div><b>Legacy import</b><small>{`Source unchanged: ${migration.sourceUnchanged ? "yes" : "no"}. Candidate W1 checks: ${candidateChecks}/6.`}</small></div>
        <Button kind="secondary" disabled={busy !== null || !migration.sourceUnchanged} onClick={() => void importLegacy()}>{busy === "legacy" ? "Importing…" : "Import legacy checks"}</Button>
      </div> : null}
      {status ? <section ref={statusRef} className={`recovery-status recovery-status--${status.tone}`} role={status.tone === "error" ? "alert" : "status"} tabIndex={-1}>{status.message}</section> : null}
    </section>
  );
}

export function SettingsPage() {
  const { ollamaAvailable, ollama, demo } = useStudio();
  const [localAi, setLocalAi] = useState(() => localStorage.getItem("ccaf-studio-local-ai") !== "off");
  const [largeText, setLargeText] = useState(() => localStorage.getItem("ccaf-studio-large-text") === "on");
  const [quietMotion, setQuietMotion] = useState(() => localStorage.getItem("ccaf-studio-quiet-motion") === "on");

  useEffect(() => {
    document.documentElement.dataset.largeText = largeText ? "true" : "false";
    document.documentElement.dataset.quietMotion = quietMotion ? "true" : "false";
    localStorage.setItem("ccaf-studio-local-ai", localAi ? "on" : "off");
    localStorage.setItem("ccaf-studio-large-text", largeText ? "on" : "off");
    localStorage.setItem("ccaf-studio-quiet-motion", quietMotion ? "on" : "off");
  }, [localAi, largeText, quietMotion]);

  const localTutorStatus = !localAi
    ? "Off. Saved hints remain available."
    : ollamaAvailable
      ? "On. llama3.2:3b is ready and unloads after each answer."
      : ollama.status === "protected"
        ? "On, but paused to protect this Mac's memory. Saved hints stay available."
        : "On. Saved hints are used while Ollama is unavailable.";

  return (
    <section className="secondary-view settings-view" aria-labelledby="settings-title">
      <div className="secondary-heading"><span className="eyebrow">Mac study preferences</span><h1 id="settings-title">Settings</h1></div>
      <div className="settings-list">
        <label className="setting-row"><Cpu size={22} aria-hidden="true" /><span><b>Local tutor</b><small>{localTutorStatus}</small></span><input type="checkbox" role="switch" checked={localAi} onChange={(event) => setLocalAi(event.target.checked)} /></label>
        <label className="setting-row"><Eye size={22} aria-hidden="true" /><span><b>Larger reading text</b><small>Increase lesson text without changing the rest of the Mac interface.</small></span><input type="checkbox" role="switch" checked={largeText} onChange={(event) => setLargeText(event.target.checked)} /></label>
        <label className="setting-row"><Gauge size={22} aria-hidden="true" /><span><b>Quiet motion</b><small>Use immediate state changes without animated transitions.</small></span><input type="checkbox" role="switch" checked={quietMotion} onChange={(event) => setQuietMotion(event.target.checked)} /></label>
        <div className="setting-row"><Volume2 size={22} aria-hidden="true" /><span><b>Read aloud</b><small>Uses the selected macOS system voice and never starts automatically.</small></span><span className="setting-value">On request</span></div>
      </div>
      {!demo && !PUBLIC_PREVIEW ? <RecoverySection /> : null}
    </section>
  );
}
