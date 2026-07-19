import { Mic, Play, Square, Trash2 } from "../icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudio } from "../StudioContext";
import { Button } from "../components/atoms/Button";

const rubric = [
  { id: "file", label: "A file is one saved item", pattern: /\bfile\b/i },
  { id: "folder", label: "A folder holds files", pattern: /\bfolder\b/i },
  { id: "path", label: "A path shows where the item lives", pattern: /\bpath\b|\/users\//i },
  { id: "plain", label: "The extension or plain-text format matters", pattern: /extension|plain[ -]?text|\.json/i }
];

export function TeachStage() {
  const { saving, completeStage } = useStudio();
  const [words, setWords] = useState("");
  const [recording, setRecording] = useState(false);
  const [permissionPending, setPermissionPending] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [recordingError, setRecordingError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioUrlRef = useRef("");
  const disposedRef = useRef(false);
  const permissionRequestRef = useRef(0);
  const chunksRef = useRef<Blob[]>([]);
  const matched = useMemo(() => rubric.map((item) => item.pattern.test(words)), [words]);
  const ready = words.trim().length >= 60 && matched.every(Boolean);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      permissionRequestRef.current += 1;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  function replaceAudioUrl(nextUrl: string) {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
  }

  async function startRecording() {
    if (permissionPending || recording) return;
    const requestId = ++permissionRequestRef.current;
    setPermissionPending(true);
    setRecordingError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Recording is unavailable in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposedRef.current || permissionRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => chunksRef.current.push(event.data));
      recorder.addEventListener("stop", () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const nextUrl = URL.createObjectURL(blob);
        if (disposedRef.current) URL.revokeObjectURL(nextUrl);
        else replaceAudioUrl(nextUrl);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      });
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      if (!disposedRef.current && permissionRequestRef.current === requestId) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        setRecordingError("Microphone access did not start. You can keep using the written teach-back, or try Record again.");
      }
    } finally {
      if (!disposedRef.current && permissionRequestRef.current === requestId) setPermissionPending(false);
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    setRecording(false);
  }

  function deleteRecording() {
    replaceAudioUrl("");
  }

  return (
    <section className="lesson-scene" aria-labelledby="teach-title">
      <div className="scene-heading">
        <span className="eyebrow">Explain it back</span>
        <h1 id="teach-title">Teach the route in your own words</h1>
        <p>Imagine you are explaining the file to a friend who has never used a computer.</p>
      </div>

      <label className="field-group" htmlFor="teach-words">
        <span><b>Your explanation</b></span>
        <textarea id="teach-words" rows={7} value={words} onChange={(event) => setWords(event.target.value)} placeholder="A file is... A folder is... The path tells me... The .json extension..." />
        <small>{words.trim().length} characters. Aim for at least 60.</small>
      </label>

      <section className="rubric-panel" aria-labelledby="rubric-title">
        <h2 id="rubric-title">Your explanation should include</h2>
        <ul>
          {rubric.map((item, index) => <li key={item.id} className={matched[index] ? "rubric-hit" : ""}>{matched[index] ? "Included:" : "Add:"} {item.label}</li>)}
        </ul>
      </section>

      <section className="voice-panel" aria-labelledby="voice-title">
        <div><span className="eyebrow">Optional voice practice</span><h2 id="voice-title">Say it aloud, then listen once</h2><p>The recording stays in this browser tab and is not uploaded.</p></div>
        <div className="voice-actions">
          {!recording ? <Button icon={<Mic size={18} />} disabled={permissionPending} onClick={() => void startRecording()}>{permissionPending ? "Waiting for microphone…" : "Record"}</Button> : <Button kind="danger" icon={<Square size={18} />} onClick={stopRecording}>Stop</Button>}
          {audioUrl ? <audio controls src={audioUrl} aria-label="Your teach-back recording" /> : null}
          {audioUrl ? <button type="button" className="icon-button" onClick={deleteRecording} aria-label="Delete recording"><Trash2 size={19} /></button> : null}
        </div>
        {recordingError ? <p className="voice-error" role="status">{recordingError}</p> : null}
      </section>

      <div className="scene-actionbar">
        <p>{ready ? "All four ideas are present." : "Use the checklist to add the missing idea."}</p>
        <Button kind="primary" icon={<Play size={18} />} disabled={!ready || saving} onClick={() => void completeStage("teach", { words, rubric: matched, audioPracticed: Boolean(audioUrl) })}>{saving ? "Saving…" : "Save my teach-back"}</Button>
      </div>
    </section>
  );
}
