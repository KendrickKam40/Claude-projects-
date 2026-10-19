// Pulls every OpenStreetMap dog park in NSW into Supabase. Run weekly by .github/workflows/sniffari-import.yml.
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Add --dry-run to print what would be sent.

import { OVERPASS_QUERY, projectBase, toRow, type OsmElement } from "./osm.ts";

const dry = process.argv.includes("--dry-run");
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dry && (!url || !key)) {
  // A GitHub Actions warning annotation, so a run that imported nothing doesn't pass unnoticed.
  console.log("::warning::SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (add the SNIFFARI_* repository secrets): nothing imported.");
  process.exit(0);
}

const res = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Sniffari importer (github.com/kendrickkam40/claude-projects-)" },
  body: "data=" + encodeURIComponent(OVERPASS_QUERY),
});
if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
const { elements } = (await res.json()) as { elements: OsmElement[] };
const today = new Date().toISOString().slice(0, 10);
const rows = elements.map((e) => toRow(e, today)).filter((r) => r !== null);
console.log(`OpenStreetMap: ${elements.length} dog parks and dog-friendly venues, ${rows.length} usable.`);
if (rows.length < 20) throw new Error("Suspiciously few dog parks; not importing so nothing gets removed by mistake.");

if (dry) {
  console.log(JSON.stringify(rows.slice(0, 3), null, 2));
  process.exit(0);
}

const rpc = await fetch(`${projectBase(url!)}/rest/v1/rpc/import_places`, {
  method: "POST",
  // Legacy service_role keys are JWTs and go in both headers; newer sb_secret_ keys go in apikey only.
  headers: { apikey: key!, ...(key!.startsWith("eyJ") ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" },
  body: JSON.stringify({ rows, source: "osm" }),
});
if (!rpc.ok) throw new Error(`Supabase ${rpc.status}: ${await rpc.text()}`);
console.log("Imported:", await rpc.json());
