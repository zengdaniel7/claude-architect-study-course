import { ArrowRight, RotateCcw } from "../icons";
import { Link } from "react-router-dom";
import { useStudio } from "../StudioContext";

export function ReviewHubPage() {
  const { session } = useStudio();
  const due = session?.dueReviews ?? 0;
  const hasDueReview = due > 0;
  return (
    <section className="secondary-view" aria-labelledby="review-hub-title">
      <div className="secondary-heading"><span className="eyebrow">Spaced practice</span><h1 id="review-hub-title">Review queue</h1><p>Wrong answers and correct guesses return here.</p></div>
      <div className="queue-summary">
        <RotateCcw size={30} aria-hidden="true" />
        <div><strong>{due} cards due</strong><p>{hasDueReview ? "Review uses one card, one rating, and an explicit Next card button." : "Nothing is waiting. Guesses and missed answers will return here."}</p></div>
        {hasDueReview ? <Link className="button button--primary" to="/session"><span>Start review</span><ArrowRight size={18} aria-hidden="true" /></Link> : session?.mastery !== "mastered" ? <Link className="button" to="/session"><span>Return to lesson</span><ArrowRight size={18} aria-hidden="true" /></Link> : null}
      </div>
    </section>
  );
}
