import { ArrowRight, CheckCircle2, ExternalLink } from "../icons";
import { useStudio } from "../StudioContext";
import { PUBLIC_PREVIEW } from "../preview";

export function ArchivePage() {
  const { session } = useStudio();
  const completed = session?.mastery === "mastered";

  return (
    <section className="secondary-view archive-view" aria-labelledby="archive-title">
      <div className="secondary-heading">
        <span className="eyebrow">Completed lesson</span>
        <h1 id="archive-title">W1 archive</h1>
        <p>{completed ? PUBLIC_PREVIEW ? "Your preview run is complete. It will reset when you leave." : "Your W1 completion is saved here. Return when a spaced-review card is due." : "W1 evidence appears here after the lesson is complete."}</p>
      </div>
      <div className="archive-summary">
        <CheckCircle2 size={30} aria-hidden="true" />
        <div><strong>{completed ? "Files, folders, and plain text" : "W1 is still in progress"}</strong><p>{completed ? "Learn, Draw, Build, Teach, Quiz, and Review are complete." : "Finish the active lesson stage to add it to the archive."}</p></div>
      </div>
      {completed && !PUBLIC_PREVIEW ? <div className="archive-next">
        <a className="button button--primary" href="/legacy/notes.html?unit=w2"><span>Continue to Week 2 archive</span><ArrowRight size={18} aria-hidden="true" /></a>
        <p className="microcopy"><ExternalLink size={16} aria-hidden="true" /> Opens legacy archive.</p>
      </div> : completed ? <p className="microcopy">Week 2 is available in the private local Study Studio.</p> : null}
    </section>
  );
}
