import type { Evaluation } from "../domain/rules";
import type { Place } from "../domain/types";

export interface ResultRow {
  place: Place;
  ev: Evaluation;
  distanceKm: number;
}
