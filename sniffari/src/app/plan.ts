// "Plan a day out": an ordered list of stops with a start time. Works out rough drive times, when you'll arrive,
// and whether the dogs are allowed (and off-leash) for the whole visit. Plans live on the device and travel as a link.

import type { DogStatus, Place } from "../domain/types";
import { statusAt, evaluate } from "../domain/rules";
import { distanceKm } from "../domain/geo";
import { formatClock } from "../domain/time";
import { resolveWhen } from "./logic";

export interface PlanStop { placeId: string; stayMin: number }

export interface Plan {
  title: string;
  /** Local Sydney start, "YYYY-MM-DDTHH:MM". */
  start: string;
  from: { label: string; lat: number; lon: number };
  stops: PlanStop[];
}

export interface ScheduledStop {
  stop: PlanStop;
  place: Place;
  driveMin: number;
  driveKm: number;
  arrive: Date;
  leave: Date;
  status: DogStatus;
  warnings: string[];
}

export interface Schedule {
  stops: ScheduledStop[];
  missing: string[];
  home: { driveMin: number; driveKm: number; arrive: Date } | null;
  totalDriveMin: number;
}

/** Road distance is roughly 1.35× straight-line around Sydney; slower in town, faster on highways. Plus 5 min to park. */
export function driveEstimate(km: number): { km: number; min: number } {
  const road = km * 1.35;
  const speed = road < 15 ? 35 : road < 40 ? 45 : 60;
  return { km: Math.round(road), min: Math.round((road / speed) * 60 + 5) };
}

const WORD: Record<DogStatus, string> = { off_leash: "off-leash", on_lead: "on lead", no_dogs: "no dogs" };

export function schedule(plan: Plan, byId: Map<string, Place>, now: Date = new Date()): Schedule {
  let t = resolveWhen("custom", plan.start, now);
  let here: { lat: number; lon: number } = plan.from;
  const out: ScheduledStop[] = [], missing: string[] = [];
  let total = 0;
  for (const stop of plan.stops) {
    const place = byId.get(stop.placeId);
    if (!place) { missing.push(stop.placeId); continue; }
    const d = driveEstimate(distanceKm(here.lat, here.lon, place.lat, place.lon));
    total += d.min;
    const arrive = new Date(t.getTime() + d.min * 60000);
    const leave = new Date(arrive.getTime() + stop.stayMin * 60000);
    const status = statusAt(place, arrive).status;
    const warnings: string[] = [];
    if (status === "no_dogs") {
      const ev = evaluate(place, arrive, 2);
      warnings.push(ev.next ? `No dogs when you arrive. Dogs ${WORD[ev.next.status]} from ${formatClock(ev.next.at)}.` : "No dogs allowed here.");
    } else {
      const ev = evaluate(place, arrive, 2);
      if (ev.until && ev.until < leave && ev.next) warnings.push(`Changes to ${WORD[ev.next.status]} at ${formatClock(ev.until)}, during your visit.`);
    }
    out.push({ stop, place, driveMin: d.min, driveKm: d.km, arrive, leave, status, warnings });
    t = leave;
    here = place;
  }
  let home: Schedule["home"] = null;
  if (out.length) {
    const d = driveEstimate(distanceKm(here.lat, here.lon, plan.from.lat, plan.from.lon));
    total += d.min;
    home = { driveMin: d.min, driveKm: d.km, arrive: new Date(t.getTime() + d.min * 60000) };
  }
  return { stops: out, missing, home, totalDriveMin: total };
}

/** Google Maps directions through every stop and back to the start. */
export function routeUrl(plan: Plan, byId: Map<string, Place>): string {
  const pts = plan.stops.map((s) => byId.get(s.placeId)).filter((p): p is Place => !!p).map((p) => `${p.lat},${p.lon}`);
  const origin = `${plan.from.lat},${plan.from.lon}`;
  const q = new URLSearchParams({ api: "1", origin, destination: origin, travelmode: "driving" });
  if (pts.length) q.set("waypoints", pts.join("|"));
  return `https://www.google.com/maps/dir/?${q}`;
}

// ---------- Sharing: the whole plan in the link ----------

export function encodePlan(plan: Plan): string {
  const bytes = new TextEncoder().encode(JSON.stringify(plan));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePlan(s: string): Plan | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Plan;
    const ok = typeof p.title === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(p.start) && Array.isArray(p.stops)
      && typeof p.from?.lat === "number" && typeof p.from?.lon === "number"
      && p.stops.every((s) => typeof s.placeId === "string" && typeof s.stayMin === "number");
    return ok ? { ...p, stops: p.stops.slice(0, 12).map((s) => ({ placeId: s.placeId, stayMin: Math.min(600, Math.max(10, Math.round(s.stayMin))) })) } : null;
  } catch {
    return null;
  }
}

/** The Mt Wilson garden day, as a ready-made example. */
export const EXAMPLE_PLAN: Plan = {
  title: "Mt Wilson garden day",
  start: "2026-10-25T08:00",
  from: { label: "Home, Kellyville", lat: -33.7135, lon: 150.9395 },
  stops: [
    { placeId: "bellbird-lookout", stayMin: 20 },
    { placeId: "windyridge-garden", stayMin: 120 },
    { placeId: "hillbilly-cider", stayMin: 75 },
  ],
};
