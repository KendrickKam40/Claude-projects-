// Turns OpenStreetMap dog parks (leisure=dog_park) and dog-friendly cafés, restaurants and pubs (dog=yes|leashed|outside)
// into Sniffari places. Pure, so it's tested without the network.

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
  kind: "off_leash_park" | "cafe" | "restaurant" | "pub";
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

const VENUE_KIND: Record<string, ImportRow["kind"]> = {
  cafe: "cafe", ice_cream: "cafe", restaurant: "restaurant", fast_food: "restaurant", pub: "pub", bar: "pub", biergarten: "pub",
};

export function toRow(el: OsmElement, checked: string): ImportRow | null {
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const t = el.tags ?? {};
  if (t.access === "private" || t.access === "no") return null;
  const venueKind = t.amenity ? VENUE_KIND[t.amenity] : undefined;
  if (venueKind) return venueRow(el, t, venueKind, lat, lon, checked);
  if (t.leisure !== "dog_park") return null;
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

/** A café, restaurant or pub that OSM volunteers have marked as welcoming dogs. Unnamed ones are skipped. */
function venueRow(el: OsmElement, t: Record<string, string>, kind: ImportRow["kind"], lat: number, lon: number, checked: string): ImportRow | null {
  if (!t.name || !["yes", "leashed", "outside"].includes(t.dog ?? "")) return null;
  const suburb = t["addr:suburb"] ?? t["addr:city"];
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const notes = ["Marked dog-friendly by OpenStreetMap volunteers. Worth a quick call to check."];
  if (t.dog === "outside") notes.push("Dogs in the outdoor area only.");
  if (t.outdoor_seating === "yes") notes.push("Has outdoor seating.");
  if (t.opening_hours) notes.push(`Mapped hours: ${t.opening_hours}`);
  return {
    id: `osm-${el.type}-${el.id}`,
    originRef: `${el.type}/${el.id}`,
    name: t.name,
    kind,
    region: regionFor(lat, lon),
    area: suburb ?? "Dog-friendly venue",
    address: [street, suburb].filter(Boolean).join(", ") || null,
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
    defaultStatus: "on_lead",
    defaultSource: { name: "OpenStreetMap contributors", url: `https://www.openstreetmap.org/${el.type}/${el.id}`, checked, kind: "community" },
    features: t.drinking_water === "yes" ? { water: true } : {},
    notes,
  };
}

/** Every dog park, and every café, restaurant and pub marked as dog-friendly, in NSW. Areas come back with a centre point. */
export const OVERPASS_QUERY = `[out:json][timeout:180];
area["ISO3166-2"="AU-NSW"][admin_level=4]->.nsw;
(
  nwr["leisure"="dog_park"](area.nsw);
  nwr["amenity"~"^(cafe|ice_cream|restaurant|fast_food|pub|bar|biergarten)$"]["dog"~"^(yes|leashed|outside)$"](area.nsw);
);
out center tags;`;

/** The Supabase project URL as pasted from the dashboard may end in "/", "/rest/v1" or "/rest/v1/"; reduce it to the
 *  project's base URL so the importer builds the right API path. */
export function projectBase(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "").replace(/\/+$/, "");
}
