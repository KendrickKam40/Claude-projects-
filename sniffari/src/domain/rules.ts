// The rules engine: given a place's rules and a moment, what can a dog do here, and until when?
// Pure functions over Sydney time, so the UI, tests and import scripts all agree.

import type { ClockTime, DogStatus, Place, Rule, Season } from "./types";
import { addDays, formatClock, isDaylightSaving, isPublicHoliday, localParts, sunMinutes, sydneyTime, type LocalParts } from "./time";

export interface Evaluation {
  status: DogStatus;
  /** The rule that decided the status, or null when the place's default applies. */
  rule: Rule | null;
  /** When the status next changes, if within the look-ahead. */
  until: Date | null;
  next: { status: DogStatus; at: Date } | null;
}

export interface Segment {
  from: Date;
  to: Date;
  status: DogStatus;
  rule: Rule | null;
}

function clockToMinutes(t: ClockTime, place: Place, lp: Pick<LocalParts, "year" | "month" | "day">): number | null {
  if (t === "sunrise" || t === "sunset") return sunMinutes(t, place.lat, place.lon, lp.year, lp.month, lp.day);
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function inSeason(season: Season, at: Date, lp: LocalParts): boolean {
  if (season === "daylight_saving") return isDaylightSaving(at);
  if (season === "standard_time") return !isDaylightSaving(at);
  const today = lp.month * 100 + lp.day;
  const [fm, fd] = season.from.split("-").map(Number);
  const [tm, td] = season.to.split("-").map(Number);
  const from = (fm ?? 1) * 100 + (fd ?? 1), to = (tm ?? 12) * 100 + (td ?? 31);
  return from <= to ? today >= from && today <= to : today >= from || today <= to;
}

function matchesDays(rule: Rule, lp: LocalParts): boolean {
  if (!rule.days || rule.days.length === 0) return true;
  const holiday = isPublicHoliday(lp.year, lp.month, lp.day);
  if (holiday && rule.days.includes("PH")) return true;
  if (!rule.days.includes(lp.weekday as 0)) return false;
  // "Weekdays" rules don't apply on public holidays; rules that include weekend days still follow the weekday.
  if (holiday) return rule.days.some((d) => d === 0 || d === 6);
  return true;
}

function matchesWindow(rule: Rule, place: Place, lp: LocalParts): boolean {
  if (!rule.window) return true;
  const from = clockToMinutes(rule.window.from, place, lp);
  const to = clockToMinutes(rule.window.to, place, lp);
  if (from === null || to === null) return false;
  return from <= to ? lp.minutes >= from && lp.minutes < to : lp.minutes >= from || lp.minutes < to;
}

/** More constraints = more specific. Explicit priority wins over the automatic ranking. */
function specificity(rule: Rule): number {
  if (rule.priority !== undefined) return 1000 + rule.priority;
  return (rule.days?.length ? 1 : 0) + (rule.window ? 2 : 0) + (rule.season ? 1 : 0);
}

export function statusAt(place: Place, at: Date): { status: DogStatus; rule: Rule | null } {
  const lp = localParts(at);
  let best: Rule | null = null;
  for (const rule of place.rules) {
    if (rule.season && !inSeason(rule.season, at, lp)) continue;
    if (!matchesDays(rule, lp) || !matchesWindow(rule, place, lp)) continue;
    if (!best || specificity(rule) > specificity(best)) best = rule;
  }
  return best ? { status: best.status, rule: best } : { status: place.defaultStatus, rule: null };
}

/** Every moment in the coming days at which a rule could start or stop applying. */
function boundaries(place: Place, at: Date, days: number): Date[] {
  const lp = localParts(at);
  const out: number[] = [];
  for (let k = 0; k <= days; k++) {
    const d = addDays(lp.year, lp.month, lp.day, k);
    out.push(sydneyTime(d.year, d.month, d.day, 0).getTime());
    for (const rule of place.rules) {
      if (!rule.window) continue;
      for (const t of [rule.window.from, rule.window.to]) {
        const m = clockToMinutes(t, place, d);
        if (m !== null) out.push(sydneyTime(d.year, d.month, d.day, m).getTime());
      }
    }
  }
  return [...new Set(out)].filter((t) => t > at.getTime()).sort((a, b) => a - b).map((t) => new Date(t));
}

export function evaluate(place: Place, at: Date = new Date(), lookAheadDays = 8): Evaluation {
  const now = statusAt(place, at);
  for (const b of boundaries(place, at, lookAheadDays)) {
    const s = statusAt(place, b);
    if (s.status !== now.status) return { ...now, until: b, next: { status: s.status, at: b } };
  }
  return { ...now, until: null, next: null };
}

/** Today's timeline for a place, from local midnight to the next midnight. */
export function daySegments(place: Place, at: Date = new Date()): Segment[] {
  const lp = localParts(at);
  const start = sydneyTime(lp.year, lp.month, lp.day, 0);
  const t = addDays(lp.year, lp.month, lp.day, 1);
  const end = sydneyTime(t.year, t.month, t.day, 0);
  const cuts = [start, ...boundaries(place, start, 1).filter((b) => b < end), end];
  const segs: Segment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i]!, to = cuts[i + 1]!;
    const s = statusAt(place, from);
    const last = segs[segs.length - 1];
    if (last && last.status === s.status && last.rule === s.rule) last.to = to;
    else segs.push({ from, to, status: s.status, rule: s.rule });
  }
  return segs;
}

const NOW_WORD: Record<DogStatus, string> = { off_leash: "Off-leash", on_lead: "On lead", no_dogs: "No dogs" };

function dayLabel(target: Date, at: Date): string {
  const a = localParts(at), b = localParts(target);
  if (a.year === b.year && a.month === b.month && a.day === b.day) return "";
  const tomorrow = addDays(a.year, a.month, a.day, 1);
  if (tomorrow.year === b.year && tomorrow.month === b.month && tomorrow.day === b.day) return " tomorrow";
  return " " + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][b.weekday];
}

/** One line for lists: "Off-leash now · until 9am", "On lead now · off-leash from 4:30pm".
 *  `when` replaces "now" when the evaluation is for a planned time, e.g. "at 3pm". */
export function describe(ev: Evaluation, at: Date = new Date(), when = "now"): string {
  const head = `${NOW_WORD[ev.status]} ${when}`;
  if (!ev.next) return head;
  if (ev.status === "off_leash") return `${head} · until ${formatClock(ev.next.at)}${dayLabel(ev.next.at, at)}`;
  if (ev.next.status === "off_leash") return `${head} · off-leash from ${formatClock(ev.next.at)}${dayLabel(ev.next.at, at)}`;
  return `${head} · ${NOW_WORD[ev.next.status].toLowerCase()} from ${formatClock(ev.next.at)}${dayLabel(ev.next.at, at)}`;
}
