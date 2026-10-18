// The place page: what applies at the chosen time, today's timeline, every rule with its source, and quick reports.

import { useEffect, useRef, useState } from "react";
import { daySegments, describe } from "../domain/rules";
import { KIND_LABEL, STATUS_LABEL } from "../domain/types";
import { formatDistance } from "../domain/geo";
import { localParts } from "../domain/time";
import { directionsUrl, placeSources, ruleWhen } from "../app/logic";
import type { ReportKind, ReportSummary } from "../data/repository";
import { Icon, KindIcon } from "./Icons";
import { featureBadges } from "./PlaceCard";
import type { ResultRow } from "./types";

const REPORTS: { kind: ReportKind; label: string; icon: keyof typeof Icon; thanks: string }[] = [
  { kind: "confirm", label: "Still right", icon: "check", thanks: "Thanks! Marked as checked today." },
  { kind: "flag", label: "Rules wrong", icon: "flag", thanks: "Thanks, we'll recheck the council page." },
  { kind: "quiet", label: "Quiet now", icon: "quiet", thanks: "Thanks, noted as quiet." },
  { kind: "busy", label: "Busy now", icon: "busy", thanks: "Thanks, noted as busy." },
  { kind: "hazard", label: "Hazard", icon: "alert", thanks: "Thanks, others will see the warning." },
  { kind: "gate_open", label: "Gate open", icon: "gate", thanks: "Thanks, others will see the warning." },
];

const REPORT_TEXT: Record<ReportKind, string> = {
  confirm: "Confirmed the rules", flag: "Flagged the rules as wrong", quiet: "Said it was quiet", busy: "Said it was busy",
  hazard: "Reported a hazard", gate_open: "Said a gate was open", closed: "Said it was closed",
};

