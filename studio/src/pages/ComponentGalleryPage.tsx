import { AlertCircle, CheckCircle2, Info } from "../icons";
import { Button } from "../components/atoms/Button";

export function ComponentGalleryPage() {
  return (
    <section className="secondary-view component-gallery" aria-labelledby="gallery-title">
      <div className="secondary-heading"><span className="eyebrow">Development only</span><h1 id="gallery-title">Component states</h1><p>Atomic components shown with real, empty, loading, error, and long-text states.</p></div>
      <section><h2>Actions</h2><div className="gallery-row"><Button kind="primary">Primary action</Button><Button>Secondary action</Button><Button kind="quiet">Quiet action</Button><Button disabled>Unavailable</Button></div></section>
      <section><h2>Feedback</h2><div className="gallery-stack"><div className="feedback feedback--success"><CheckCircle2 size={22} /><div><strong>Saved</strong><p>Your independent evidence is stored.</p></div></div><div className="feedback feedback--repair"><AlertCircle size={22} /><div><strong>One repair</strong><p>The filename ends in .txt. Rename it to tiny-order.json.</p></div></div><div className="feedback feedback--info"><Info size={22} /><div><strong>Local tutor off</strong><p>The deterministic lesson remains fully available.</p></div></div></div></section>
      <section><h2>Long content</h2><p className="gallery-long">A deliberately long learner explanation must wrap without covering the next action. The file is one saved item, while the folder is the container that helps organize it, and the path describes every folder followed to reach the final item.</p></section>
    </section>
  );
}
