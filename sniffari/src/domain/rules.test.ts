import { describe as group, expect, it } from "vitest";
import { daySegments, describe, evaluate, statusAt } from "./rules";
import { formatClock, isDaylightSaving, localParts, sunMinutes, sydneyTime } from "./time";
import type { Place, Rule } from "./types";

const src = { name: "Test council", url: "https://example.org", checked: "2026-10-17", kind: "official" as const };
const rule = (r: Omit<Rule, "source" | "id"> & { id?: string }): Rule => ({ id: r.id ?? Math.random().toString(36), source: src, ...r });
const place = (rules: Rule[], extra: Partial<Place> = {}): Place => ({
  id: "p", name: "Test", kind: "beach", lat: -33.84, lon: 151.24, area: "Test", region: "north",
  defaultStatus: "on_lead", rules, features: {}, ...extra,
});
const at = (y: number, mo: number, d: number, h: number, mi = 0) => sydneyTime(y, mo, d, h * 60 + mi);

// Like Sirius Cove: off-leash all day on weekdays; weekends and public holidays only before 9am and after 4pm.
const timeShare = place([
  rule({ status: "off_leash", days: [1, 2, 3, 4, 5] }),
  rule({ status: "off_leash", days: [0, 6, "PH"], window: { from: "16:00", to: "09:00" } }),
]);

group("Sydney time helpers", () => {
  it("round-trips a wall-clock time", () => {
    const t = at(2026, 10, 18, 9, 30);
    const p = localParts(t);
    expect([p.year, p.month, p.day, p.minutes, p.weekday]).toEqual([2026, 10, 18, 570, 0]);
  });
  it("knows daylight saving", () => {
    expect(isDaylightSaving(at(2026, 10, 18, 12))).toBe(true);
    expect(isDaylightSaving(at(2026, 7, 1, 12))).toBe(false);
  });
  it("formats clock times", () => {
    expect(formatClock(at(2026, 10, 18, 16))).toBe("4pm");
    expect(formatClock(at(2026, 10, 18, 8, 30))).toBe("8:30am");
  });
  it("puts Sydney sunrise and sunset in the right place in mid October (AEDT)", () => {
    // Solar noon is about 12:41pm AEDT and the day about 13h long, so sunrise ≈ 6:10am and sunset ≈ 7:10pm.
    const rise = sunMinutes("sunrise", -33.87, 151.21, 2026, 10, 18)!;
    const set = sunMinutes("sunset", -33.87, 151.21, 2026, 10, 18)!;
    expect(rise).toBeGreaterThan(6 * 60);
    expect(rise).toBeLessThan(6 * 60 + 20);
    expect(set).toBeGreaterThan(19 * 60);
    expect(set).toBeLessThan(19 * 60 + 25);
  });
});

group("statusAt", () => {
  it("uses the default when nothing matches", () => {
    expect(statusAt(place([]), at(2026, 10, 18, 10)).status).toBe("on_lead");
  });
  it("time-share beach on a Saturday morning and midday", () => {
    expect(statusAt(timeShare, at(2026, 10, 17, 7)).status).toBe("off_leash");
    expect(statusAt(timeShare, at(2026, 10, 17, 12)).status).toBe("on_lead");
    expect(statusAt(timeShare, at(2026, 10, 17, 17)).status).toBe("off_leash");
  });
  it("weekday rule applies on an ordinary Monday", () => {
    expect(statusAt(timeShare, at(2026, 10, 19, 12)).status).toBe("off_leash");
  });
  it("weekday rule does not apply on a public holiday (Mon 28 Dec 2026)", () => {
    expect(statusAt(timeShare, at(2026, 12, 28, 12)).status).toBe("on_lead");
    expect(statusAt(timeShare, at(2026, 12, 28, 7)).status).toBe("off_leash");
  });
  it("a more specific rule beats a general one", () => {
    const p = place([
      rule({ status: "off_leash" }),
      rule({ status: "no_dogs", window: { from: "10:00", to: "16:00" }, season: { from: "12-01", to: "02-28" } }),
    ]);
    expect(statusAt(p, at(2027, 1, 10, 12)).status).toBe("no_dogs");
    expect(statusAt(p, at(2027, 1, 10, 17)).status).toBe("off_leash");
    expect(statusAt(p, at(2026, 10, 18, 12)).status).toBe("off_leash");
  });
  it("seasonal windows follow daylight saving", () => {
    const p = place([
      rule({ status: "off_leash", season: "daylight_saving", window: { from: "16:00", to: "19:00" } }),
      rule({ status: "off_leash", season: "standard_time", window: { from: "15:00", to: "17:00" } }),
    ]);
    expect(statusAt(p, at(2026, 10, 18, 18)).status).toBe("off_leash");
    expect(statusAt(p, at(2026, 7, 18, 18)).status).toBe("on_lead");
    expect(statusAt(p, at(2026, 7, 18, 15, 30)).status).toBe("off_leash");
  });
  it("sunrise windows use the place's own sunrise", () => {
    const p = place([rule({ status: "off_leash", window: { from: "sunrise", to: "09:30" } })]);
    expect(statusAt(p, at(2026, 10, 18, 5)).status).toBe("on_lead");
    expect(statusAt(p, at(2026, 10, 18, 7)).status).toBe("off_leash");
    expect(statusAt(p, at(2026, 10, 18, 9, 45)).status).toBe("on_lead");
  });
  it("explicit priority wins", () => {
    const p = place([
      rule({ status: "off_leash", window: { from: "06:00", to: "20:00" } }),
      rule({ status: "no_dogs", priority: 5, note: "Closed for works" }),
    ]);
    expect(statusAt(p, at(2026, 10, 18, 12)).status).toBe("no_dogs");
  });
});

group("evaluate and describe", () => {
  it("finds when a Saturday on-lead period ends", () => {
    const now = at(2026, 10, 17, 12);
    const ev = evaluate(timeShare, now);
    expect(ev.status).toBe("on_lead");
    expect(ev.next?.status).toBe("off_leash");
    expect(formatClock(ev.next!.at)).toBe("4pm");
    expect(describe(ev, now)).toBe("On lead now · off-leash from 4pm");
  });
  it("describes an off-leash window ending", () => {
    const now = at(2026, 10, 17, 7);
    expect(describe(evaluate(timeShare, now), now)).toBe("Off-leash now · until 9am");
  });
  it("says tomorrow when the change is the next day", () => {
    const p = place([rule({ status: "off_leash", window: { from: "06:00", to: "08:00" } })]);
    const now = at(2026, 10, 18, 20);
    expect(describe(evaluate(p, now), now)).toBe("On lead now · off-leash from 6am tomorrow");
  });
  it("has no next change for an all-hours place", () => {
    const ev = evaluate(place([rule({ status: "off_leash" })]));
    expect(ev.next).toBeNull();
    expect(describe(ev)).toBe("Off-leash now");
  });
  it("handles no-dogs places", () => {
    const np = place([], { defaultStatus: "no_dogs", kind: "national_park" });
    expect(describe(evaluate(np))).toBe("No dogs now");
  });
});

group("daySegments", () => {
  it("covers the whole day and merges equal neighbours", () => {
    const segs = daySegments(timeShare, at(2026, 10, 17, 12));
    expect(segs.map((s) => s.status)).toEqual(["off_leash", "on_lead", "off_leash"]);
    expect(formatClock(segs[1]!.from)).toBe("9am");
    expect(formatClock(segs[1]!.to)).toBe("4pm");
    expect(segs[segs.length - 1]!.to.getTime() - segs[0]!.from.getTime()).toBe(24 * 3600 * 1000);
  });
});
