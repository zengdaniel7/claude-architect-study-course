import { Check, Inbox, LoaderCircle, X } from "../icons";
import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { decideProposal, fetchFrontierInbox, fetchFrontierInboxDetail } from "../api";
import { useStudio } from "../StudioContext";
import type { FrontierInboxDetail, FrontierInboxItem } from "../types";
import { Button } from "../components/atoms/Button";
import { PUBLIC_PREVIEW } from "../preview";

type Status = { tone: "success" | "error"; message: string } | null;

export function FrontierInboxPage() {
  const { demo } = useStudio();
  const [items, setItems] = useState<FrontierInboxItem[]>([]);
  const [detail, setDetail] = useState<FrontierInboxDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const statusRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (demo || PUBLIC_PREVIEW) return;
    fetchFrontierInbox().then(setItems).catch(() => setStatus({ tone: "error", message: "Inbox did not load." })).finally(() => setLoading(false));
  }, [demo]);

  useEffect(() => {
    if (status) statusRef.current?.focus({ preventScroll: true });
  }, [status]);

  if (demo || PUBLIC_PREVIEW) return <Navigate to="/" replace />;

  async function open(item: FrontierInboxItem) {
    setDetail(null);
    setStatus(null);
    try {
      setDetail(await fetchFrontierInboxDetail(item.id));
    } catch {
      setStatus({ tone: "error", message: "Item detail did not load." });
    }
  }

  async function decide(decision: "accepted" | "rejected") {
    if (!detail) return;
    setSaving(true);
    setStatus(null);
    try {
      const result = await decideProposal(detail.id, decision);
      setItems((current) => current.map((item) => item.id === detail.id ? { ...item, status: result.proposal.status } : item));
      setDetail((current) => current ? { ...current, status: result.proposal.status } : current);
      setStatus({ tone: "success", message: decision === "accepted" ? "Proposal accepted. It remains advisory." : "Proposal rejected." });
    } catch {
      setStatus({ tone: "error", message: "Decision did not save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="secondary-view inbox-view" aria-labelledby="inbox-title">
      <div className="secondary-heading"><span className="eyebrow">Advisory only</span><h1 id="inbox-title">Frontier Inbox</h1><p>Review suggestions. They never change progress on their own.</p></div>
      {loading ? <div className="loading-view" role="status"><LoaderCircle className="spin" size={22} aria-hidden="true" /> Loading inbox…</div> : null}
      {!loading ? <div className="inbox-list">
        {items.length ? items.map((item) => <div className="inbox-row" key={item.id}><Inbox size={21} aria-hidden="true" /><div><b>{item.kind.replaceAll("_", " ")}</b><p>{item.summary}</p><small>{item.status}</small></div><Button kind="quiet" onClick={() => void open(item)}>Open</Button></div>) : <div className="empty-state" role="status"><h2>No inbox items</h2><p>New advisory proposals appear here.</p></div>}
      </div> : null}
      {detail ? <section className="inbox-detail" aria-labelledby="detail-title"><span className="eyebrow">Advisory proposal</span><h2 id="detail-title">{detail.kind.replaceAll("_", " ")}</h2><p>{detail.summary}</p><pre>{JSON.stringify(detail.payload, null, 2)}</pre>{detail.status === "pending" ? <div className="inbox-detail__actions"><Button kind="primary" icon={<Check size={18} />} disabled={saving} onClick={() => void decide("accepted")}>Accept</Button><Button kind="danger" icon={<X size={18} />} disabled={saving} onClick={() => void decide("rejected")}>Reject</Button></div> : <p className="microcopy">Decision: {detail.status}.</p>}</section> : null}
      {status ? <section ref={statusRef} className={`recovery-status recovery-status--${status.tone}`} role={status.tone === "error" ? "alert" : "status"} tabIndex={-1}>{status.message}</section> : null}
    </section>
  );
}
