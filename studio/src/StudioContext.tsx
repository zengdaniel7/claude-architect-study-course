import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { askTutor, cancelTutor, initializeApi, prepareFrontierReview, recordContentGap, submitAttempt } from "./api";
import type { OllamaState } from "./api";
import type { AttemptResponse, Feedback, SessionState, StageId, TutorResult } from "./types";

interface StudioContextValue {
  session: SessionState | null;
  loading: boolean;
  startupError: string | null;
  saving: boolean;
  demo: boolean;
  ollamaAvailable: boolean;
  ollama: OllamaState;
  feedback: Feedback | null;
  tutorResult: TutorResult | null;
  tutorState: "off" | "waking" | "thinking" | "ready" | "error";
  completeStage: (stage: StageId, payload: Record<string, unknown>, confidence?: string) => Promise<AttemptResponse | null>;
  getTutorHelp: (mode: "hint" | "simplify" | "classify", learnerText?: string) => Promise<void>;
  closeTutor: () => void;
  reportGap: () => Promise<void>;
  clearFeedback: () => void;
  prepareReview: () => Promise<{ prepared: boolean; reviewId?: string; demo?: boolean }>;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [demo, setDemo] = useState(false);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [ollama, setOllama] = useState<OllamaState>({ available: false, status: "unavailable" });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [tutorResult, setTutorResult] = useState<TutorResult | null>(null);
  const [tutorState, setTutorState] = useState<StudioContextValue["tutorState"]>("off");
  const activeTutor = useRef<{ turnId: string; controller: AbortController } | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.largeText = localStorage.getItem("ccaf-studio-large-text") === "on" ? "true" : "false";
    document.documentElement.dataset.quietMotion = localStorage.getItem("ccaf-studio-quiet-motion") === "on" ? "true" : "false";
    let active = true;
    initializeApi()
      .then((value) => {
        if (!active) return;
        setSession(value.session);
        setDemo(value.demo);
        setOllamaAvailable(value.ollama.available);
        setOllama(value.ollama);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setStartupError("Your saved progress could not be loaded. Nothing was changed. Restart Study Studio, then try again.");
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    activeTutor.current?.controller.abort();
    window.speechSynthesis?.cancel();
  }, []);

  const completeStage = useCallback(async (stage: StageId, payload: Record<string, unknown>, confidence?: string) => {
    if (!session) throw new Error("Session is not ready.");
    if (savingRef.current) return null;
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await submitAttempt(session, stage, payload, confidence);
      setSession(response.session);
      setFeedback(response.feedback);
      return response;
    } catch {
      setFeedback({
        tone: "repair",
        title: "Not saved yet",
        message: "Your work is still on this screen. Check that Study Studio is running, then try again.",
        nextAction: stage
      });
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [session]);

  const getTutorHelp = useCallback(async (mode: "hint" | "simplify" | "classify", learnerText = "") => {
    if (!session) return;
    setTutorResult(null);
    const localTutorEnabled = localStorage.getItem("ccaf-studio-local-ai") !== "off";
    if (!localTutorEnabled || !ollamaAvailable) {
      setTutorResult({
        advisory: true,
        summary: mode === "simplify" ? "A folder holds things. A file is one saved thing. A path is the route to it." : "Start at the final dot: the extension tells you the file type. Then trace the folders before it.",
        nextNudge: "Which part of /Users/me/study/card.json is the file?",
        sourceIds: ["course:w1"],
        uncertain: false,
        fallback: true
      });
      setTutorState("ready");
      return;
    }
    const turnId = crypto.randomUUID();
    const controller = new AbortController();
    activeTutor.current = { turnId, controller };
    setTutorState("waking");
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, 120);
        controller.signal.addEventListener("abort", () => {
          window.clearTimeout(timer);
          reject(new DOMException("Tutor request stopped", "AbortError"));
        }, { once: true });
      });
      if (activeTutor.current?.turnId !== turnId) return;
      setTutorState("thinking");
      const result = await askTutor(session.unitId, `${session.unitId}:${session.stage}`, mode, learnerText, turnId, controller.signal);
      if (activeTutor.current?.turnId !== turnId) return;
      setTutorResult(result);
      setTutorState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setTutorResult({
        advisory: true,
        summary: "The local tutor could not start, so the lesson is using its saved hint.",
        nextNudge: "Follow the folder names from left to right, then identify the final file name.",
        sourceIds: ["course:w1"],
        uncertain: false,
        fallback: true
      });
      setTutorState("error");
    } finally {
      if (activeTutor.current?.turnId === turnId) activeTutor.current = null;
    }
  }, [session, ollamaAvailable]);

  const closeTutor = useCallback(() => {
    const active = activeTutor.current;
    if (active) {
      active.controller.abort();
      void cancelTutor(active.turnId).catch(() => undefined);
      activeTutor.current = null;
    }
    window.speechSynthesis?.cancel();
    setTutorResult(null);
    setTutorState("off");
  }, []);

  const reportGap = useCallback(async () => {
    if (!session) return;
    try {
      await recordContentGap(session.unitId, `${session.unitId}:${session.stage}`, `I have not learned the prerequisite for the ${session.stage} stage yet.`);
      setFeedback({
        tone: "info",
        title: "Knowledge gap recorded",
        message: "This did not count against you. It is waiting for course review.",
        nextAction: session.stage
      });
    } catch {
      setFeedback({
        tone: "repair",
        title: "Gap not recorded yet",
        message: "Your note stayed private on this screen. Restart Study Studio and try again.",
        nextAction: session.stage
      });
    }
  }, [session]);

  const prepareReview = useCallback(async () => {
    try {
      return await prepareFrontierReview();
    } catch {
      setFeedback({
        tone: "repair",
        title: "Review packet not prepared",
        message: "Study Studio could not reach the local server. No progress changed.",
        nextAction: session?.stage
      });
      return { prepared: false };
    }
  }, [session?.stage]);

  const value = useMemo<StudioContextValue>(() => ({
    session,
    loading,
    startupError,
    saving,
    demo,
    ollamaAvailable,
    ollama,
    feedback,
    tutorResult,
    tutorState,
    completeStage,
    getTutorHelp,
    closeTutor,
    reportGap,
    clearFeedback: () => setFeedback(null),
    prepareReview
  }), [session, loading, startupError, saving, demo, ollamaAvailable, ollama, feedback, tutorResult, tutorState, completeStage, getTutorHelp, closeTutor, reportGap, prepareReview]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const value = useContext(StudioContext);
  if (!value) throw new Error("useStudio must be used within StudioProvider");
  return value;
}
