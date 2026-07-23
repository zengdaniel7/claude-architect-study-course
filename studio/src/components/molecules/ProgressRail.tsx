import { Check, Circle } from "../../icons";
import type { StageState } from "../../types";

export function ProgressRail({ stages, percent }: { stages: StageState[]; percent: number }) {
  return (
    <section className="progress-rail" aria-label="Lesson progress">
      <div className="progress-rail__summary">
        <span>Current lesson</span>
        <strong>{percent}% complete</strong>
      </div>
      <div className="progress-rail__bar" role="progressbar" aria-label="Lesson completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <ol className="progress-rail__stages">
        {stages.map((stage) => (
          <li key={stage.id} className={`stage-marker stage-marker--${stage.status}`} aria-current={stage.status === "current" || stage.status === "needs-review" ? "step" : undefined}>
            <span className="stage-marker__icon" aria-hidden="true">
              {stage.status === "complete" ? <Check size={16} /> : <Circle size={13} />}
            </span>
            <span>{stage.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
