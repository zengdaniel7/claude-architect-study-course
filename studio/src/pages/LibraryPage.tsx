import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ExternalLink, FileText, Headphones, Play, Search, Video } from "../icons";
import { manifest, unitById } from "../content";
import { useStudio } from "../StudioContext";
import type { CourseUnit, CourseVideo } from "../types";

type LibraryView = "lessons" | "videos";
type VideoFilter = "all" | "lesson" | "extra";

const OFFICIAL_HOSTS = /(?:anthropic\.skilljar\.com|anthropic\.com|claude\.com|platform\.claude\.com|code\.claude\.com)/i;
const VIDEO_THUMBNAILS = import.meta.glob("../assets/video-thumbnails/*.jpg", { eager: true, import: "default", query: "?url" }) as Record<string, string>;

function isExternal(url: string) {
  return /^https?:/i.test(url);
}

function sourceLabel(url: string, index: number) {
  if (!isExternal(url)) return index === 0 ? "Course visual" : "Course resource";
  return OFFICIAL_HOSTS.test(url) ? "Official source" : "External lesson";
}

function sourceHref(url: string) {
  return isExternal(url) ? url : `/legacy/${url.replace(/^\//, "")}`;
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function ResourceRow({ unit, source, index, current, compact = false }: {
  unit: CourseUnit;
  source: [string, string, string];
  index: number;
  current: boolean;
  compact?: boolean;
}) {
  const [url, title, focus] = source;
  const openInLesson = current && index === 0 && !isExternal(url);
  const label = sourceLabel(url, index);
  const Heading = compact ? "h4" : "h3";
  return (
    <article className={`resource-row${compact ? " resource-row--compact" : ""}`}>
      <span className="resource-row__icon">{index === 0 ? <Video size={22} aria-hidden="true" /> : <FileText size={22} aria-hidden="true" />}</span>
      <div>
        <span className="eyebrow">{label}</span>
        <Heading>{title}</Heading>
        <p>{focus}</p>
        <p className="microcopy"><Headphones size={15} aria-hidden="true" /> {isExternal(url) ? "Video captions or a written page." : "Visual or written course explanation."}</p>
      </div>
      {openInLesson ? (
        <Link className="button button--secondary" to="/session">Open lesson</Link>
      ) : (
        <a className="button button--secondary" href={sourceHref(url)} target="_blank" rel="noreferrer" aria-label={`Open ${title} in a new tab`}>
          Open source <ExternalLink size={17} aria-hidden="true" />
        </a>
      )}
    </article>
  );
}

function VideoRow({ video }: { video: CourseVideo }) {
  const lessons = video.lessonIds.map((id) => unitById(id).title).join(" · ");
  const clipLength = video.clip ? video.clip.endSec - video.clip.startSec : 0;
  const thumbnail = VIDEO_THUMBNAILS[`../assets/video-thumbnails/${video.thumbnailId}.jpg`];
  return (
    <article className="video-row">
      <img className="video-row__thumbnail" src={thumbnail} alt="" loading="lazy" width="240" height="135" />
      <div className="video-row__body">
        <span className="eyebrow">Episode {video.number} · {video.kind === "lesson" ? `Lesson clip ${formatTime(clipLength)}` : "Extra review"}</span>
        <h3>{video.title}</h3>
        <p>{video.focus}</p>
        {lessons && <p className="microcopy">Course connection: {lessons}</p>}
        {video.note && video.note !== video.focus && <p className="source-note"><strong>Source note:</strong> {video.note}</p>}
      </div>
      <div className="video-row__actions">
        <a className="button button--primary" href={video.url} target="_blank" rel="noreferrer" aria-label={`${video.clip ? "Watch clip from" : "Watch"} ${video.title} in a new tab`}>
          <Play size={17} aria-hidden="true" /> {video.clip ? "Watch clip" : "Watch video"}
        </a>
        {video.clip && <a className="text-link" href={video.fullUrl} target="_blank" rel="noreferrer">Full episode <ExternalLink size={15} aria-hidden="true" /></a>}
      </div>
    </article>
  );
}

export function LibraryPage() {
  const { session } = useStudio();
  const currentUnit = unitById(session?.unitId ?? "w1");
  const [view, setView] = useState<LibraryView>("lessons");
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState("all");
  const [videoFilter, setVideoFilter] = useState<VideoFilter>("all");
  const [expandedUnitIds, setExpandedUnitIds] = useState<string[]>([currentUnit.id]);

  const phases = useMemo(() => Array.from(new Set(manifest.units.map((unit) => unit.level))), []);
  const normalizedQuery = query.trim().toLowerCase();
  const lessonSourceCount = manifest.units.reduce((total, unit) => total + unit.watch.length, 0);

  const visibleUnits = useMemo(() => manifest.units.filter((unit) => {
    if (phase !== "all" && unit.level !== phase) return false;
    if (!normalizedQuery) return true;
    return [unit.title, unit.level, unit.one, ...unit.concepts, ...unit.watch.flat()]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  }), [normalizedQuery, phase]);

  const visibleVideos = useMemo(() => manifest.media.videos.filter((video) => {
    if (videoFilter !== "all" && video.kind !== videoFilter) return false;
    if (!normalizedQuery) return true;
    const lessonNames = video.lessonIds.map((id) => unitById(id).title);
    return [video.title, video.focus, video.note, video.channel, ...lessonNames]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  }), [normalizedQuery, videoFilter]);

  const resultCount = view === "lessons" ? visibleUnits.length : visibleVideos.length;

  return (
    <section className="secondary-view library-page" aria-labelledby="library-title">
      <div className="secondary-heading library-heading">
        <span className="eyebrow">Visual study resources</span>
        <h1 id="library-title">Study library</h1>
        <p>Start with your lesson. Search the full course when you need another explanation or a quick review.</p>
      </div>

      <dl className="library-statline" aria-label="Library contents">
        <div><dt>Lesson folders</dt><dd>{manifest.units.length}</dd></div>
        <div><dt>Learning sources</dt><dd>{lessonSourceCount}</dd></div>
        <div><dt>Reviewed videos</dt><dd>{manifest.media.videos.length}</dd></div>
      </dl>

      <section className="library-current" aria-labelledby="current-library-title">
        <div className="library-section-heading">
          <div>
            <span className="eyebrow">Start here · current lesson</span>
            <h2 id="current-library-title">{currentUnit.title}</h2>
            <p>Use these before opening the full collection.</p>
          </div>
          <Link className="button button--primary" to="/session">Continue lesson</Link>
        </div>
        <div className="resource-list">
          {currentUnit.watch.map((source, index) => (
            <ResourceRow key={`${currentUnit.id}:${source[0]}`} unit={currentUnit} source={source} index={index} current />
          ))}
        </div>
      </section>

      <section className="library-directory" aria-labelledby="all-library-title">
        <div className="library-section-heading">
          <div>
            <span className="eyebrow">Browse everything</span>
            <h2 id="all-library-title">All course resources</h2>
            <p>Choose a lesson folder or the reviewed video collection.</p>
          </div>
          <a className="text-link" href={manifest.media.playlistUrl} target="_blank" rel="noreferrer">Open full playlist <ExternalLink size={15} aria-hidden="true" /></a>
        </div>

        <div className="library-toolbar">
          <label className="library-search">
            <span>Search library</span>
            <span className="library-search__field"><Search size={19} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try MCP, prompting, or reliability" /></span>
          </label>
          <div className="library-tabs" role="tablist" aria-label="Library view">
            <button type="button" role="tab" aria-selected={view === "lessons"} aria-controls="library-lessons" onClick={() => setView("lessons")}>Lessons <span>{manifest.units.length}</span></button>
            <button type="button" role="tab" aria-selected={view === "videos"} aria-controls="library-videos" onClick={() => setView("videos")}>Videos <span>{manifest.media.videos.length}</span></button>
          </div>
          {view === "lessons" ? (
            <label className="library-select"><span>Phase</span><select value={phase} onChange={(event) => setPhase(event.target.value)}><option value="all">All phases</option>{phases.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          ) : (
            <label className="library-select"><span>Video type</span><select value={videoFilter} onChange={(event) => setVideoFilter(event.target.value as VideoFilter)}><option value="all">All reviewed videos</option><option value="lesson">Lesson clips</option><option value="extra">Extra review</option></select></label>
          )}
        </div>

        <p className="library-results" aria-live="polite">Showing {resultCount} {view === "lessons" ? "lesson folders" : "videos"}.</p>

        {view === "lessons" ? (
          <div id="library-lessons" role="tabpanel" className="library-unit-list">
            {visibleUnits.map((unit, index) => (
              <details
                className="library-unit"
                key={unit.id}
                open={Boolean(normalizedQuery) || expandedUnitIds.includes(unit.id)}
                onToggle={(event) => {
                  if (normalizedQuery) return;
                  const isOpen = event.currentTarget.open;
                  setExpandedUnitIds((current) => isOpen
                    ? Array.from(new Set([...current, unit.id]))
                    : current.filter((id) => id !== unit.id));
                }}
              >
                <summary>
                  <span className="library-unit__index">{String(manifest.units.indexOf(unit) + 1).padStart(2, "0")}</span>
                  <span><small>{unit.level}</small><strong>{unit.title}</strong></span>
                  <span className="library-unit__count">{unit.watch.length} {unit.watch.length === 1 ? "source" : "sources"}</span>
                  <ChevronDown size={20} aria-hidden="true" />
                </summary>
                <div className="resource-list">
                  {unit.watch.map((source, sourceIndex) => <ResourceRow key={`${unit.id}:${source[0]}`} unit={unit} source={source} index={sourceIndex} current={unit.id === currentUnit.id} compact />)}
                </div>
              </details>
            ))}
            {!visibleUnits.length && <div className="empty-state"><h3>No lesson folders found</h3><p>Try a broader word, or choose All phases.</p></div>}
          </div>
        ) : (
          <div id="library-videos" role="tabpanel">
            <div className="library-community-note"><Video size={20} aria-hidden="true" /><p><strong>Community video collection.</strong> {manifest.media.communityNotice} Clips were reviewed on {manifest.media.reviewedAt}.</p></div>
            <div className="video-list">{visibleVideos.map((video) => <VideoRow video={video} key={video.id} />)}</div>
            {!visibleVideos.length && <div className="empty-state"><h3>No videos found</h3><p>Try a broader word, or choose All reviewed videos.</p></div>}
          </div>
        )}
      </section>
    </section>
  );
}
