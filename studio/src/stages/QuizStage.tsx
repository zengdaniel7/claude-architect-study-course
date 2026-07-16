import { ArrowRight, CheckCircle2, HelpCircle, XCircle } from "../icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudio } from "../StudioContext";
import { manifest } from "../content";
import type { Confidence, ReviewCard } from "../types";
import { Button } from "../components/atoms/Button";
import { useSceneFocus } from "../useSceneFocus";

interface Answer { choice: number; confidence: Confidence; correct: boolean }

export function QuizStage() {
  const { session, saving, completeStage } = useStudio();
  const questions = manifest.banks[session?.unitId ?? "w1"]?.questions ?? [];
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<Confidence>("know");
  const [checked, setChecked] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const feedbackRef = useRef<HTMLElement>(null);
  const question = questions[index];
  const correct = choice === question?.ans;
  const score = useMemo(() => answers.filter((answer) => answer.correct).length, [answers]);
  const displayedScore = score + (checked && correct ? 1 : 0);
  useSceneFocus(`quiz-${index}`);

  useEffect(() => {
    if (checked) feedbackRef.current?.focus({ preventScroll: true });
  }, [checked]);

  if (!question) return <p>Quiz content is unavailable.</p>;

  function checkAnswer() {
    if (choice === null) return;
    setChecked(true);
  }

  async function nextQuestion() {
    if (choice === null) return;
    const nextAnswers = [...answers, { choice, confidence, correct }];
    setAnswers(nextAnswers);
    if (index < questions.length - 1) {
      setIndex((value) => value + 1);
      setChoice(null);
      setConfidence("know");
      setChecked(false);
      return;
    }
    const reviewCards: ReviewCard[] = nextAnswers.flatMap((answer, answerIndex) => {
      if (answer.correct && answer.confidence !== "guess") return [];
      const source = questions[answerIndex];
      return [{ id: `w1-${answerIndex}`, front: source.q, back: `${source.opts[source.ans]} — ${source.why}`, source: answer.correct ? "Correct guess" : "Missed question" }];
    });
    sessionStorage.setItem("ccaf-studio-review-cards", JSON.stringify(reviewCards));
    await completeStage("quiz", {
      answers: nextAnswers.map((answer, answerIndex) => ({ choice: answer.choice, confidence: answer.confidence, questionIndex: answerIndex }))
    });
  }

  return (
    <section className="lesson-scene quiz-scene" aria-labelledby="quiz-title">
      <div className="question-progress"><span>Question {index + 1} of {questions.length}</span><span>{displayedScore} correct so far</span></div>
      <div className="scene-heading">
        <span className="eyebrow">One question</span>
        <h1 id="quiz-title" tabIndex={-1}>{question.q}</h1>
      </div>
      <fieldset className="answer-list" disabled={checked}>
        <legend className="sr-only">Choose one answer</legend>
        {question.opts.map((option, optionIndex) => (
          <label key={option} className={`answer-option ${choice === optionIndex ? "answer-option--selected" : ""}`}>
            <input type="radio" name={`q-${index}`} checked={choice === optionIndex} onChange={() => setChoice(optionIndex)} />
            <span className="answer-letter">{String.fromCharCode(65 + optionIndex)}</span>
            <span>{option}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="confidence-control" disabled={checked}>
        <legend>How sure are you?</legend>
        {(["know", "maybe", "guess"] as Confidence[]).map((value) => (
          <label key={value}><input type="radio" name={`confidence-${index}`} checked={confidence === value} onChange={() => setConfidence(value)} /> {value === "know" ? "I know" : value === "maybe" ? "Maybe" : "I guessed"}</label>
        ))}
      </fieldset>

      {checked ? (
        <section ref={feedbackRef} className={`answer-feedback ${correct ? "answer-feedback--correct" : "answer-feedback--wrong"}`} role="status" tabIndex={-1}>
          {correct ? <CheckCircle2 size={26} aria-hidden="true" /> : <XCircle size={26} aria-hidden="true" />}
          <div><strong>{correct ? "Correct" : "Not yet"}</strong><p>{question.why}</p>{confidence === "guess" ? <p><b>Marked as a guess:</b> this will return in Review.</p> : null}</div>
        </section>
      ) : null}

      <div className="scene-actionbar">
        <p>{checked ? "Read the feedback, then continue." : "Choose an answer and record your confidence."}</p>
        {!checked ? (
          <Button kind="primary" icon={<HelpCircle size={18} />} disabled={choice === null} onClick={checkAnswer}>Check answer</Button>
        ) : (
          <Button kind="primary" icon={<ArrowRight size={18} />} disabled={saving} onClick={() => void nextQuestion()}>{saving ? "Saving…" : index === questions.length - 1 ? "Finish quiz" : "Next question"}</Button>
        )}
      </div>
    </section>
  );
}
