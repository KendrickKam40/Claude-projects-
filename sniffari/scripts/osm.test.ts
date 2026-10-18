import { describe, expect, it } from "vitest";
import { regionFor, toRow } from "./osm";
import { SEED_PLACES } from "../src/data/seed";

describe("OSM import", () => {
  it("maps a fenced, named dog park", () => {
    const r = toRow({ type: "way", id: 42, center: { lat: -33.70123456, lon: 150.93 }, tags: { leisure: "dog_park", name: "Test Park", barrier: "fence", "addr:suburb": "Kellyville", operator: "The Hills Shire Council" } }, "2026-10-18")!;
    expect(r).toMatchObject({ id: "osm-way-42", originRef: "way/42", name: "Test Park", region: "hills_nw", area: "The Hills Shire Council", address: "Kellyville", defaultStatus: "off_leash", features: { fenced: "full" }, lat: -33.701235 });
    expect(r.defaultSource).toMatchObject({ kind: "community", url: "https://www.openstreetmap.org/way/42", checked: "2026-10-18" });
  });
  it("names unnamed parks by suburb and skips private ones and ones without a position", () => {
    expect(toRow({ type: "node", id: 1, lat: -33.9, lon: 151.2, tags: { "addr:suburb": "Erskineville" } }, "2026-10-18")!.name).toBe("Erskineville dog park");
    expect(toRow({ type: "node", id: 2, lat: -33.9, lon: 151.2, tags: { access: "private" } }, "2026-10-18")).toBeNull();
    expect(toRow({ type: "way", id: 3, tags: {} }, "2026-10-18")).toBeNull();
  });
  it("puts places in the same regions as the hand-checked ones", () => {
    const wrong = SEED_PLACES.filter((p) => regionFor(p.lat, p.lon) !== p.region).map((p) => `${p.id}: ${p.region} vs ${regionFor(p.lat, p.lon)}`);
    expect(wrong.length, wrong.join("\n")).toBeLessThanOrEqual(3);
  });
});