function ago(iso: string, now = Date.now()): string {
  const mins = Math.round((now - Date.parse(iso)) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** "Usually quiet around now" from reports at the same weekday within an hour either side. */
function crowdHint(s: ReportSummary | null, at: Date): string | null {
  if (!s?.crowd.length) return null;
  const lp = localParts(at), hour = Math.floor(lp.minutes / 60);
  let quiet = 0, busy = 0;
  for (const c of s.crowd) if (c.dow === lp.weekday && Math.abs(c.hour - hour) <= 1) { quiet += c.quiet; busy += c.busy; }
  if (quiet + busy < 2) return null;
  return quiet >= busy ? `Usually quiet around this time (${quiet} of ${quiet + busy} reports)` : `Often busy around this time (${busy} of ${quiet + busy} reports)`;
}

interface Props {
  row: ResultRow;
  at: Date;
  when: string;
  saved: boolean;
  canReport: boolean;
  onSave: () => void;
  onClose: () => void;
  onNeedSignIn: () => void;
  loadSummary: () => Promise<ReportSummary>;
  report: (kind: ReportKind, note?: string) => Promise<void>;
  toast: (msg: string) => void;
}

export default function PlaceSheet({ row, at, when, saved, canReport, onSave, onClose, onNeedSignIn, loadSummary, report, toast }: Props) {
  const { place, ev, distanceKm } = row;
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    setSummary(null);
    loadSummary().then((s) => live && setSummary(s)).catch(() => live && setSummary(null));
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => { live = false; removeEventListener("keydown", onKey); };
  }, [place.id, loadSummary, onClose]);

  const segs = daySegments(place, at);
  const dayStart = segs[0]!.from.getTime(), dayLen = segs.at(-1)!.to.getTime() - dayStart;
  const nowPct = ((at.getTime() - dayStart) / dayLen) * 100;
  const hint = crowdHint(summary, at);

  async function send(kind: ReportKind, thanks: string) {
    if (!canReport) return onNeedSignIn();
    let note: string | undefined;
    if (kind === "flag" || kind === "hazard") {
      const n = prompt(kind === "flag" ? "What's changed? (optional)" : "What should others watch out for? (optional)");
      if (n === null) return;
      note = n.trim().slice(0, 500) || undefined;
    }
    setBusy(true);
    try {
      await report(kind, note);
      toast(thanks);
      setSummary(await loadSummary());
    } catch {
      toast("Couldn't send that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="grab" />
        <div className="sheethead">
          <span className="kindicon"><KindIcon kind={place.kind} /></span>
          <div className="grow">
            <h2 id="sheet-title">{place.name}</h2>
            <p className="meta">{KIND_LABEL[place.kind]} · {place.area} · {formatDistance(distanceKm)} away</p>
          </div>
          <button ref={closeBtn} type="button" className="iconbtn" onClick={onClose} aria-label="Close">{Icon.close()}</button>
        </div>

        <div className={`bigstatus ${ev.status}`}>
          <strong>{describe(ev, at, when)}</strong>
          {ev.rule?.note && <span>{ev.rule.note}</span>}
          <div className="timeline" aria-label="Today's timeline">
            {segs.map((s, i) => (
              <div key={i} className={s.status} style={{ width: `${((s.to.getTime() - s.from.getTime()) / dayLen) * 100}%` }} title={STATUS_LABEL[s.status]} />
            ))}
          </div>
          <div className="nowline" aria-hidden="true"><i style={{ left: `calc(${Math.min(99.5, Math.max(0, nowPct))}% - 1px)` }} /></div>
          <div className="ticks"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span></div>
        </div>

        {hint && <p className="hint">{hint}</p>}

        <div className="acts">
          <a className="btn primary" href={directionsUrl(place)} target="_blank" rel="noopener">{Icon.directions()} Directions</a>
          <button type="button" className={`btn${saved ? " on" : ""}`} onClick={onSave} aria-pressed={saved}>{Icon.heart()} {saved ? "Saved" : "Save"}</button>
        </div>

        {featureBadges(place).length > 0 && <div className="badges">{featureBadges(place).map((b) => <span key={b} className="badge">{b}</span>)}</div>}
        {place.approximateLocation && <p className="warnbox">The pin is approximate. Check the entrance on the council map before you head off.</p>}

        <div className="section">
          <h3>The rules</h3>
          <ul className="rules">
            {place.rules.map((r) => (
              <li key={r.id}>
                <span className={`status ${r.status}`}>{STATUS_LABEL[r.status]}</span>{" "}
                <span className="when">{ruleWhen(r)}</span>
                {r.note && <div>{r.note}</div>}
              </li>
            ))}
            <li>
              <span className={`status ${place.defaultStatus}`}>{STATUS_LABEL[place.defaultStatus]}</span>{" "}
              <span className="when">{place.rules.length ? "Other times" : "Any time"}</span>
            </li>
          </ul>
          <h3>Where this comes from</h3>
          <ul className="rules">
            {placeSources(place).map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener">{s.name}</a>
                <span className={`kindtag ${s.kind}`}>{s.kind === "guide" ? "Local guide" : s.kind === "community" ? "Community" : "Official"}</span>
                <span className="src">Checked {new Date(s.checked + "T00:00:00Z").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</span>
              </li>
            ))}
          </ul>
          {summary?.lastConfirmed && <p className="hint">Last confirmed by someone on the ground {ago(summary.lastConfirmed)}.</p>}
          {!!summary?.flags90d && <p className="warnbox">{summary.flags90d} {summary.flags90d === 1 ? "person has" : "people have"} flagged these rules as wrong lately. Check the council page.</p>}
        </div>

        {(place.notes?.length || place.hazards?.length) ? (
          <div className="section">
            <h3>Good to know</h3>
            <ul className="notes">
              {place.notes?.map((n) => <li key={n}>{n}</li>)}
              {place.hazards?.map((h) => <li key={h}><strong>Watch out:</strong> {h}</li>)}
            </ul>
          </div>
        ) : null}

        <div className="section">
          <h3>Been here? Tell the pack</h3>
          {!canReport && <p className="hint">Sign in to share reports with friends.</p>}
          <div className="reportgrid">
            {REPORTS.map((r) => (
              <button key={r.kind} type="button" className="btn" disabled={busy} onClick={() => send(r.kind, r.thanks)}>{Icon[r.icon]()} {r.label}</button>
            ))}
          </div>
          {summary && summary.recent.length > 0 && (
            <ul className="recent">
              {summary.recent.slice(0, 6).map((r, i) => <li key={i}>{REPORT_TEXT[r.kind]}{r.note ? `: “${r.note}”` : ""} · {ago(r.createdAt)}</li>)}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
