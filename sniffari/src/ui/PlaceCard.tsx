import { describe } from "../domain/rules";
import { KIND_LABEL } from "../domain/types";
import { formatDistance } from "../domain/geo";
import { freshness } from "../app/logic";
import { KindIcon } from "./Icons";
import type { ResultRow } from "./types";

export function featureBadges(p: ResultRow["place"]): string[] {
  const f = p.features, out: string[] = [];
  if (f.fenced === "full") out.push("Fully fenced");
  else if (f.fenced === "partial") out.push("Partly fenced");
  if (f.smallDogArea) out.push("Small-dog area");
  if (f.swimming) out.push("Swimming");
  if (f.water) out.push("Water");
  if (f.shade) out.push("Shade");
  if (f.toilets) out.push("Toilets");
  return out;
}

export default function PlaceCard({ row, at, when, onOpen }: { row: ResultRow; at: Date; when: string; onOpen: () => void }) {
  const { place, ev, distanceKm } = row;
  return (
    <button type="button" className="card" onClick={onOpen}>
      <span className="kindicon"><KindIcon kind={place.kind} /></span>
      <span>
        <h3>{place.name}</h3>
        <p className="meta">{KIND_LABEL[place.kind]} · {place.area} · {formatDistance(distanceKm)}</p>
        <span className={`status ${ev.status}`}>{describe(ev, at, when)}</span>
        {featureBadges(place).length > 0 && (
          <span className="badges">{featureBadges(place).map((b) => <span key={b} className="badge">{b}</span>)}</span>
        )}
        <span className="fresh" style={{ display: "block" }}>{freshness(place)}</span>
      </span>
    </button>
  );
}
