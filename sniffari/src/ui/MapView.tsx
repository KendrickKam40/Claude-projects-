// The map: free OpenFreeMap tiles (OpenStreetMap data) recoloured to match the app, with a pin per place coloured by status.

import { useEffect, useRef } from "react";
import { Map as MlMap, Marker, LngLatBounds, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { DogStatus } from "../domain/types";
import type { ResultRow } from "./types";

setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const PAW = '<svg viewBox="0 0 24 24"><circle cx="6.5" cy="10" r="2.2"/><circle cx="10" cy="5.5" r="2.2"/><circle cx="14" cy="5.5" r="2.2"/><circle cx="17.5" cy="10" r="2.2"/><path d="M8 16.5c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5c0 1.6-1.2 2.5-2.5 2.5-.6 0-1-.3-1.5-.3s-.9.3-1.5.3C9.2 19 8 18.1 8 16.5z"/></svg>';

/** Warm the base map: cream land, soft green parks, gentle blue water. */
function recolour(style: StyleSpecification, dark: boolean): StyleSpecification {
  const c = dark
    ? { land: "#211913", park: "#24301f", water: "#1d2a33", road: "#3a2e25", label: "#c9b39f" }
    : { land: "#fbf1e4", park: "#dfeccf", water: "#cde4ee", road: "#ffffff", label: "#6b5546" };
  for (const l of style.layers) {
    const id = l.id.toLowerCase();
    const paint = ((l as { paint?: Record<string, unknown> }).paint ??= {});
    if (l.type === "background") paint["background-color"] = c.land;
    else if (l.type === "fill" && id.includes("water")) paint["fill-color"] = c.water;
    else if (l.type === "fill" && /(park|wood|grass|forest|landcover|landuse_park)/.test(id)) paint["fill-color"] = c.park;
    else if (l.type === "line" && /(road|highway|street|minor|major|motorway|trunk|primary|secondary|tertiary)/.test(id) && !id.includes("casing")) paint["line-color"] = c.road;
    else if (l.type === "symbol") paint["text-color"] = c.label;
  }
  return style;
}

interface Props {
  rows: ResultRow[];
  centre: { lat: number; lon: number };
  located: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function MapView({ rows, centre, located, selectedId, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef(new Map<string, { m: Marker; el: HTMLDivElement; status: DogStatus }>());
  const me = useRef<Marker | null>(null);
  /** The centre the view was last framed for; re-frame when it moves. */
  const fittedFor = useRef<string | null>(null);
  const latest = useRef({ rows, centre });
  latest.current = { rows, centre };

  /** Frame the start point and the nearest dozen places. */
  function frame(m: MlMap) {
    const { rows: r, centre: c } = latest.current;
    const key = `${c.lat},${c.lon}`;
    if (fittedFor.current === key || !r.length) return;
    m.resize();
    const b = new LngLatBounds([c.lon, c.lat], [c.lon, c.lat]);
    r.slice(0, 12).forEach((x) => b.extend([x.place.lon, x.place.lat]));
    m.fitBounds(b, { padding: { top: 50, bottom: 110, left: 40, right: 40 }, maxZoom: 14, duration: 0 });
    fittedFor.current = key;
  }

  useEffect(() => {
    if (!box.current) return;
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    let cancelled = false;
    const m = new MlMap({ container: box.current, style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": dark ? "#211913" : "#fbf1e4" } }] }, center: [centre.lon, centre.lat], zoom: 10, attributionControl: { compact: true } });
    map.current = m;
    m.once("load", () => { fittedFor.current = null; frame(m); });
    fetch(STYLE_URL).then((r) => r.json()).then((style: StyleSpecification) => { if (!cancelled) m.setStyle(recolour(style, dark)); }).catch(() => { /* offline: pins still show on a plain background */ });
    return () => { cancelled = true; m.remove(); map.current = null; markers.current.clear(); me.current = null; fittedFor.current = null; };
    // The map is created once; centre changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pins
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const { place, ev } of rows) {
      seen.add(place.id);
      let entry = markers.current.get(place.id);
      if (!entry) {
        const el = document.createElement("div");
        // MapLibre positions the outer element and owns its classes; colour and selection live on the inner pin.
        el.className = "mkwrap";
        el.innerHTML = `<span class="mk">${PAW}</span>`;
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.addEventListener("click", (e) => { e.stopPropagation(); onSelect(place.id); });
        el.addEventListener("keydown", (e) => { if (e.key === "Enter") onSelect(place.id); });
        entry = { m: new Marker({ element: el, anchor: "bottom" }).setLngLat([place.lon, place.lat]).addTo(m), el, status: ev.status };
        markers.current.set(place.id, entry);
      }
      const pin = entry.el.firstElementChild as HTMLElement;
      pin.className = `mk ${ev.status}${place.id === selectedId ? " sel" : ""}`;
      entry.el.style.zIndex = place.id === selectedId ? "2" : "";
      entry.el.setAttribute("aria-label", `${place.name}: ${ev.status.replace("_", " ")}`);
    }
    for (const [id, entry] of markers.current) if (!seen.has(id)) { entry.m.remove(); markers.current.delete(id); }
    if (m.loaded()) frame(m);
    // frame() reads the latest rows and centre through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selectedId, onSelect, centre.lat, centre.lon]);

  // You are here
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (located) {
      if (!me.current) { const el = document.createElement("div"); el.className = "me"; el.setAttribute("aria-label", "You are here"); me.current = new Marker({ element: el }).setLngLat([centre.lon, centre.lat]).addTo(m); }
      else me.current.setLngLat([centre.lon, centre.lat]);
    }
  }, [centre.lat, centre.lon, located]);

  // Fly to the selected place
  useEffect(() => {
    const row = rows.find((r) => r.place.id === selectedId);
    if (row && map.current) map.current.easeTo({ center: [row.place.lon, row.place.lat], zoom: Math.max(map.current.getZoom(), 13), duration: 600 });
  }, [selectedId, rows]);

  return <div className="map" ref={box} role="region" aria-label="Map of dog-friendly places" />;
}
