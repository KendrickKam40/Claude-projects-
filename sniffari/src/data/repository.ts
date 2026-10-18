// One data interface for the app. Uses Supabase when configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY),
// otherwise the bundled starter places, with reports and saved places kept on this device.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Place, Rule } from "../domain/types";
import { distanceKm } from "../domain/geo";
import { SEED_PLACES } from "./seed";

export type ReportKind = "confirm" | "flag" | "busy" | "quiet" | "hazard" | "gate_open" | "closed";

export interface Report {
  kind: ReportKind;
  note?: string;
  createdAt: string;
}

export interface ReportSummary {
  lastConfirmed: string | null;
  confirms90d: number;
  flags90d: number;
  recent: Report[];
  /** Quiet/busy reports by Sydney day of week (0 = Sun) and hour. */
  crowd: { dow: number; hour: number; quiet: number; busy: number }[];
}

export interface NearbyPlace {
  place: Place;
  distanceKm: number;
}

export interface Repository {
  readonly mode: "local" | "supabase";
  nearby(lat: number, lon: number, radiusKm?: number): Promise<NearbyPlace[]>;
  reportSummary(placeId: string): Promise<ReportSummary>;
  addReport(placeId: string, kind: ReportKind, note?: string): Promise<void>;
  savedIds(): Promise<Set<string>>;
  setSaved(placeId: string, saved: boolean): Promise<void>;
}

// ---------- Local (on this device) ----------

const LS_REPORTS = "sniffari.reports.v1";
const LS_SAVED = "sniffari.saved.v1";

function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: keep working without persistence */
  }
}

export function summarise(reports: Report[], now = Date.now()): ReportSummary {
  const d90 = now - 90 * 86400000;
  const confirms = reports.filter((r) => r.kind === "confirm");
  const crowd = new Map<string, { dow: number; hour: number; quiet: number; busy: number }>();
  for (const r of reports) {
    if (r.kind !== "quiet" && r.kind !== "busy") continue;
    const t = new Date(r.createdAt);
    const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(t);
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")?.value ?? "Sun");
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const key = `${dow}-${hour}`;
    const c = crowd.get(key) ?? { dow, hour, quiet: 0, busy: 0 };
    c[r.kind] += 1;
    crowd.set(key, c);
  }
  return {
    lastConfirmed: confirms.length ? confirms.map((r) => r.createdAt).sort().at(-1)! : null,
    confirms90d: confirms.filter((r) => Date.parse(r.createdAt) > d90).length,
    flags90d: reports.filter((r) => r.kind === "flag" && Date.parse(r.createdAt) > d90).length,
    recent: [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20),
    crowd: [...crowd.values()],
  };
}

export class LocalRepository implements Repository {
  readonly mode = "local" as const;
  constructor(private places: Place[] = SEED_PLACES) {}

  async nearby(lat: number, lon: number, radiusKm = 200): Promise<NearbyPlace[]> {
    return this.places
      .map((place) => ({ place, distanceKm: distanceKm(lat, lon, place.lat, place.lon) }))
      .filter((p) => p.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }
  async reportSummary(placeId: string) {
    const all = readLS<Record<string, Report[]>>(LS_REPORTS, {});
    return summarise(all[placeId] ?? []);
  }
  async addReport(placeId: string, kind: ReportKind, note?: string) {
    const all = readLS<Record<string, Report[]>>(LS_REPORTS, {});
    (all[placeId] ??= []).push({ kind, note, createdAt: new Date().toISOString() });
    writeLS(LS_REPORTS, all);
  }
  async savedIds() {
    return new Set(readLS<string[]>(LS_SAVED, []));
  }
  async setSaved(placeId: string, saved: boolean) {
    const ids = new Set(readLS<string[]>(LS_SAVED, []));
    if (saved) ids.add(placeId);
    else ids.delete(placeId);
    writeLS(LS_SAVED, [...ids]);
  }
}

// ---------- Supabase ----------

interface PlaceRow {
  id: string; name: string; kind: Place["kind"]; region: Place["region"]; area: string; address: string | null;
  lat: number; lon: number; approximate_location: boolean; default_status: Place["defaultStatus"];
  default_source: Place["defaultSource"] | null; features: Place["features"]; notes: string[]; hazards: string[];
  rules: { id: string; status: Rule["status"]; days: Rule["days"] | null; time_window: Rule["window"] | null; season: Rule["season"] | null; priority: number | null; note: string | null; source: Rule["source"] }[];
}

export function placeFromRow(row: PlaceRow): Place {
  return {
    id: row.id, name: row.name, kind: row.kind, region: row.region, area: row.area,
    address: row.address ?? undefined, lat: row.lat, lon: row.lon,
    approximateLocation: row.approximate_location, defaultStatus: row.default_status,
    defaultSource: row.default_source ?? undefined, features: row.features ?? {},
    notes: row.notes ?? [], hazards: row.hazards ?? [],
    rules: (row.rules ?? []).map((r) => ({
      id: r.id, status: r.status, source: r.source,
      ...(r.days ? { days: r.days } : {}), ...(r.time_window ? { window: r.time_window } : {}),
      ...(r.season ? { season: r.season } : {}), ...(r.priority !== null ? { priority: r.priority } : {}),
      ...(r.note ? { note: r.note } : {}),
    })),
  };
}

export class SupabaseRepository implements Repository {
  readonly mode = "supabase" as const;
  private local = new LocalRepository();
  constructor(private db: SupabaseClient) {}

  async nearby(lat: number, lon: number, radiusKm = 200): Promise<NearbyPlace[]> {
    const { data, error } = await this.db.rpc("nearby_places", { lat, lon, radius_m: radiusKm * 1000, max_results: 400 });
    if (error) throw error;
    return (data as { place: PlaceRow; distance_m: number }[]).map((d) => ({ place: placeFromRow(d.place), distanceKm: d.distance_m / 1000 }));
  }
  async reportSummary(placeId: string): Promise<ReportSummary> {
    const { data, error } = await this.db.rpc("place_report_summary", { target: placeId });
    if (error) throw error;
    return data as ReportSummary;
  }
  async addReport(placeId: string, kind: ReportKind, note?: string) {
    const { error } = await this.db.from("reports").insert({ place_id: placeId, kind, note: note || null });
    if (error) throw error;
  }
  async savedIds() {
    const { data, error } = await this.db.from("saved_places").select("place_id");
    if (error) return this.local.savedIds();
    return new Set((data ?? []).map((r: { place_id: string }) => r.place_id));
  }
  async setSaved(placeId: string, saved: boolean) {
    const q = saved
      ? this.db.from("saved_places").upsert({ place_id: placeId })
      : this.db.from("saved_places").delete().eq("place_id", placeId);
    const { error } = await q;
    if (error) throw error;
  }
}
