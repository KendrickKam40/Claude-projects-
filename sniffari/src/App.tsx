// Sniffari, "near me": where can the dogs go at the time you pick, nearest first, as a list or a map.

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { evaluate } from "./domain/rules";
import { DEFAULT_CENTRE } from "./domain/geo";
import { LocalRepository, SupabaseRepository, type NearbyPlace, type Repository } from "./data/repository";
import { supabase } from "./lib/supabase";
import { compareResults, passes, resolveWhen, whenWord, NO_FILTERS, WHEN_LABEL, type Filters, type WhenKey } from "./app/logic";
import { Icon, Pup } from "./ui/Icons";
import PlaceCard from "./ui/PlaceCard";
import PlaceSheet from "./ui/PlaceSheet";
import SignIn from "./ui/SignIn";
import type { ResultRow } from "./ui/types";

const MapView = lazy(() => import("./ui/MapView"));

const repo: Repository = supabase ? new SupabaseRepository(supabase) : new LocalRepository();

const FILTERS: { key: keyof Filters; label: string }[] = [
  { key: "offLeash", label: "Off-leash then" },
  { key: "fenced", label: "Fully fenced" },
  { key: "reactive", label: "Reactive-friendly" },
  { key: "saved", label: "Saved" },
];

type Where = { lat: number; lon: number; label: string; located: boolean };
const HOME: Where = { ...DEFAULT_CENTRE, label: "Kellyville", located: false };

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
  const [view, setView] = useState<"list" | "map">("list");
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

  const selected = rows.find((r) => r.place.id === selectedId) ?? null;
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

  const showList = wide || view === "list";
  const showMap = wide || view === "map";

  return (
    <div className="app">
      <header className="top">
        <div className="brandrow">
          <a className="logo" href="/" aria-label="Sniffari home"><Pup /> Sniffari</a>
          <span className="grow" />
          {supabase && (session
            ? <button type="button" className="iconbtn" aria-label="Sign out" title={`Signed in as ${session.user.email}. Tap to sign out.`} onClick={() => { supabase!.auth.signOut(); toast("Signed out."); }}>{Icon.user()}</button>
            : <button type="button" className="pill" onClick={() => setSigningIn(true)}>Sign in</button>)}
        </div>
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
      </header>

      <main className={wide ? "split" : undefined}>
        {showList && (
          <div className="list">
            {loadError ? (
              <div className="empty"><Pup size={96} /><h2>Couldn't fetch places</h2><p>Check your connection and try again.</p></div>
            ) : !places ? (
              <p className="count">Sniffing around…</p>
            ) : rows.length === 0 ? (
              <div className="empty"><Pup size={96} /><h2>No places match</h2><p>Try fewer filters or a different time.</p></div>
            ) : (
              <>
                <p className="count">{offCount} off-leash {word === "now" ? "right now" : word} · {rows.length} {rows.length === 1 ? "place" : "places"}</p>
                <div className="cards">
                  {rows.map((r) => <PlaceCard key={r.place.id} row={r} at={at} when={word} onOpen={() => setSelectedId(r.place.id)} />)}
                </div>
                <p className="hint" style={{ textAlign: "center", marginTop: 20 }}>
                  Rules change. Signs at the park win: if they disagree, tap the place and flag it.
                </p>
              </>
            )}
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
        </nav>
      )}

      {selected && (
        <PlaceSheet row={selected} at={at} when={word} saved={saved.has(selected.place.id)} canReport={canReport}
          onSave={() => toggleSave(selected.place.id)} onClose={closeSheet} onNeedSignIn={() => setSigningIn(true)}
          loadSummary={loadSummary} report={report} toast={toast} />
      )}
      {signingIn && supabase && <SignIn db={supabase} onClose={() => setSigningIn(false)} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}
