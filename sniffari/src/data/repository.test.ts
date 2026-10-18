import { describe, expect, it } from "vitest";
import row from "./fixtures/nearby-row-sirius-cove.json";
import { placeFromRow, summarise, type Report } from "./repository";
import { SEED_PLACES } from "./seed";
import { describe as describeStatus, evaluate } from "../domain/rules";
import { sydneyTime } from "../domain/time";

describe("placeFromRow (real nearby_places output from the local test database)", () => {
  const place = placeFromRow(row as never);
  const seed = SEED_PLACES.find((p) => p.id === "sirius-cove")!;

  it("keeps the fields the app needs", () => {
    expect(place.name).toBe(seed.name);
    expect(place.defaultStatus).toBe(seed.defaultStatus);
    expect(place.lat).toBeCloseTo(seed.lat, 5);
    expect(place.lon).toBeCloseTo(seed.lon, 5);
    expect(place.rules).toHaveLength(seed.rules.length);
  });

  it("gives the same answers as the bundled data", () => {
    for (const t of [sydneyTime(2026, 10, 17, 12 * 60), sydneyTime(2026, 10, 19, 12 * 60), sydneyTime(2026, 12, 28, 7 * 60)]) {
      expect(describeStatus(evaluate(place, t), t)).toBe(describeStatus(evaluate(seed, t), t));
    }
  });
});

describe("summarise (on-device reports)", () => {
  it("counts confirmations and flags in the last 90 days and buckets quiet/busy by Sydney hour", () => {
    const now = Date.parse("2026-10-18T00:00:00Z");
    const reports: Report[] = [
      { kind: "confirm", createdAt: "2026-10-17T22:00:00Z" },
      { kind: "confirm", createdAt: "2026-05-01T00:00:00Z" },
      { kind: "flag", createdAt: "2026-10-10T00:00:00Z", note: "Sign says on lead" },
      { kind: "quiet", createdAt: "2026-10-17T21:30:00Z" }, // Sun 8:30am Sydney
      { kind: "quiet", createdAt: "2026-10-17T21:45:00Z" },
    ];
    const s = summarise(reports, now);
    expect(s.confirms90d).toBe(1);
    expect(s.flags90d).toBe(1);
    expect(s.lastConfirmed).toBe("2026-10-17T22:00:00Z");
    expect(s.crowd).toEqual([{ dow: 0, hour: 8, quiet: 2, busy: 0 }]);
  });
});
