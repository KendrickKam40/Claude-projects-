import { describe, expect, it } from "vitest";
import { compareResults, directionsUrl, freshness, googleListingUrl, isReactiveFriendly, passes, resolveWhen, ruleWhen, whenWord, NO_FILTERS } from "./logic";
import { evaluate } from "../domain/rules";
import { formatClock, localParts, sydneyTime } from "../domain/time";
import { SEED_PLACES } from "../data/seed";

const byId = (id: string) => SEED_PLACES.find((p) => p.id === id)!;

describe("resolveWhen", () => {
  const sat9 = sydneyTime(2026, 10, 17, 9 * 60); // Saturday 9am
  it("now is now", () => expect(resolveWhen("now", undefined, sat9)).toEqual(sat9));
  it("this arvo is 3pm today", () => expect(formatClock(resolveWhen("arvo", undefined, sat9))).toBe("3pm"));
  it("tomorrow is 7am tomorrow", () => {
    const t = resolveWhen("tomorrow", undefined, sat9);
    expect(formatClock(t)).toBe("7am");
    expect(localParts(t).day).toBe(18);
  });
  it("Saturday 8am skips to next week once it's past", () => {
    const t = resolveWhen("weekend", undefined, sat9);
    expect(localParts(t).day).toBe(24);
  });
  it("Saturday 8am is today when it's still early Saturday", () => {
    const t = resolveWhen("weekend", undefined, sydneyTime(2026, 10, 17, 6 * 60));
    expect(localParts(t).day).toBe(17);
  });
  it("tonight falls back to now when it's already late", () => {
    const late = sydneyTime(2026, 10, 17, 21 * 60);
    expect(resolveWhen("tonight", undefined, late)).toEqual(late);
  });
  it("custom times are read as Sydney time", () => {
    expect(formatClock(resolveWhen("custom", "2026-10-25T16:30", sat9))).toBe("4:30pm");
  });
});

describe("filters", () => {
  const sat12 = sydneyTime(2026, 10, 17, 12 * 60);
  it("off-leash now excludes Sirius Cove at Saturday midday", () => {
    const p = byId("sirius-cove");
    expect(passes(p, evaluate(p, sat12), { ...NO_FILTERS, offLeash: true }, new Set())).toBe(false);
  });
  it("fenced includes fenced parks only", () => {
    const fenced = byId("coolong-reserve"), beach = byId("sirius-cove");
    const f = { ...NO_FILTERS, fenced: true };
    expect(passes(fenced, evaluate(fenced, sat12), f, new Set())).toBe(true);
    expect(passes(beach, evaluate(beach, sat12), f, new Set())).toBe(false);
  });
  it("reactive-friendly includes small-dog areas", () => {
    expect(isReactiveFriendly(byId("indwarra-reserve"))).toBe(true);
    expect(isReactiveFriendly(byId("marks-park"))).toBe(false);
  });
  it("sorts no-dogs places last", () => {
    const np = { ev: evaluate(byId("lane-cove-np")), distanceKm: 1 };
    const park = { ev: evaluate(byId("coolong-reserve")), distanceKm: 20 };
    expect([np, park].sort(compareResults)[0]).toBe(park);
  });
});

describe("Google Maps links", () => {
  it("searches by name and address, and pins the exact listing once a place ID is known", () => {
    const p = byId("sirius-cove");
    const u = new URL(googleListingUrl(p));
    expect(u.searchParams.get("query")).toContain("Sirius Cove");
    expect(u.searchParams.get("query_place_id")).toBeNull();
    const withId = new URL(googleListingUrl({ ...p, googlePlaceId: "ChIJabc" }));
    expect(withId.searchParams.get("query_place_id")).toBe("ChIJabc");
    expect(new URL(directionsUrl({ ...p, googlePlaceId: "ChIJabc" })).searchParams.get("destination_place_id")).toBe("ChIJabc");
  });
});

describe("freshness", () => {
  it("says when only a guide backs a place", () => {
    expect(freshness(byId("silver-beach-west"))).toContain("local guide");
    expect(freshness(byId("sirius-cove"))).toContain("official source");
  });
});

describe("ruleWhen", () => {
  const src = { name: "x", url: "https://x", checked: "2026-10-17", kind: "official" as const };
  it("names common day sets and windows", () => {
    expect(ruleWhen({ id: "a", status: "off_leash", days: [0, 6, "PH"], window: { from: "16:00", to: "09:00" }, source: src })).toBe("Weekends & public holidays · 4pm–9am");
    expect(ruleWhen({ id: "b", status: "off_leash", days: [1, 2, 3, 4, 5], source: src })).toBe("Weekdays");
    expect(ruleWhen({ id: "c", status: "off_leash", window: { from: "05:00", to: "22:00" }, season: "daylight_saving", source: src })).toBe("5am–10pm · during daylight saving");
    expect(ruleWhen({ id: "d", status: "on_lead", source: src })).toBe("Any time");
  });
});

describe("whenWord", () => {
  const sat9 = sydneyTime(2026, 10, 17, 9 * 60);
  it("is 'now' for now, a time later today, a day otherwise", () => {
    expect(whenWord("now", sat9, sat9)).toBe("now");
    expect(whenWord("arvo", sydneyTime(2026, 10, 17, 15 * 60), sat9)).toBe("at 3pm");
    expect(whenWord("tomorrow", sydneyTime(2026, 10, 18, 7 * 60), sat9)).toBe("Sun 7am");
  });
});
