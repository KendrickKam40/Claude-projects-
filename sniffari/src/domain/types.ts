// Core domain types for Sniffari. Shared by the UI, the rules engine, the data layer and the importers.

/** What a dog may do at a place at a given moment. */
export type DogStatus = "off_leash" | "on_lead" | "no_dogs";

/** 0 = Sunday … 6 = Saturday, or "PH" for NSW public holidays. */
export type DayToken = 0 | 1 | 2 | 3 | 4 | 5 | 6 | "PH";

/** A local (Sydney) clock time "HH:MM", or the sun at this place. */
export type ClockTime = string | "sunrise" | "sunset";

export interface TimeWindow {
  from: ClockTime;
  /** May be earlier than `from` to span midnight, e.g. 16:30 → 08:30. */
  to: ClockTime;
}

/** Seasonal limits: a fixed date range ("MM-DD"), or NSW daylight saving / standard time. */
export type Season = { from: string; to: string } | "daylight_saving" | "standard_time";

export type SourceKind = "official" | "community" | "guide";

export interface Source {
  name: string;
  url: string;
  /** When someone last checked the source said this, "YYYY-MM-DD". */
  checked: string;
  kind: SourceKind;
}

/**
 * A rule says what applies, and when. Fields left out mean "always".
 * When several rules match, the most specific one wins (see rules.ts).
 */
export interface Rule {
  id: string;
  status: DogStatus;
  days?: DayToken[];
  window?: TimeWindow;
  season?: Season;
  /** Overrides the automatic specificity ranking when rules overlap. */
  priority?: number;
  /** Plain-language detail shown with the rule, e.g. "east of the jetty only". */
  note?: string;
  source: Source;
}

export type PlaceKind =
  | "off_leash_park"
  | "beach"
  | "walk"
  | "regional_park"
  | "state_forest"
  | "garden"
  | "cafe"
  | "lookout"
  | "national_park";

export type Fencing = "full" | "partial" | "none";

export interface PlaceFeatures {
  fenced?: Fencing;
  smallDogArea?: boolean;
  water?: boolean;
  shade?: boolean;
  toilets?: boolean;
  parking?: boolean;
  swimming?: boolean;
  flatPaths?: boolean;
}

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  /** Council or land manager, e.g. "Northern Beaches Council", "NSW NPWS". */
  area: string;
  region: Region;
  address?: string;
  /** True until someone has checked the pin on a map. */
  approximateLocation?: boolean;
  /** What applies when no rule matches (often "on_lead" for a council park). */
  defaultStatus: DogStatus;
  /** Source for the default status, when it differs from the rules' sources. */
  defaultSource?: Source;
  rules: Rule[];
  features: PlaceFeatures;
  /** Short, practical notes ("Small-dog area by the car park"). */
  notes?: string[];
  hazards?: string[];
}

export type Region = "hills_nw" | "north" | "east_inner_west" | "south" | "city" | "regional";

export const REGION_LABEL: Record<Region, string> = {
  hills_nw: "Hills & north-west",
  north: "Northern Beaches & North Shore",
  east_inner_west: "Eastern Suburbs & Inner West",
  south: "South Sydney & Sutherland",
  city: "City of Sydney",
  regional: "Day trips",
};

export const KIND_LABEL: Record<PlaceKind, string> = {
  off_leash_park: "Off-leash park",
  beach: "Beach",
  walk: "Walk",
  regional_park: "Regional park",
  state_forest: "State forest",
  garden: "Garden",
  cafe: "Café",
  lookout: "Lookout",
  national_park: "National park",
};

export const STATUS_LABEL: Record<DogStatus, string> = {
  off_leash: "Off-leash",
  on_lead: "On lead",
  no_dogs: "No dogs",
};
