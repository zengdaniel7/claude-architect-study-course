import { Bot, CircleAlert, Eye, Lightbulb, LoaderCircle, PanelRightClose, Sparkles, StopCircle, Volume2 } from "../../icons";
import { useEffect, useState } from "react";
import { useStudio } from "../../StudioContext";
import { Button } from "../atoms/Button";

export function TutorDrawer({ learnerText = "" }: { learnerText?: string }) {
  const { getTutorHelp, closeTutor, reportGap, tutorResult, tutorState, ollamaAvailable } = useStudio();
  const [expanded, setExpanded] = useState(false);
  const active = tutorState !== "off";

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function showVisual() {
    const visual = document.querySelector<HTMLElement>(".path-visual, .sketch-pad, .concept-strip, .rubric-panel");
    const quiet = localStorage.getItem("ccaf-studio-quiet-motion") === "on" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    visual?.scrollIntoView({ behavior: quiet ? "auto" : "smooth", block: "center" });
  }

  function readAloud() {
    window.speechSynthesis.cancel();
    const text = document.querySelector<HTMLElement>(".lesson-scene")?.innerText ?? "";
    if (text) window.speechSynthesis.speak(new SpeechSynthesisUtterance(text.slice(0, 2_000)));
  }

  function close() {
    closeTutor();
    setExpanded(false);
  }

  return (
    <aside className={`tutor-drawer ${expanded || active ? "tutor-drawer--open" : "tutor-drawer--closed"}`} aria-label="Lesson help">
      <div className="tutor-drawer__header">
        <div>
          <span className="eyebrow">Optional help</span>
          <h2>Need help?</h2>
        </div>
        {expanded || active ? (
          <button type="button" className="icon-button" onClick={close} aria-label="Close lesson help"><PanelRightClose size={21} /></button>
        ) : null}
      </div>
      {!expanded && !active ? <Button onClick={() => setExpanded(true)}>Open help</Button> : null}
      {expanded && !active ? (
        <div className="tutor-drawer__actions">
          <Button icon={<Lightbulb size={18} />} onClick={() => getTutorHelp("hint", learnerText)}>Give one hint</Button>
          <Button kind="quiet" icon={<Sparkles size={18} />} onClick={() => getTutorHelp("simplify", learnerText)}>Explain simply</Button>
          <Button kind="quiet" icon={<Eye size={18} />} onClick={showVisual}>Show visually</Button>
          <Button kind="quiet" icon={<Volume2 size={18} />} onClick={readAloud}>Read aloud</Button>
          <Button kind="quiet" icon={<CircleAlert size={18} />} onClick={() => void reportGap()}>I have not learned this yet</Button>
          <p className="microcopy">{ollamaAvailable ? "The model wakes for this request, then unloads." : "A saved lesson hint works even when Ollama is off."}</p>
        </div>
      ) : null}
      {tutorState === "waking" || tutorState === "thinking" ? (
        <div className="tutor-status" role="status">
          <LoaderCircle className="spin" size={22} aria-hidden="true" />
          <div><strong>{tutorState === "waking" ? "Waking local tutor" : "Thinking"}</strong><p>You can keep reading while it works.</p></div>
          <Button kind="quiet" icon={<StopCircle size={18} />} onClick={close}>Stop</Button>
        </div>
      ) : null}
      {tutorResult ? (
        <div className="tutor-answer" role="status">
          <Bot size={22} aria-hidden="true" />
          <div>
            <strong>{tutorResult.fallback ? "Saved course hint" : "AI suggestion"}</strong>
            <p>{tutorResult.summary}</p>
            <p className="tutor-nudge"><b>Try this:</b> {tutorResult.nextNudge}</p>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
