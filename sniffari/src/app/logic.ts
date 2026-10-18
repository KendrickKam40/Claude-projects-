// App-level logic kept out of the components so it can be tested: "when are you going?", filters, sorting and freshness.

import type { Evaluation } from "../domain/rules";
import type { DayToken, Place, Rule, Source } from "../domain/types";
import { addDays, formatClock, localParts, sydneyTime } from "../domain/time";

export type WhenKey = "now" | "arvo" | "tonight" | "tomorrow" | "weekend" | "custom";

export const WHEN_LABEL: Record<WhenKey, string> = {
  now: "Right now",
  arvo: "This arvo (3pm)",
  tonight: "Tonight (6pm)",
  tomorrow: "Tomorrow 7am",
  weekend: "Saturday 8am",
  custom: "Pick a time…",
};

/** Turns a "when" choice into an instant. Times already past today fall back to now. */
export function resolveWhen(key: WhenKey, custom: string | undefined, now: Date = new Date()): Date {
  const lp = localParts(now);
  const today = (minutes: number) => {
    const t = sydneyTime(lp.year, lp.month, lp.day, minutes);
    return t < now ? now : t;
  };
  switch (key) {
    case "arvo": return today(15 * 60);
    case "tonight": return today(18 * 60);
    case "tomorrow": {
      const d = addDays(lp.year, lp.month, lp.day, 1);
      return sydneyTime(d.year, d.month, d.day, 7 * 60);
    }
    case "weekend": {
      const ahead = (6 - lp.weekday + 7) % 7;
      const d = addDays(lp.year, lp.month, lp.day, ahead);
      const t = sydneyTime(d.year, d.month, d.day, 8 * 60);
      if (t >= now) return t;
      const n = addDays(d.year, d.month, d.day, 7);
      return sydneyTime(n.year, n.month, n.day, 8 * 60);
    }
    case "custom": {
      const m = custom && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(custom);
      return m ? sydneyTime(+m[1]!, +m[2]!, +m[3]!, +m[4]! * 60 + +m[5]!) : now;
    }
    default: return now;
  }
}

export interface Filters {
  offLeash: boolean;
  fenced: boolean;
  reactive: boolean;
  saved: boolean;
}

export const NO_FILTERS: Filters = { offLeash: false, fenced: false, reactive: false, saved: false };

/** Fully fenced, or with a separate small-dog area: the places most suited to dogs that need space from others. */
export function isReactiveFriendly(place: Place): boolean {
  return place.features.fenced === "full" || !!place.features.smallDogArea;
}

export function passes(place: Place, ev: Evaluation, f: Filters, saved: Set<string>): boolean {
  if (f.offLeash && ev.status !== "off_leash") return false;
  if (f.fenced && place.features.fenced !== "full") return false;
  if (f.reactive && !isReactiveFriendly(place)) return false;
  if (f.saved && !saved.has(place.id)) return false;
  return true;
}

const RANK = { off_leash: 0, on_lead: 1, no_dogs: 2 } as const;

/** Nearest first, but places where dogs aren't allowed at that time drop to the end. */
export function compareResults(a: { ev: Evaluation; distanceKm: number }, b: { ev: Evaluation; distanceKm: number }): number {
  const na = a.ev.status === "no_dogs" ? 1 : 0, nb = b.ev.status === "no_dogs" ? 1 : 0;
  return na - nb || a.distanceKm - b.distanceKm || RANK[a.ev.status] - RANK[b.ev.status];
}

export function placeSources(place: Place): Source[] {
  const all = [place.defaultSource, ...place.rules.map((r) => r.source)].filter((s): s is Source => !!s);
  const seen = new Set<string>();
  return all.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

/** "Checked 17 Oct · official source" — the newest check across a place's sources. */
export function freshness(place: Place): string {
  const sources = placeSources(place);
  if (!sources.length) return "Not checked yet";
  const newest = sources.map((s) => s.checked).sort().at(-1)!;
  const d = new Date(newest + "T00:00:00Z");
  const label = d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: d.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : "numeric", timeZone: "UTC" });
  const onlyGuides = sources.every((s) => s.kind === "guide");
  return `Rules checked ${label} · ${onlyGuides ? "from a local guide, not council" : "official source"}`;
}

export function directionsUrl(place: Place): string {
  const q = new URLSearchParams({ api: "1", destination: `${place.lat},${place.lon}` });
  if (place.googlePlaceId) q.set("destination_place_id", place.googlePlaceId);
  return `https://www.google.com/maps/dir/?${q}`;
}

/** Opens the place's Google Maps listing (reviews, photos, hours). Free, no API key: a place ID when we have one,
 *  otherwise a name-and-suburb search that lands on the listing. */
export function googleListingUrl(place: Place): string {
  const where = place.address ?? place.area;
  const q = new URLSearchParams({ api: "1", query: `${place.name}, ${where}` });
  if (place.googlePlaceId) q.set("query_place_id", place.googlePlaceId);
  return `https://www.google.com/maps/search/?${q}`;
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function clockLabel(t: string): string {
  if (t === "sunrise" || t === "sunset") return t;
  const [h, m] = t.split(":").map(Number);
  const hh = h! % 12 === 0 ? 12 : h! % 12;
  return `${hh}${m ? ":" + String(m).padStart(2, "0") : ""}${h! < 12 ? "am" : "pm"}`;
}

/** "Weekends & public holidays · 4pm–9am · daylight saving": the when-part of a rule in plain words. */
export function ruleWhen(rule: Rule): string {
  const parts: string[] = [];
  if (rule.days?.length) {
    const days = rule.days.filter((d): d is Exclude<DayToken, "PH"> => d !== "PH").sort();
    const key = days.join("");
    const ph = rule.days.includes("PH");
    let label = key === "12345" ? "Weekdays" : key === "06" ? "Weekends" : key === "0123456" ? "Every day" : days.map((d) => DAY_SHORT[d]).join(", ");
    if (ph) label = days.length ? `${label} & public holidays` : "Public holidays";
    parts.push(label);
  }
  if (rule.window) parts.push(rule.window.from === "00:00" && rule.window.to === "24:00" ? "All day" : `${clockLabel(rule.window.from)}–${clockLabel(rule.window.to)}`);
  if (rule.season) {
    parts.push(rule.season === "daylight_saving" ? "during daylight saving" : rule.season === "standard_time" ? "outside daylight saving" : `${seasonDate(rule.season.from)} to ${seasonDate(rule.season.to)}`);
  }
  return parts.length ? parts.join(" · ") : "Any time";
}

function seasonDate(mmdd: string): string {
  const [m, d] = mmdd.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m! - 1]}`;
}

/** The word used in place of "now" for a planned time: "at 3pm", "Sat 8am". */
export function whenWord(key: WhenKey, at: Date, now: Date = new Date()): string {
  if (key === "now" || Math.abs(at.getTime() - now.getTime()) < 60000) return "now";
  const a = localParts(now), b = localParts(at);
  const sameDay = a.year === b.year && a.month === b.month && a.day === b.day;
  return sameDay ? `at ${formatClock(at)}` : `${DAY_SHORT[b.weekday]} ${formatClock(at)}`;
}
