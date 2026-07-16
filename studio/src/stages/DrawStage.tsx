import { Eraser, PencilLine } from "../icons";
import { PointerEvent, useEffect, useRef, useState } from "react";
import { useStudio } from "../StudioContext";
import { Button } from "../components/atoms/Button";

interface Point { x: number; y: number }

function paint(canvas: HTMLCanvasElement, strokes: Point[][]) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = window.devicePixelRatio || 1;
  const bounds = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(bounds.width * ratio));
  canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#176c78";
  context.lineWidth = 4;
  for (const stroke of strokes) {
    if (stroke.length < 2) continue;
    context.beginPath();
    context.moveTo(stroke[0].x, stroke[0].y);
    for (let index = 1; index < stroke.length; index += 1) context.lineTo(stroke[index].x, stroke[index].y);
    context.stroke();
  }
}

export function DrawStage() {
  const { saving, completeStage } = useStudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<Point[]>([]);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [description, setDescription] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const repaint = () => paint(canvas, strokes);
    repaint();
    const observer = new ResizeObserver(repaint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [strokes]);

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    activeRef.current = [pointFromEvent(event)];
  }

  function continueDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const points = activeRef.current;
    const previous = points[points.length - 1];
    const next = pointFromEvent(event);
    points.push(next);
    if (!previous) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(next.x, next.y);
    context.stroke();
  }

  function finishDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const completed = activeRef.current;
    activeRef.current = [];
    if (completed.length) setStrokes((items) => [...items, completed]);
  }

  function clearDrawing() {
    activeRef.current = [];
    setStrokes([]);
    const canvas = canvasRef.current;
    if (canvas) paint(canvas, []);
  }

  const hasEvidence = strokes.length > 0 || description.trim().length >= 20;
  return (
    <section className="lesson-scene" aria-labelledby="draw-title">
      <div className="scene-heading">
        <span className="eyebrow">Make the route visible</span>
        <h1 id="draw-title">Draw folders leading to a file</h1>
        <p>Use boxes and arrows. Label the final item <b>tiny-order.json</b>.</p>
      </div>

      <div className="sketch-toolbar">
        <span><PencilLine size={19} aria-hidden="true" /> Draw with your pointer</span>
        <Button kind="quiet" icon={<Eraser size={18} />} onClick={clearDrawing}>Clear</Button>
      </div>
      <canvas
        ref={canvasRef}
        className="sketch-pad"
        onPointerDown={startDrawing}
        onPointerMove={continueDrawing}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
        aria-label="Drawing area for a file path"
      />

      <label className="field-group" htmlFor="draw-description">
        <span><b>Keyboard alternative:</b> describe your boxes and arrows.</span>
        <textarea id="draw-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Home folder goes to Documents, then study, then tiny-order.json." />
      </label>

      <div className="scene-actionbar">
        <p>{hasEvidence ? "Your route has enough evidence to save." : "Add one stroke or a short written description."}</p>
        <Button kind="primary" disabled={!hasEvidence || saving} onClick={() => void completeStage("draw", { strokeCount: strokes.length, description })}>{saving ? "Saving…" : "Save my path"}</Button>
      </div>
    </section>
  );
}
