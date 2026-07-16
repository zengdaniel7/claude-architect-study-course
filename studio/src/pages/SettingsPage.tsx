import { Cpu, Eye, Gauge, Volume2 } from "../icons";
import { useEffect, useState } from "react";
import { useStudio } from "../StudioContext";

export function SettingsPage() {
  const { ollamaAvailable, ollama } = useStudio();
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

  return (
    <section className="secondary-view settings-view" aria-labelledby="settings-title">
      <div className="secondary-heading"><span className="eyebrow">Mac study preferences</span><h1 id="settings-title">Settings</h1></div>
      <div className="settings-list">
        <label className="setting-row"><Cpu size={22} aria-hidden="true" /><span><b>Local tutor</b><small>{ollamaAvailable ? "llama3.2:3b is ready and unloads after each answer" : ollama.status === "protected" ? "Paused to protect this Mac's memory; saved hints stay available" : "Saved hints are used when Ollama is unavailable"}</small></span><input type="checkbox" role="switch" checked={localAi} onChange={(event) => setLocalAi(event.target.checked)} /></label>
        <label className="setting-row"><Eye size={22} aria-hidden="true" /><span><b>Larger reading text</b><small>Increase lesson text without changing the rest of the Mac interface.</small></span><input type="checkbox" role="switch" checked={largeText} onChange={(event) => setLargeText(event.target.checked)} /></label>
        <label className="setting-row"><Gauge size={22} aria-hidden="true" /><span><b>Quiet motion</b><small>Use immediate state changes without animated transitions.</small></span><input type="checkbox" role="switch" checked={quietMotion} onChange={(event) => setQuietMotion(event.target.checked)} /></label>
        <div className="setting-row"><Volume2 size={22} aria-hidden="true" /><span><b>Read aloud</b><small>Uses the selected macOS system voice and never starts automatically.</small></span><span className="setting-value">On request</span></div>
      </div>
    </section>
  );
}
