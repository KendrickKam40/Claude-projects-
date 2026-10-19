import { describe, expect, it } from "vitest";
import { projectBase, regionFor, toRow } from "./osm";
import { SEED_PLACES } from "../src/data/seed";

describe("OSM import", () => {
  it("maps a fenced, named dog park", () => {
    const r = toRow({ type: "way", id: 42, center: { lat: -33.70123456, lon: 150.93 }, tags: { leisure: "dog_park", name: "Test Park", barrier: "fence", "addr:suburb": "Kellyville", operator: "The Hills Shire Council" } }, "2026-10-18")!;
    expect(r).toMatchObject({ id: "osm-way-42", originRef: "way/42", name: "Test Park", region: "hills_nw", area: "The Hills Shire Council", address: "Kellyville", defaultStatus: "off_leash", features: { fenced: "full" }, lat: -33.701235 });
    expect(r.defaultSource).toMatchObject({ kind: "community", url: "https://www.openstreetmap.org/way/42", checked: "2026-10-18" });
  });
  it("names unnamed parks by suburb and skips private ones and ones without a position", () => {
    expect(toRow({ type: "node", id: 1, lat: -33.9, lon: 151.2, tags: { leisure: "dog_park", "addr:suburb": "Erskineville" } }, "2026-10-18")!.name).toBe("Erskineville dog park");
    expect(toRow({ type: "node", id: 2, lat: -33.9, lon: 151.2, tags: { leisure: "dog_park", access: "private" } }, "2026-10-18")).toBeNull();
    expect(toRow({ type: "way", id: 3, tags: {} }, "2026-10-18")).toBeNull();
  });
  it("maps dog-friendly venues and skips unnamed or dogs-not-allowed ones", () => {
    const pub = toRow({ type: "node", id: 7, lat: -33.89, lon: 151.18, tags: { amenity: "pub", name: "The Dog & Bone", dog: "outside", "addr:suburb": "Newtown" } }, "2026-10-19")!;
    expect(pub).toMatchObject({ kind: "pub", defaultStatus: "on_lead", area: "Newtown", name: "The Dog & Bone" });
    expect(pub.notes.join(" ")).toContain("outdoor area only");
    expect(toRow({ type: "node", id: 8, lat: -33.89, lon: 151.18, tags: { amenity: "cafe", name: "No Dogs Café", dog: "no" } }, "2026-10-19")).toBeNull();
    expect(toRow({ type: "node", id: 9, lat: -33.89, lon: 151.18, tags: { amenity: "cafe", dog: "yes" } }, "2026-10-19")).toBeNull();
    expect(toRow({ type: "node", id: 10, lat: -33.89, lon: 151.18, tags: { amenity: "cafe", name: "Plain Café" } }, "2026-10-19")).toBeNull();
  });
  it("puts places in the same regions as the hand-checked ones", () => {
    const wrong = SEED_PLACES.filter((p) => regionFor(p.lat, p.lon) !== p.region).map((p) => `${p.id}: ${p.region} vs ${regionFor(p.lat, p.lon)}`);
    expect(wrong.length, wrong.join("\n")).toBeLessThanOrEqual(3);
  });
  it("accepts the project URL with or without a trailing slash or /rest/v1", () => {
    for (const u of ["https://abc.supabase.co", "https://abc.supabase.co/", "https://abc.supabase.co/rest/v1", " https://abc.supabase.co/rest/v1/ "])
      expect(projectBase(u)).toBe("https://abc.supabase.co");
  });
});
