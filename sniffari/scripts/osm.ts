// Turns OpenStreetMap dog parks (leisure=dog_park) into Sniffari places. Pure, so it's tested without the network.

import type { Region, Source } from "../src/domain/types.ts";

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface ImportRow {
  id: string;
  originRef: string;
  name: string;
  kind: "off_leash_park";
  region: Region;
  area: string;
  address: string | null;
  lat: number;
  lon: number;
  defaultStatus: "off_leash" | "on_lead";
  defaultSource: Source;
  features: Record<string, unknown>;
  notes: string[];
}

/** Rough Sydney regions by position, matching the hand-entered places. Outside Greater Sydney is "regional". */
export function regionFor(lat: number, lon: number): Region {
  const inSydney = lat > -34.2 && lat < -33.4 && lon > 150.5 && lon < 151.4;
  if (!inSydney) return "regional";
  if (lat < -33.94) return "south";
  if (lat > -33.86 && lon > 151.1) return "north";
  if (lon > 151.17 && lat > -33.92 && lat < -33.86) return lon < 151.22 ? "city" : "east_inner_west";
  if (lon > 151.08 && lat <= -33.86) return "east_inner_west";
  return "hills_nw";
}

export function toRow(el: OsmElement, checked: string): ImportRow | null {
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const t = el.tags ?? {};
  if (t.access === "private" || t.access === "no") return null;
  const suburb = t["addr:suburb"] ?? t["addr:city"];
  const name = t.name ?? (suburb ? `${suburb} dog park` : "Off-leash dog area");
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const notes = ["Mapped by OpenStreetMap volunteers. Signs at the park win if they differ."];
  if (t.opening_hours) notes.push(`Mapped hours: ${t.opening_hours}`);
  if (!t.name) notes.push("No name on the map yet.");
  const leashed = t.dog === "leashed";
  return {
    id: `osm-${el.type}-${el.id}`,
    originRef: `${el.type}/${el.id}`,
    name,
    kind: "off_leash_park",
    region: regionFor(lat, lon),
    area: t.operator ?? "Local council",
    address: [street, suburb].filter(Boolean).join(", ") || null,
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
    defaultStatus: leashed ? "on_lead" : "off_leash",
    defaultSource: { name: "OpenStreetMap contributors", url: `https://www.openstreetmap.org/${el.type}/${el.id}`, checked, kind: "community" },
    features: {
      ...(t.barrier === "fence" || t.fence === "yes" ? { fenced: "full" } : {}),
      ...(t.drinking_water === "yes" ? { water: true } : {}),
      ...(t.lit === "yes" ? { lit: true } : {}),
      ...(t.small_dogs === "yes" || t.dog_park === "small" ? { smallDogArea: true } : {}),
    },
    notes,
  };
}

/** Every leisure=dog_park in NSW, with a centre point for areas. */
export const OVERPASS_QUERY = `[out:json][timeout:180];
area["ISO3166-2"="AU-NSW"][admin_level=4]->.nsw;
nwr["leisure"="dog_park"](area.nsw);
out center tags;`;
