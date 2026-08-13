import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2 } from "../icons";
import { Link } from "react-router-dom";
import { useStudio } from "../StudioContext";
import type { StageId } from "../types";
import { FeedbackBanner } from "../components/molecules/FeedbackBanner";
import { ProgressRail } from "../components/molecules/ProgressRail";
import { TutorDrawer } from "../components/organisms/TutorDrawer";
import { BuildStage } from "../stages/BuildStage";
import { DrawStage } from "../stages/DrawStage";
import { LearnStage } from "../stages/LearnStage";
import { QuizStage } from "../stages/QuizStage";
import { ReviewStage } from "../stages/ReviewStage";
import { TeachStage } from "../stages/TeachStage";
import { useSceneFocus } from "../useSceneFocus";
import { PUBLIC_PREVIEW } from "../preview";

const stages = {
  learn: LearnStage,
  draw: DrawStage,
  build: BuildStage,
  teach: TeachStage,
  quiz: QuizStage,
  review: ReviewStage
};

export function SessionPage() {
  const { session, loading } = useStudio();
  const [lookBack, setLookBack] = useState<StageId | null>(null);
  const currentStage = session?.stage;
  useEffect(() => {
    // Finishing a step (or any server-side stage change) always snaps back to today's step.
    setLookBack(null);
  }, [currentStage]);
  useSceneFocus(`${lookBack ?? session?.stage ?? "loading"}:${session?.mastery ?? "seen"}`);
  if (loading || !session) return <div className="loading-view" role="status">Opening your lesson…</div>;
  if (session.mastery === "mastered" && session.dueReviews === 0) {
    return (
      <div className="session-view">
        <ProgressRail stages={session.stages} percent={session.progressPercent} />
        <FeedbackBanner />
        <section className="completion-view" aria-labelledby="completion-title">
          <CheckCircle2 size={42} aria-hidden="true" />
          <span className="eyebrow">W1 mastered</span>
          <h1 id="completion-title">Files, folders, and plain text complete</h1>
          <p>{PUBLIC_PREVIEW ? "You finished Learn, Draw, Build, Teach, Quiz, and Review in this preview. This run is not saved." : "You finished Learn, Draw, Build, Teach, Quiz, and Review. Your saved evidence stays available in the W1 archive."}</p>
          <div className="completion-actions">
            <Link className="button button--primary" to="/archive"><span>Open W1 archive</span><ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
        </section>
      </div>
    );
  }
  const completedStageIds = session.stages.filter((stage) => stage.status === "complete").map((stage) => stage.id);
  const viewedStage = lookBack && completedStageIds.includes(lookBack) ? lookBack : null;
  const Stage = stages[viewedStage ?? session.stage];
  const currentLabel = session.stages[session.stageIndex]?.label ?? "current";
  const viewedLabel = session.stages.find((stage) => stage.id === viewedStage)?.label ?? "";
  return (
    <div className="session-view">
      <ProgressRail
        stages={session.stages}
        percent={session.progressPercent}
        viewedStage={viewedStage}
        onSelectStage={setLookBack}
      />
      <FeedbackBanner />
      {viewedStage && (
        <div className="lookback-banner" role="status">
          <p><strong>Looking back at {viewedLabel}.</strong> This step is already finished — nothing here changes your progress. Today's step is <strong>{currentLabel}</strong>.</p>
          <button type="button" className="button button--primary" onClick={() => setLookBack(null)}>Back to today's step</button>
        </div>
      )}
      <div className="lesson-layout">
        {viewedStage ? (
          <fieldset className="stage-lookback" disabled aria-label={`Finished ${viewedLabel} step, read-only`}>
            <Stage />
          </fieldset>
        ) : (
          <Stage />
        )}
        <TutorDrawer />
      </div>
    </div>
  );
}
