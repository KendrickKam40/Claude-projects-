import { describe, expect, it } from "vitest";
import { decodePlan, driveEstimate, encodePlan, EXAMPLE_PLAN, routeUrl, schedule, type Plan } from "./plan";
import { SEED_PLACES } from "../data/seed";
import { formatClock } from "../domain/time";

const byId = new Map(SEED_PLACES.map((p) => [p.id, p]));

describe("day-out planner", () => {
  it("estimates drives sensibly", () => {
    expect(driveEstimate(0).min).toBe(5);
    const mtWilson = driveEstimate(55); // Kellyville to Mt Wilson as the crow flies
    expect(mtWilson.min).toBeGreaterThan(60);
    expect(mtWilson.min).toBeLessThan(90);
  });

  it("schedules the example day in order, back home in the afternoon", () => {
    const s = schedule(EXAMPLE_PLAN, byId);
    expect(s.stops.map((x) => x.place.id)).toEqual(["bellbird-lookout", "windyridge-garden", "hillbilly-cider"]);
    expect(s.missing).toEqual([]);
    for (let i = 1; i < s.stops.length; i++) expect(s.stops[i]!.arrive > s.stops[i - 1]!.leave).toBe(true);
    const home = Number(formatClock(s.home!.arrive).replace(/[^\d].*$/, ""));
    expect(home).toBeGreaterThanOrEqual(2);
    expect(home).toBeLessThanOrEqual(5);
  });

  it("warns when dogs aren't allowed on arrival or the rules change mid-visit", () => {
    const plan: Plan = { title: "t", start: "2026-10-24T08:00", from: { label: "x", lat: -33.83, lon: 151.24 }, stops: [
      { placeId: "sirius-cove", stayMin: 90 }, // Saturday: off-leash until 9am, arrive ~8:10
      { placeId: "lane-cove-np", stayMin: 60 },
    ] };
    const s = schedule(plan, byId);
    expect(s.stops[0]!.status).toBe("off_leash");
    expect(s.stops[0]!.warnings.join(" ")).toMatch(/Changes to on lead at 9am/);
    expect(s.stops[1]!.warnings[0]).toContain("No dogs");
  });

  it("skips stops that no longer exist", () => {
    const s = schedule({ ...EXAMPLE_PLAN, stops: [{ placeId: "gone", stayMin: 30 }, ...EXAMPLE_PLAN.stops] }, byId);
    expect(s.missing).toEqual(["gone"]);
    expect(s.stops).toHaveLength(3);
  });

  it("round-trips through a share link and rejects junk", () => {
    const p = { ...EXAMPLE_PLAN, title: "Ann's 🐶 day" };
    expect(decodePlan(encodePlan(p))).toEqual(p);
    expect(decodePlan("not-a-plan")).toBeNull();
    expect(decodePlan(encodePlan({ ...p, start: "tomorrow" } as Plan))).toBeNull();
  });

  it("builds a Google Maps route through each stop", () => {
    const u = new URL(routeUrl(EXAMPLE_PLAN, byId));
    expect(u.searchParams.get("waypoints")!.split("|")).toHaveLength(3);
  });
});
