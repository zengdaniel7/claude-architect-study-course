import { Check, Circle } from "../../icons";
import type { StageId, StageState } from "../../types";

export function ProgressRail({ stages, percent, viewedStage, onSelectStage }: {
  stages: StageState[];
  percent: number;
  viewedStage?: StageId | null;
  onSelectStage?: (stage: StageId | null) => void;
}) {
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
        {stages.map((stage) => {
          const lookBack = onSelectStage && stage.status === "complete";
          const returnToCurrent = onSelectStage && Boolean(viewedStage) && (stage.status === "current" || stage.status === "needs-review");
          return (
            <li key={stage.id} className={`stage-marker stage-marker--${stage.status}${viewedStage === stage.id ? " stage-marker--viewing" : ""}`} aria-current={stage.status === "current" || stage.status === "needs-review" ? "step" : undefined}>
              {lookBack || returnToCurrent ? (
                <button
                  type="button"
                  className="stage-marker__button"
                  aria-pressed={viewedStage === stage.id}
                  aria-label={lookBack ? `Look back at the finished ${stage.label} step` : `Return to today's ${stage.label} step`}
                  onClick={() => onSelectStage(lookBack ? stage.id : null)}
                >
                  <span className="stage-marker__icon" aria-hidden="true">
                    {stage.status === "complete" ? <Check size={16} /> : <Circle size={13} />}
                  </span>
                  <span>{stage.label}</span>
                </button>
              ) : (
                <>
                  <span className="stage-marker__icon" aria-hidden="true">
                    {stage.status === "complete" ? <Check size={16} /> : <Circle size={13} />}
                  </span>
                  <span>{stage.label}</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
