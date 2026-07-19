import { ExternalLink, FileText, Headphones, Video } from "../icons";
import { Link } from "react-router-dom";
import { unitById } from "../content";
import { useStudio } from "../StudioContext";

export function LibraryPage() {
  const { session } = useStudio();
  const unit = unitById(session?.unitId ?? "w1");
  return (
    <section className="secondary-view" aria-labelledby="library-title">
      <div className="secondary-heading"><span className="eyebrow">Current-unit sources</span><h1 id="library-title">Watch and listen</h1><p>Start with the short visual. Open the full source only when you need more detail.</p></div>
      <div className="resource-list">
        {unit.watch.map(([url, title, focus], index) => (
          <article className="resource-row" key={url}>
            <span className="resource-row__icon">{index === 0 ? <Video size={24} aria-hidden="true" /> : <FileText size={24} aria-hidden="true" />}</span>
            <div><span className="eyebrow">{index === 0 ? "Course visual" : "External visual lesson"}</span><h2>{title}</h2><p>{focus}</p><p className="microcopy"><Headphones size={16} aria-hidden="true" /> Transcript or written alternative available.</p></div>
            {index === 0 ? <Link className="button button--secondary" to="/session">Open <ExternalLink size={17} aria-hidden="true" /></Link> : <a className="button button--secondary" href={url} target="_blank" rel="noreferrer">Open in new tab <ExternalLink size={17} aria-hidden="true" /></a>}
          </article>
        ))}
      </div>
    </section>
  );
}
