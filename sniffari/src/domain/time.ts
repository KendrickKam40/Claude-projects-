// Sydney-time helpers: wall-clock parts, wall-clock → instant, NSW public holidays and sunrise/sunset.
// No dependencies, so the rules engine runs the same in the browser, in tests and in import scripts.

export const TZ = "Australia/Sydney";

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: number; // 0 = Sunday
  minutes: number; // minutes since local midnight
}

const fmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
  weekday: "short",
});
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(at: Date): LocalParts {
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(at)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    weekday: WEEKDAYS[p.weekday ?? "Sun"] ?? 0,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** Sydney's UTC offset in minutes at an instant (600 in winter, 660 in daylight saving). */
export function offsetMinutes(at: Date): number {
  const p = localParts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, 0, p.minutes);
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

export function isDaylightSaving(at: Date): boolean {
  return offsetMinutes(at) === 660;
}

/** The instant a Sydney wall-clock time happens. Times skipped by daylight saving land just after the jump. */
export function sydneyTime(year: number, month: number, day: number, minutes: number): Date {
  const guess = Date.UTC(year, month - 1, day, 0, minutes);
  let at = new Date(guess - 600 * 60000);
  for (let i = 0; i < 2; i++) at = new Date(guess - offsetMinutes(at) * 60000);
  return at;
}

/** Add whole calendar days to a local date, returning the new local date. */
export function addDays(year: number, month: number, day: number, n: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// NSW public holidays (state-wide). Bank Holiday is excluded: it only applies to banks.
// Keep this list current each year; the rules engine treats these dates as "PH".
const NSW_PUBLIC_HOLIDAYS = new Set<string>([
  "2026-01-01", "2026-01-26", "2026-04-03", "2026-04-04", "2026-04-05", "2026-04-06", "2026-04-25",
  "2026-06-08", "2026-10-05", "2026-12-25", "2026-12-26", "2026-12-28",
  "2027-01-01", "2027-01-26", "2027-03-26", "2027-03-27", "2027-03-28", "2027-03-29", "2027-04-25",
  "2027-06-14", "2027-10-04", "2027-12-25", "2027-12-26", "2027-12-27", "2027-12-28",
]);

export function isPublicHoliday(year: number, month: number, day: number): boolean {
  return NSW_PUBLIC_HOLIDAYS.has(ymd(year, month, day));
}

/**
 * Sunrise or sunset in local minutes after midnight, using the NOAA approximation (accurate to a minute or two).
 * Returns null in the (non-Australian) case of polar day or night.
 */
export function sunMinutes(kind: "sunrise" | "sunset", lat: number, lon: number, year: number, month: number, day: number): number | null {
  const rad = Math.PI / 180;
  const n = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86400000);
  const gamma = (2 * Math.PI / 365) * (n - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const cosHa = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  if (cosHa < -1 || cosHa > 1) return null;
  const ha = Math.acos(cosHa) / rad;
  const utcMinutes = kind === "sunrise" ? 720 - 4 * (lon + ha) - eqTime : 720 - 4 * (lon - ha) - eqTime;
  // Convert to local wall time using the offset at local noon that day.
  const noon = sydneyTime(year, month, day, 720);
  return Math.round(utcMinutes + offsetMinutes(noon));
}

export function formatClock(at: Date): string {
  const { minutes } = localParts(at);
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
}
