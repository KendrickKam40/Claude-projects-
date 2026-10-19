// Sniffari, "near me": where can the dogs go at the time you pick, nearest first, as a list or a map.

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { evaluate } from "./domain/rules";
import { DEFAULT_CENTRE } from "./domain/geo";
import { LocalRepository, SupabaseRepository, type NearbyPlace, type Repository } from "./data/repository";
import { supabase } from "./lib/supabase";
import { compareResults, googleSearchUrl, passes, resolveWhen, whenWord, NO_FILTERS, WHEN_LABEL, type Filters, type WhenKey } from "./app/logic";
import { Icon, Pup } from "./ui/Icons";
import PlaceCard from "./ui/PlaceCard";
import PlaceSheet from "./ui/PlaceSheet";
import SignIn from "./ui/SignIn";
import PlanView from "./ui/PlanView";
import { decodePlan, encodePlan, type Plan } from "./app/plan";
import { localParts } from "./domain/time";
import type { ResultRow } from "./ui/types";

const MapView = lazy(() => import("./ui/MapView"));

const repo: Repository = supabase ? new SupabaseRepository(supabase) : new LocalRepository();

const FILTERS: { key: keyof Filters; label: string }[] = [
  { key: "offLeash", label: "Off-leash then" },
  { key: "fenced", label: "Fully fenced" },
  { key: "reactive", label: "Reactive-friendly" },
  { key: "venues", label: "Cafés & pubs" },
  { key: "saved", label: "Saved" },
];

type Where = { lat: number; lon: number; label: string; located: boolean };
const HOME: Where = { ...DEFAULT_CENTRE, label: "Kellyville", located: false };

const LS_PLAN = "sniffari.plan.v1";

