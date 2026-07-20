import { ArrowRight, RotateCcw } from "../icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudio } from "../StudioContext";
import { fetchPendingReview } from "../api";
import { manifest } from "../content";
import type { ReviewCard, ReviewRating } from "../types";
import { Button } from "../components/atoms/Button";
import { useSceneFocus } from "../useSceneFocus";
import { PUBLIC_PREVIEW } from "../preview";

interface PendingRating {
  cardId: string;
  rating: ReviewRating;
  ratingId: string;
  elapsedMs: number;
}

function previewCards(): ReviewCard[] {
  const fallback = manifest.cards.w1?.[0] ?? ["File", "One saved item, such as tiny-order.json."];
  return [{ id: "w1-preview", front: `What is a ${fallback[0].toLowerCase()}?`, back: fallback[1], source: "Lesson concept" }];
}

export function ReviewStage() {
  const { rateReviewCard, demo, saving } = useStudio();
  const initial = useMemo(previewCards, []);
  const [queue, setQueue] = useState(initial);
  const [reviewId, setReviewId] = useState("");
  const [loadingCards, setLoadingCards] = useState(!demo);
  const [loadError, setLoadError] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [grade, setGrade] = useState<ReviewRating | null>(null);
  const [pendingRating, setPendingRating] = useState<PendingRating | null>(null);
  const [nextQueue, setNextQueue] = useState<ReviewCard[] | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "next" | "success" | "error">("idle");
  const submitStatusRef = useRef<HTMLElement>(null);
  const cardStartedAt = useRef(Date.now());
  const card = queue[0];
  useSceneFocus(`review-${card?.id ?? "empty"}-${card?.repetitions ?? 0}`);

  useEffect(() => {
    if (demo) {
      setReviewId("demo-review");
      setLoadingCards(false);
      return;
    }
    let active = true;
    fetchPendingReview().then((review) => {
      if (!active) return;
      setQueue(review?.cards ?? []);
      setReviewId(review?.reviewId ?? "");
      setLoadingCards(false);
    }).catch(() => {
      if (!active) return;
      setLoadError("The review queue is temporarily unavailable. Your quiz result is still saved.");
      setLoadingCards(false);
    });
    return () => { active = false; };
  }, [demo]);

  useEffect(() => {
    cardStartedAt.current = Date.now();
  }, [card?.id, card?.repetitions]);

  useEffect(() => {
    if (submitState !== "idle") submitStatusRef.current?.focus({ preventScroll: true });
  }, [submitState]);

  async function saveRating() {
    if (!grade || !card || !reviewId) return;
    const request = pendingRating?.cardId === card.id && pendingRating.rating === grade
      ? pendingRating
      : {
          cardId: card.id,
          rating: grade,
          ratingId: crypto.randomUUID(),
          elapsedMs: Math.min(3_600_000, Math.max(0, Date.now() - cardStartedAt.current))
        };
    setPendingRating(request);
    setSubmitState("idle");
    const response = await rateReviewCard(reviewId, card.id, request.rating, request.elapsedMs, request.ratingId, queue);
    if (!response) {
      setSubmitState("error");
      return;
    }
    setPendingRating(null);
    if (response.reviewComplete) {
      setQueue([]);
      setRevealed(false);
      setGrade(null);
      setNextQueue(null);
      setSubmitState("success");
      return;
    }
    setNextQueue(response.queue);
    setSubmitState("next");
  }

  function showNextCard() {
    if (!nextQueue?.length) return;
    setQueue(nextQueue);
    setNextQueue(null);
    setRevealed(false);
    setGrade(null);
    setPendingRating(null);
    setSubmitState("idle");
  }

  if (loadingCards) return <div className="loading-view" role="status">Loading your saved review card…</div>;
  if (loadError && !demo) return <div className="empty-state" role="alert"><h1>Review is still saved</h1><p>{loadError}</p></div>;
  if (!card && submitState === "success") return <section ref={submitStatusRef} className="review-submit-status review-submit-status--success" role="status" tabIndex={-1}><strong>{PUBLIC_PREVIEW ? "Preview review complete." : "Review saved."}</strong><span>{PUBLIC_PREVIEW ? "This run is not saved." : "The saved queue is complete."}</span></section>;
  if (!card) return <div className="empty-state" role="status"><h1>No review card is due</h1><p>Return to Home and continue your course.</p></div>;
  const retrying = Boolean(pendingRating);
  return (
    <section className="lesson-scene review-scene" aria-labelledby="review-title">
      <div className="scene-heading">
        <span className="eyebrow">{queue.length} card{queue.length === 1 ? "" : "s"} due</span>
        <h1 id="review-title">Review one idea</h1>
        <p>Say your answer before revealing the back.</p>
      </div>

      <article className={`review-card ${revealed ? "review-card--revealed" : ""}`}>
        <span>{card.source}</span>
        <h2>{card.front}</h2>
        {revealed ? <div className="review-card__answer"><b>Answer</b><p>{card.back}</p></div> : null}
      </article>

      {!revealed ? (
        <div className="review-actions"><Button kind="primary" onClick={() => setRevealed(true)}>Show answer</Button></div>
      ) : (
        <fieldset className="review-grades" disabled={saving || retrying || submitState === "next"}>
          <legend>How did recall feel?</legend>
          <label><input type="radio" name="grade" checked={grade === "again"} onChange={() => setGrade("again")} /> Again</label>
          <label><input type="radio" name="grade" checked={grade === "hard"} onChange={() => setGrade("hard")} /> Hard</label>
          <label><input type="radio" name="grade" checked={grade === "good"} onChange={() => setGrade("good")} /> Got it</label>
        </fieldset>
      )}

      <div className="scene-actionbar">
        <p>{submitState === "next" ? "Rating complete. Move on when you are ready." : revealed ? grade === "again" ? PUBLIC_PREVIEW ? "This card will repeat once in the preview queue." : "This card will repeat in the saved queue." : retrying ? "Retry the same rating so Study Studio can recover its saved receipt." : PUBLIC_PREVIEW ? "Choose a rating, then continue." : "Choose a rating, then save it." : "Reveal only after trying to answer."}</p>
        {submitState === "next" ? <Button kind="primary" icon={<ArrowRight size={18} />} onClick={showNextCard}>Next card</Button> : revealed ? <Button kind="primary" icon={grade === "again" ? <RotateCcw size={18} /> : <ArrowRight size={18} />} disabled={!grade || saving || submitState === "success"} onClick={() => void saveRating()}>{saving ? PUBLIC_PREVIEW ? "Moving…" : "Saving…" : retrying ? "Retry rating" : PUBLIC_PREVIEW ? "Continue" : "Save rating"}</Button> : null}
      </div>
      {submitState === "next" ? <section ref={submitStatusRef} className="review-submit-status review-submit-status--success" role="status" tabIndex={-1}><strong>Rating complete.</strong><span>The next card is ready.</span></section> : null}
      {submitState === "success" ? <section ref={submitStatusRef} className="review-submit-status review-submit-status--success" role="status" tabIndex={-1}><strong>{PUBLIC_PREVIEW ? "Preview review complete." : "Review saved."}</strong><span>{PUBLIC_PREVIEW ? "This run is not saved." : "The saved queue is complete."}</span></section> : null}
      {submitState === "error" ? <section ref={submitStatusRef} className="review-submit-status review-submit-status--error" role="alert" tabIndex={-1}><strong>Rating was not saved.</strong><span>Your selected rating is ready to retry.</span></section> : null}
    </section>
  );
}
