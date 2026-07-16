import { ArrowRight, RotateCcw } from "../icons";
import { useEffect, useMemo, useState } from "react";
import { useStudio } from "../StudioContext";
import { fetchPendingReview } from "../api";
import { manifest } from "../content";
import type { ReviewCard } from "../types";
import { Button } from "../components/atoms/Button";
import { useSceneFocus } from "../useSceneFocus";

function loadCards(): ReviewCard[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem("ccaf-studio-review-cards") ?? "[]") as ReviewCard[];
    if (saved.length) return saved;
  } catch {
    // Use the source-backed fallback card below.
  }
  const fallback = manifest.cards.w1?.[0] ?? ["File", "One saved item, such as tiny-order.json."];
  return [{ id: "w1-fallback", front: `What is a ${fallback[0].toLowerCase()}?`, back: fallback[1], source: "Lesson concept" }];
}

export function ReviewStage() {
  const { completeStage, demo, saving } = useStudio();
  const initial = useMemo(loadCards, []);
  const [queue, setQueue] = useState(initial);
  const [reviewId, setReviewId] = useState(() => sessionStorage.getItem("ccaf-studio-review-id") ?? "");
  const [loadingCards, setLoadingCards] = useState(!demo);
  const [loadError, setLoadError] = useState("");
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [grade, setGrade] = useState<"again" | "hard" | "good" | null>(null);
  const card = queue[index];
  useSceneFocus(`review-${index}`);

  useEffect(() => {
    if (demo) {
      setLoadingCards(false);
      return;
    }
    let active = true;
    fetchPendingReview().then((review) => {
      if (!active) return;
      if (review?.cards.length) {
        setQueue(review.cards);
        setIndex(0);
        setRevealed(false);
        setGrade(null);
        setReviewId(review.reviewId);
        sessionStorage.setItem("ccaf-studio-review-cards", JSON.stringify(review.cards));
        sessionStorage.setItem("ccaf-studio-review-id", review.reviewId);
      } else {
        setLoadError("The saved review card could not be found. Restart Study Studio, then return here.");
      }
      setLoadingCards(false);
    }).catch(() => {
      if (!active) return;
      setLoadError("The review queue is temporarily unavailable. Your quiz result is still saved.");
      setLoadingCards(false);
    });
    return () => { active = false; };
  }, [demo]);

  async function next() {
    if (!grade || !card) return;
    let nextQueue = queue;
    if (grade === "again") nextQueue = [...queue, card];
    setQueue(nextQueue);
    if (index < nextQueue.length - 1) {
      setIndex((value) => value + 1);
      setRevealed(false);
      setGrade(null);
      return;
    }
    const response = await completeStage("review", { reviewId: reviewId || "demo-review", reviewed: nextQueue.length, finalGrade: grade });
    if (response) {
      sessionStorage.removeItem("ccaf-studio-review-cards");
      sessionStorage.removeItem("ccaf-studio-review-id");
    }
  }

  if (loadingCards) return <div className="loading-view" role="status">Loading your saved review card…</div>;
  if (loadError && !demo) return <div className="empty-state" role="status"><h1>Review is still saved</h1><p>{loadError}</p></div>;
  if (!card) return <div className="empty-state" role="status"><h1>No review card is due</h1><p>Return to Home and continue your course.</p></div>;
  const actionLabel = grade === "again" ? "Review again" : index === queue.length - 1 ? "Finish review" : "Next card";
  return (
    <section className="lesson-scene review-scene" aria-labelledby="review-title">
      <div className="scene-heading">
        <span className="eyebrow">Card {index + 1} of {queue.length}</span>
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
        <fieldset className="review-grades">
          <legend>How did recall feel?</legend>
          <label><input type="radio" name="grade" checked={grade === "again"} onChange={() => setGrade("again")} /> Again</label>
          <label><input type="radio" name="grade" checked={grade === "hard"} onChange={() => setGrade("hard")} /> Hard</label>
          <label><input type="radio" name="grade" checked={grade === "good"} onChange={() => setGrade("good")} /> Got it</label>
        </fieldset>
      )}

      <div className="scene-actionbar">
        <p>{revealed ? grade === "again" ? "This card will repeat now." : "Choose a rating, then continue." : "Reveal only after trying to answer."}</p>
        {revealed ? <Button kind="primary" icon={grade === "again" || index === queue.length - 1 ? <RotateCcw size={18} /> : <ArrowRight size={18} />} disabled={!grade || saving} onClick={() => void next()}>{saving ? "Saving…" : actionLabel}</Button> : null}
      </div>
    </section>
  );
}
