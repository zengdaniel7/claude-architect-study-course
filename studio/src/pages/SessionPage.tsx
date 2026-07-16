import { ArrowRight, CheckCircle2, RotateCcw } from "../icons";
import { Link } from "react-router-dom";
import { useStudio } from "../StudioContext";
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
  useSceneFocus(`${session?.stage ?? "loading"}:${session?.mastery ?? "seen"}`);
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
          <p>You finished Learn, Draw, Build, Teach, Quiz, and Review. Your saved evidence stays available for a later deep review.</p>
          <div className="completion-actions">
            <Link className="button button--primary" to="/course"><span>View course map</span><ArrowRight size={18} aria-hidden="true" /></Link>
            <Link className="button" to="/review"><RotateCcw size={18} aria-hidden="true" /><span>Review queue</span></Link>
          </div>
        </section>
      </div>
    );
  }
  const Stage = stages[session.stage];
  return (
    <div className="session-view">
      <ProgressRail stages={session.stages} percent={session.progressPercent} />
      <FeedbackBanner />
      <div className="lesson-layout">
        <Stage />
        <TutorDrawer />
      </div>
    </div>
  );
}