function defaultStart(): string {
  const p = localParts(resolveWhen("weekend", undefined));
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T08:00`;
}

/** A shared link (#plan=…) wins over the plan saved on this device. */
function initialPlan(): { plan: Plan; shared: boolean } {
  const m = /^#plan=([\w-]+)$/.exec(location.hash);
  const shared = m ? decodePlan(m[1]!) : null;
  if (shared) return { plan: shared, shared: true };
  try {
    const saved = decodePlan(localStorage.getItem(LS_PLAN) ?? "");
    if (saved) return { plan: saved, shared: false };
  } catch { /* storage blocked */ }
  return { plan: { title: "Our day out", start: defaultStart(), from: { label: HOME.label, lat: HOME.lat, lon: HOME.lon }, stops: [] }, shared: false };
}

function useWide() {
  const q = "(min-width: 900px)";
  const [wide, setWide] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q), on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export default function App() {
  const [where, setWhere] = useState<Where>(HOME);
  const [locating, setLocating] = useState(false);
  const [whenKey, setWhenKey] = useState<WhenKey>("now");
  const [custom, setCustom] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [first] = useState(initialPlan);
  const [view, setView] = useState<"list" | "map" | "plan">(first.shared ? "plan" : "list");
  const [plan, setPlanState] = useState<Plan>(first.plan);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [places, setPlaces] = useState<NearbyPlace[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [session, setSession] = useState<Session | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const wide = useWide();

  // Keep "now" fresh so statuses flip at 4pm without a reload.
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 60000); return () => clearInterval(id); }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => { repo.savedIds().then(setSaved).catch(() => {}); }, [session]);

  useEffect(() => {
    let live = true;
    setLoadError(false);
    repo.nearby(where.lat, where.lon).then((p) => live && setPlaces(p)).catch(() => live && setLoadError(true));
    return () => { live = false; };
  }, [where.lat, where.lon]);

  useEffect(() => {
    if (first.shared) history.replaceState(null, "", location.pathname);
  }, [first.shared]);

  const setPlan = useCallback((p: Plan) => {
    setPlanState(p);
    try { localStorage.setItem(LS_PLAN, encodePlan(p)); } catch { /* storage blocked */ }
  }, []);

  const toast = useCallback((m: string) => { setToastMsg(m); setTimeout(() => setToastMsg((c) => (c === m ? null : c)), 3200); }, []);

  const at = useMemo(() => resolveWhen(whenKey, custom, new Date(tick)), [whenKey, custom, tick]);
  const word = whenWord(whenKey, at, new Date(tick));

  const rows: ResultRow[] = useMemo(() => {
    if (!places) return [];
    return places
      .map(({ place, distanceKm }) => ({ place, distanceKm, ev: evaluate(place, at) }))
      .filter((r) => passes(r.place, r.ev, filters, saved))
      .sort(compareResults);
  }, [places, at, filters, saved]);

  const byId = useMemo(() => new Map((places ?? []).map((p) => [p.place.id, p.place])), [places]);
  // Look up the open place among all places, not just the filtered ones, so day-out stops always open.
  const selected: ResultRow | null = useMemo(() => {
    const hit = places?.find((p) => p.place.id === selectedId);
    return hit ? { ...hit, ev: evaluate(hit.place, at) } : null;
  }, [places, selectedId, at]);
  const inPlan = !!selected && plan.stops.some((s) => s.placeId === selected.place.id);

  function togglePlan(id: string) {
    if (plan.stops.some((s) => s.placeId === id)) {
      setPlan({ ...plan, stops: plan.stops.filter((s) => s.placeId !== id) });
      toast("Removed from your day out.");
    } else if (plan.stops.length >= 12) {
      toast("That's a big day! A day out holds up to 12 stops.");
    } else {
      setPlan({ ...plan, stops: [...plan.stops, { placeId: id, stayMin: 60 }] });
      toast(`Added. ${plan.stops.length + 1} stop${plan.stops.length ? "s" : ""} in your day out.`);
    }
  }
  const offCount = rows.filter((r) => r.ev.status === "off_leash").length;
  const canReport = repo.mode === "local" || !!session;

  function locate() {
    if (!("geolocation" in navigator)) return toast("Location isn't available on this device.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setWhere({ lat: p.coords.latitude, lon: p.coords.longitude, label: "Near me", located: true }); setLocating(false); },
      () => { setLocating(false); toast("Couldn't get your location. Showing places near Kellyville."); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 },
    );
  }

  async function toggleSave(id: string) {
    if (repo.mode === "supabase" && !session) return setSigningIn(true);
    const next = new Set(saved);
    const on = !next.has(id);
    on ? next.add(id) : next.delete(id);
    setSaved(next);
    try { await repo.setSaved(id, on); } catch { setSaved(saved); toast("Couldn't save that. Try again."); }
  }

  const closeSheet = useCallback(() => setSelectedId(null), []);
  const loadSummary = useCallback(() => repo.reportSummary(selectedId ?? ""), [selectedId]);
  const report = useCallback((kind: Parameters<Repository["addReport"]>[1], note?: string) => repo.addReport(selectedId ?? "", kind, note), [selectedId]);

  const showPlan = view === "plan";
  const showList = !showPlan && (wide || view === "list");
  const showMap = wide || view === "map";

  return (
    <div className="app">
      <header className="top">
        <div className="brandrow">
          <a className="logo" href="/" aria-label="Sniffari home"><Pup /> Sniffari</a>
          <span className="grow" />
          {wide && (
            <button type="button" className={`pill${showPlan ? " on" : ""}`} onClick={() => setView(showPlan ? "list" : "plan")}>
              {Icon.paw()} Day out{plan.stops.length ? ` (${plan.stops.length})` : ""}
            </button>
          )}
          {supabase && (session
            ? <button type="button" className="iconbtn" aria-label="Sign out" title={`Signed in as ${session.user.email}. Tap to sign out.`} onClick={() => { supabase!.auth.signOut(); toast("Signed out."); }}>{Icon.user()}</button>
            : <button type="button" className="pill" onClick={() => setSigningIn(true)}>Sign in</button>)}
        </div>
        {!showPlan && <>
        <div className="where">
          <button type="button" className={`pill${where.located ? " brand" : ""}`} onClick={locate} aria-label="Use my location">
            {Icon.locate()} {locating ? "Finding you…" : where.label}
          </button>
          <label className="pill">
            {Icon.clock()}
            <span className="sr">When are you going?</span>
            <select value={whenKey} onChange={(e) => setWhenKey(e.target.value as WhenKey)}>
              {(Object.keys(WHEN_LABEL) as WhenKey[]).map((k) => <option key={k} value={k}>{WHEN_LABEL[k]}</option>)}
            </select>
          </label>
          {whenKey === "custom" && (
            <label className="pill"><span className="sr">Date and time</span><input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} /></label>
          )}
        </div>
        <div className="chips" role="group" aria-label="Filters">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={`pill${filters[f.key] ? " on" : ""}`} aria-pressed={filters[f.key]}
              onClick={() => setFilters((c) => ({ ...c, [f.key]: !c[f.key] }))}>
              {f.key === "offLeash" && word === "now" ? "Off-leash now" : f.label}
            </button>
          ))}
        </div>
        </>}
      </header>

      <main className={wide ? "split" : undefined}>
        {showList && (
          <div className="list">
            {loadError ? (
              <div className="empty"><Pup size={96} /><h2>Couldn't fetch places</h2><p>Check your connection and try again.</p></div>
            ) : !places ? (
              <p className="count">Sniffing around…</p>
            ) : rows.length === 0 ? (
              <div className="empty"><Pup size={96} /><h2>No places match</h2><p>Try fewer filters or a different time.</p>
                {filters.venues && <GoogleSearches near={where} />}</div>
            ) : (
              <>
                <p className="count">{offCount} off-leash {word === "now" ? "right now" : word} · {rows.length} {rows.length === 1 ? "place" : "places"}</p>
                <div className="cards">
                  {rows.map((r) => <PlaceCard key={r.place.id} row={r} at={at} when={word} onOpen={() => setSelectedId(r.place.id)} />)}
                </div>
                <GoogleSearches near={where} />
                <p className="hint" style={{ textAlign: "center", marginTop: 20 }}>
                  Rules change. Signs at the park win: if they disagree, tap the place and flag it.
                </p>
              </>
            )}
          </div>
        )}
        {showPlan && (
          <div className="list">
            <PlanView plan={plan} setPlan={setPlan} byId={byId} here={where} onOpen={setSelectedId} toast={toast} />
          </div>
        )}
        {showMap && (
          <div className="mapwrap">
            <Suspense fallback={<p className="count" style={{ padding: 16 }}>Loading map…</p>}>
              <MapView rows={rows} centre={where} located={where.located} selectedId={selectedId} onSelect={setSelectedId} />
            </Suspense>
          </div>
        )}
      </main>

      {!wide && (
        <nav className="viewbar" aria-label="View">
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>{Icon.list()} List</button>
          <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>{Icon.map()} Map</button>
          <button type="button" aria-pressed={view === "plan"} onClick={() => setView("plan")}>{Icon.paw()} Day out{plan.stops.length ? ` ${plan.stops.length}` : ""}</button>
        </nav>
      )}

      {selected && (
        <PlaceSheet row={selected} at={at} when={word} saved={saved.has(selected.place.id)} canReport={canReport}
          inPlan={inPlan} onPlan={() => togglePlan(selected.place.id)}
          onSave={() => toggleSave(selected.place.id)} onClose={closeSheet} onNeedSignIn={() => setSigningIn(true)}
          loadSummary={loadSummary} report={report} toast={toast} />
      )}
      {signingIn && supabase && <SignIn db={supabase} onClose={() => setSigningIn(false)} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}

/** Google is where most people look, so hand off to it for anything Sniffari doesn't cover yet. Free, no API key. */
function GoogleSearches({ near }: { near: { label: string; located: boolean } }) {
  return (
    <div className="gsearch">
      <p className="hint">Search Google Maps for more spots {near.located ? "near you" : `near ${near.label}`}:</p>
      <div className="acts">
        {["dog friendly cafes", "dog friendly pubs", "dog park"].map((q) => (
          <a key={q} className="btn" href={googleSearchUrl(q, near)} target="_blank" rel="noopener">{q.replace(/^dog friendly /, "Dog-friendly ").replace(/^dog park$/, "Dog parks")}</a>
        ))}
      </div>
    </div>
  );
}
