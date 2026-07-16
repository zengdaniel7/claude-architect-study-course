import { Check, LockKeyhole, Play } from "../icons";
import { Link } from "react-router-dom";
import { useStudio } from "../StudioContext";
import { manifest } from "../content";

export function CoursePage() {
  const { session } = useStudio();
  const currentIndex = manifest.units.findIndex((unit) => unit.id === session?.unitId);
  return (
    <section className="secondary-view" aria-labelledby="course-title">
      <div className="secondary-heading"><span className="eyebrow">23 required units</span><h1 id="course-title">Course map</h1><p>The map supports the current lesson. It does not create a second definition of “next.”</p></div>
      <div className="course-list">
        {manifest.units.map((unit, index) => {
          const currentMastered = index === currentIndex && session?.mastery === "mastered";
          const state = index < currentIndex || currentMastered ? "complete" : index === currentIndex ? "current" : "upcoming";
          const Icon = state === "complete" ? Check : state === "current" ? Play : LockKeyhole;
          return (
            <div key={unit.id} className={`course-row course-row--${state}`}>
              <span className="course-row__index">{index + 1}</span>
              <div><small>{unit.level}</small><h2>{unit.title}</h2><p>{unit.one}</p></div>
              <span className="course-row__state"><Icon size={18} aria-hidden="true" /> {state === "complete" ? "Completed" : state === "current" ? "Current" : "Later"}</span>
              {state === "current" ? <Link to="/session" className="text-link">Continue</Link> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
