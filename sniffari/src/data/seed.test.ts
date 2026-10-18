import { describe, expect, it } from "vitest";
import { evaluate } from "../domain/rules";
import { SEED_PLACES } from "./seed";

const TIME = /^(sunrise|sunset|([01]\d|2[0-3]):[0-5]\d)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("seed data quality", () => {
  it("has unique ids", () => {
    const ids = SEED_PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const p of SEED_PLACES) {
    it(`${p.name} is well formed`, () => {
      expect(p.lat).toBeGreaterThan(-37.6);
      expect(p.lat).toBeLessThan(-28);
      expect(p.lon).toBeGreaterThan(140.9);
      expect(p.lon).toBeLessThan(153.7);
      // Every status shown must be traceable to a source with a check date.
      const sources = [p.defaultSource, ...p.rules.map((r) => r.source)].filter(Boolean);
      expect(p.defaultSource ?? p.rules.length).toBeTruthy();
      for (const s of sources) {
        expect(s!.url).toMatch(/^https:\/\//);
        expect(s!.checked).toMatch(DATE);
      }
      for (const r of p.rules) {
        if (r.window) {
          expect(r.window.from).toMatch(TIME);
          expect(r.window.to).toMatch(TIME);
        }
      }
      expect(() => evaluate(p, new Date("2026-10-18T00:00:00Z"))).not.toThrow();
    });
  }
});
