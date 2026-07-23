import { ArrowRight, FileJson, Folder, Headphones, Home, LinkIcon } from "../icons";
import { useEffect, useMemo } from "react";
import { useStudio } from "../StudioContext";
import { manifest, unitById } from "../content";
import { Button } from "../components/atoms/Button";

export function LearnStage() {
  const { session, saving, completeStage, demo } = useStudio();
  const unit = unitById(session?.unitId ?? "w1");
  const lesson = manifest.lessons[unit.id];
  const narration = useMemo(() => lesson ? `${lesson.plain} Example: ${lesson.example}. Remember: ${lesson.danger}` : "", [lesson]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  if (!lesson) {
    return (
      <section className="lesson-scene" aria-labelledby="learn-title">
        <div className="scene-heading">
          <span className="eyebrow">One idea</span>
          <h1 id="learn-title">This unit's guided lesson is not built yet</h1>
          <p>The guided Study Studio version of <b>{unit.title}</b> is still being migrated. Use the classic pages at <a href="/legacy/">/legacy/</a> for this unit — your Studio progress is safe.</p>
        </div>
      </section>
    );
  }

  function readAloud() {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(narration);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  return (
    <section className="lesson-scene" aria-labelledby="learn-title">
      <div className="scene-heading">
        <span className="eyebrow">One idea</span>
        <h1 id="learn-title">A path is a route to one saved item</h1>
        <p>{lesson.plain}</p>
      </div>

      <figure className="path-visual" aria-labelledby="path-caption">
        <div className="path-node"><Home size={28} aria-hidden="true" /><span>Home</span><small>/Users/student</small></div>
        <ArrowRight className="path-arrow" aria-hidden="true" />
        <div className="path-node"><Folder size={28} aria-hidden="true" /><span>Documents</span><small>folder</small></div>
        <ArrowRight className="path-arrow" aria-hidden="true" />
        <div className="path-node"><Folder size={28} aria-hidden="true" /><span>study</span><small>folder</small></div>
        <ArrowRight className="path-arrow" aria-hidden="true" />
        <div className="path-node path-node--file"><FileJson size={28} aria-hidden="true" /><span>tiny-order.json</span><small>file + extension</small></div>
        <figcaption id="path-caption">Follow the folders from left to right. The final item is the file.</figcaption>
      </figure>

      <div className="teaching-grid">
        <section>
          <h2>Tiny example</h2>
          <code className="path-code">{lesson.example}</code>
          <p>The final dot starts the <b>extension</b>: <code>.json</code>.</p>
        </section>
        <section className="warning-block">
          <h2>Watch for this</h2>
          <p>{lesson.danger}</p>
        </section>
      </div>

      <div className="support-row">
        <Button kind="quiet" icon={<Headphones size={19} />} onClick={readAloud}>Read this aloud</Button>
        <a className="text-link" href={unit.watch[1]?.[0]} target="_blank" rel="noreferrer"><LinkIcon size={17} aria-hidden="true" /> File-extension visual lesson <span className="new-tab-note">(opens in a new tab)</span></a>
      </div>

      <div className="scene-actionbar">
        <p><b>Check:</b> Can you point to the two folders, the file, and its extension?</p>
        <Button kind="primary" disabled={saving} onClick={() => void completeStage("learn", { understoodPath: true, source: "studio" })}>{saving ? demo ? "Moving…" : "Saving…" : "I can point to each part"}</Button>
      </div>
    </section>
  );
}
