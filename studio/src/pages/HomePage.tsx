import { ArrowRight, BookOpenCheck, CalendarDays, CheckCircle2, Clock3, Server, ShieldCheck } from "../icons";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useStudio } from "../StudioContext";
import { Button } from "../components/atoms/Button";
import { ProgressRail } from "../components/molecules/ProgressRail";

export function HomePage() {
  const { session, loading, demo, prepareReview } = useStudio();
  const [reviewStatus, setReviewStatus] = useState("");
  if (loading || !session) return <div className="loading-view" role="status">Loading your saved progress…</div>;
  const mastered = session.mastery === "mastered";
  const reviewDue = mastered && session.dueReviews > 0;
  const currentLabel = session.stages[session.stageIndex]?.label ?? "lesson";

  async function prepare() {
    const result = await prepareReview();
    setReviewStatus(result.prepared ? "Review packet ready in Codex or Claude." : demo ? "Deep review is available in local mode." : "Review packet was not prepared. Try again after restarting Study Studio.");
  }

  return (
    <div className="home-view">
      <section className="home-focus" aria-labelledby="home-title">
        <div>
          <span className="eyebrow">{reviewDue ? "Review due" : mastered ? "Lesson mastered" : "Continue where you stopped"}</span>
          <h1 id="home-title">{session.title}</h1>
          <p>{reviewDue ? `${session.dueReviews} saved card${session.dueReviews === 1 ? " is" : "s are"} ready for a short review.` : mastered ? "All six lesson stages are complete. Your evidence and zero-guess result stay saved." : <>Your next step is <b>{currentLabel}</b>. Completed work stays saved.</>}</p>
        </div>
        <Link className="button button--primary button--large" to={reviewDue ? "/session" : mastered ? "/archive" : "/session"}><span>{reviewDue ? "Start review" : mastered ? "Open W1 archive" : "Continue lesson"}</span><ArrowRight size={20} aria-hidden="true" /></Link>
      </section>

      <ProgressRail stages={session.stages} percent={session.progressPercent} />

      <div className="home-columns">
        <section className="today-plan" aria-labelledby="today-title">
          <div className="section-heading"><CalendarDays size={22} aria-hidden="true" /><div><span className="eyebrow">Today</span><h2 id="today-title">One small finish line</h2></div></div>
          <p>{reviewDue ? "Review the due card once. The next interval is set from your rating." : mastered ? "Nothing is overdue. Return only when a review card is due or when you are ready for the next unit." : <>Complete the {currentLabel.toLowerCase()} step. Anything else is a bonus.</>}</p>
          <div className="time-estimate"><Clock3 size={18} aria-hidden="true" /><span>{reviewDue ? "About 3 minutes" : mastered ? "W1 complete" : "About 20 minutes"}</span></div>
        </section>

        <section className="weekly-plan" aria-labelledby="week-title">
          <div className="section-heading"><BookOpenCheck size={22} aria-hidden="true" /><div><span className="eyebrow">This week</span><h2 id="week-title">Top three</h2></div></div>
          {mastered ? (
            <div className="weekly-finished"><CheckCircle2 size={24} aria-hidden="true" /><div><b>W1 top three complete</b><p>Your weekly review will set the next three when you are ready.</p></div></div>
          ) : (
            <><ol>{session.weeklyTopThree.map((item) => <li key={item}>{item}</li>)}</ol><p className="microcopy">Unfinished work carries forward. The finish week can move.</p></>
          )}
        </section>
      </div>

      <section className="system-strip" aria-label="Tutor system status">
        <div>{demo ? <Server size={21} aria-hidden="true" /> : <ShieldCheck size={21} aria-hidden="true" />}<span><b>{demo ? "Preview mode" : "Local and private"}</b><small>{session.legacyImported ? "Legacy progress imported" : "No progress was overwritten"}</small></span></div>
        <Button kind="quiet" onClick={() => void prepare()}>Prepare deep review</Button>
        {reviewStatus ? <span className="inline-status" role="status">{reviewStatus}</span> : null}
      </section>
    </div>
  );
}
