// "Plan a day out": stops in order with drive times, arrival times and what the dogs can do when you get there.

import { useMemo } from "react";
import type { Place } from "../domain/types";
import { STATUS_LABEL } from "../domain/types";
import { formatClock } from "../domain/time";
import { EXAMPLE_PLAN, encodePlan, routeUrl, schedule, type Plan } from "../app/plan";
import { Icon, KindIcon, Pup } from "./Icons";

function duration(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

interface Props {
  plan: Plan;
  setPlan: (p: Plan) => void;
  byId: Map<string, Place>;
  here: { label: string; lat: number; lon: number };
  onOpen: (id: string) => void;
  toast: (m: string) => void;
}

export default function PlanView({ plan, setPlan, byId, here, onOpen, toast }: Props) {
  const s = useMemo(() => schedule(plan, byId), [plan, byId]);
  const set = (patch: Partial<Plan>) => setPlan({ ...plan, ...patch });
  const move = (i: number, d: -1 | 1) => {
    const stops = [...plan.stops], j = i + d;
    if (j < 0 || j >= stops.length) return;
    [stops[i], stops[j]] = [stops[j]!, stops[i]!];
    set({ stops });
  };
  const stay = (i: number, d: number) => set({ stops: plan.stops.map((x, k) => (k === i ? { ...x, stayMin: Math.min(600, Math.max(15, x.stayMin + d)) } : x)) });
  const remove = (i: number) => set({ stops: plan.stops.filter((_, k) => k !== i) });

  async function share() {
    const url = `${location.origin}/#plan=${encodePlan(plan)}`;
    try {
      if (navigator.share) await navigator.share({ title: plan.title, text: `${plan.title} on Sniffari`, url });
      else { await navigator.clipboard.writeText(url); toast("Link copied. Send it to the pack."); }
    } catch { /* share sheet closed */ }
  }

  if (!plan.stops.length) {
    return (
      <div className="empty">
        <Pup size={96} />
        <h2>Plan a day out</h2>
        <p>Open any place and tap <strong>Add to day out</strong>. Sniffari works out drive times, when you'll arrive, and whether the dogs can be off-leash when you get there.</p>
        <button type="button" className="btn primary" onClick={() => setPlan({ ...EXAMPLE_PLAN, start: plan.start || EXAMPLE_PLAN.start })}>Try the Mt Wilson garden day</button>
      </div>
    );
  }

  return (
    <div className="plan">
      <label className="sr" htmlFor="plan-title">Plan name</label>
      <input id="plan-title" className="plantitle" value={plan.title} onChange={(e) => set({ title: e.target.value })} />
      <div className="planmeta">
        <label className="pill">{Icon.clock()}<span className="sr">Leave at</span>
          <input type="datetime-local" value={plan.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
        </label>
        <button type="button" className="pill" onClick={() => set({ from: { label: here.label, lat: here.lat, lon: here.lon } })} title="Start from your current location">
          {Icon.locate()} From {plan.from.label}
        </button>
      </div>

      <ol className="stops">
        {s.stops.map((x, i) => (
          <li key={`${x.place.id}-${i}`}>
            <p className="leg">{Icon.directions()} {duration(x.driveMin)} drive · about {x.driveKm} km</p>
            <div className="stop">
              <div className="stoptime"><strong>{formatClock(x.arrive)}</strong><span>to {formatClock(x.leave)}</span></div>
              <div className="grow">
                <button type="button" className="stopname" onClick={() => onOpen(x.place.id)}>
                  <span className="kindicon sm"><KindIcon kind={x.place.kind} /></span> {x.place.name}
                </button>
                <span className={`status ${x.status}`}>{STATUS_LABEL[x.status]} when you arrive</span>
                {x.warnings.map((w) => <p key={w} className="warnbox">{w}</p>)}
                {x.place.notes?.[0] && <p className="hint">{x.place.notes[0]}</p>}
                <div className="stopctl">
                  <button type="button" className="mini" onClick={() => stay(i, -15)} aria-label="Stay 15 minutes less">−</button>
                  <span>{duration(x.stop.stayMin)}</span>
                  <button type="button" className="mini" onClick={() => stay(i, 15)} aria-label="Stay 15 minutes more">+</button>
                  <span className="grow" />
                  <button type="button" className="mini" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier">↑</button>
                  <button type="button" className="mini" onClick={() => move(i, 1)} disabled={i === plan.stops.length - 1} aria-label="Move later">↓</button>
                  <button type="button" className="mini" onClick={() => remove(i)} aria-label={`Remove ${x.place.name}`}>{Icon.close()}</button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {s.home && <p className="leg home">{Icon.directions()} {duration(s.home.driveMin)} back · home about <strong>{formatClock(s.home.arrive)}</strong></p>}
      {s.missing.length > 0 && <p className="hint">{s.missing.length} stop{s.missing.length > 1 ? "s are" : " is"} no longer in Sniffari and {s.missing.length > 1 ? "were" : "was"} skipped.</p>}
      <p className="hint">Drive times are rough estimates ({duration(s.totalDriveMin)} in the car all up). Check traffic before you go.</p>

      <div className="acts">
        <a className="btn primary" href={routeUrl(plan, byId)} target="_blank" rel="noopener">{Icon.directions()} Route in Google Maps</a>
        <button type="button" className="btn" onClick={share}>{Icon.paw()} Share plan</button>
        <button type="button" className="btn" onClick={() => confirm("Clear this day out?") && set({ stops: [], title: "Our day out" })}>Clear</button>
      </div>
    </div>
  );
}
