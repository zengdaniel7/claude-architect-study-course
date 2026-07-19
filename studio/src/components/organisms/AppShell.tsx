import {
  BookOpen,
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Home,
  Inbox,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Settings
} from "../../icons";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useStudio } from "../../StudioContext";
import { PREVIEW_NOTICE, PUBLIC_PREVIEW } from "../../preview";
import { Button } from "../atoms/Button";

const links = [
  { to: "/", label: "Home", icon: Home },
  { to: "/course", label: "Course", icon: GraduationCap },
  { to: "/review", label: "Review", icon: RotateCcw },
  { to: "/library", label: "Library", icon: Library },
  { to: "/settings", label: "Settings", icon: Settings }
];

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const { session, demo, startupError } = useStudio();
  const location = useLocation();
  const localMode = !demo && !PUBLIC_PREVIEW;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.getElementById("studio-main")?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <div className={`app-shell ${collapsed ? "app-shell--collapsed" : ""}`}>
      <aside className="sidebar" aria-label="Study Studio navigation">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true"><BookOpen size={22} /></span>
          <span className="brand__text"><strong>CCA-F</strong><small>Study Studio</small></span>
        </div>
          <nav className="sidebar__nav">
          {(localMode ? [...links.slice(0, 4), { to: "/frontier", label: "Frontier Inbox", icon: Inbox }, links[4]] : links).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "nav-item nav-item--active" : "nav-item"} title={collapsed ? label : undefined}>
              <Icon size={21} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          {demo ? <span className="mode-label">Preview mode</span> : <span className="mode-label mode-label--local">Local mode</span>}
          <button className="icon-button sidebar__collapse" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Show sidebar labels" : "Collapse sidebar"} title={collapsed ? "Show sidebar labels" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </div>
      </aside>
      <div className="app-frame">
        <header className="window-bar">
          <div className="window-bar__trail">
            <button type="button" className="icon-button" aria-label="Back" onClick={() => history.back()}><ChevronLeft size={21} /></button>
            <button type="button" className="icon-button" aria-label="Forward" onClick={() => history.forward()}><ChevronRight size={21} /></button>
          </div>
          <div className="window-bar__lesson">
            <span>{session?.title ?? "Loading your lesson"}</span>
            <small>{session ? session.mastery === "mastered" ? session.dueReviews > 0 ? "Review due" : "Complete" : `${session.stages[session.stageIndex]?.label ?? "Course"} stage` : ""}</small>
          </div>
          {demo ? <span className="legacy-link">AI-disabled preview</span> : <a className="legacy-link" href="legacy/today.html">Legacy tutor</a>}
        </header>
        {PUBLIC_PREVIEW ? <div className="preview-notice" role="status">{PREVIEW_NOTICE}</div> : null}
        <main id="studio-main" className="studio-main" tabIndex={-1}>
          {startupError ? (
            <section className="empty-state" role="alert" aria-labelledby="startup-error-title">
              <CircleAlert size={28} aria-hidden="true" />
              <h1 id="startup-error-title">Progress did not load</h1>
              <p>{startupError}</p>
              <Button kind="primary" icon={<RotateCcw size={18} />} onClick={() => window.location.reload()}>Try again</Button>
            </section>
          ) : <Outlet />}
        </main>
      </div>
    </div>
  );
}
