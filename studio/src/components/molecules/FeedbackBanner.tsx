import { CheckCircle2, Info, RotateCcw, X } from "../../icons";
import { useStudio } from "../../StudioContext";

export function FeedbackBanner() {
  const { feedback, clearFeedback } = useStudio();
  if (!feedback) return null;
  const Icon = feedback.tone === "success" ? CheckCircle2 : feedback.tone === "repair" ? RotateCcw : Info;
  return (
    <section className={`feedback feedback--${feedback.tone}`} role="status" aria-live="polite">
      <Icon size={24} aria-hidden="true" />
      <div><strong>{feedback.title}</strong><p>{feedback.message}</p></div>
      <button type="button" className="icon-button" onClick={clearFeedback} aria-label="Dismiss feedback"><X size={19} /></button>
    </section>
  );
}
