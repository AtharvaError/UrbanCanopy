/**
 * Stage 08: the places a heat action is actually carried out at.
 *
 *   in:  the city's boundaries file, OpenStreetMap
 *   out: places.geojson   one point per hospital, school, bus stop and market
 *                         inside an area, tagged with the area it falls in
 *
 * The planner's people-focused actions name kinds of place: water at markets
 * and bus stops, shade at school gates, outreach from the nearest clinic. This
 * puts those places on the map so the advice points at somewhere.
 *
 * Nothing here enters the score. Hospital distance already does, from stage 04;
 * this stage only draws the same hospitals, with the others, as a map layer.
 *
 * OpenStreetMap is as complete as its volunteers have made it. Bus stops and
 * markets in particular are under-mapped in most Indian cities, so a locality
 * with none drawn is not a locality with none.
 */

import { join } from "node:path";
import { cityFromArgv } from "./lib/city.mjs";
import { bboxOf, featureCollection, pointInGeometry, readJson, writeJson } from "./lib/geo.mjs";
import { overpass } from "./lib/overpass.mjs";

/** Each kind of place and the OpenStreetMap tags that mean it. */
const KINDS = [
  { kind: "hospital", matches: (t) => t.amenity === "hospital" },
  { kind: "school", matches: (t) => t.amenity === "school" },
  { kind: "bus_stop", matches: (t) => t.highway === "bus_stop" || t.amenity === "bus_station" },
  { kind: "market", matches: (t) => t.amenity === "marketplace" },
];

/** Five decimal places is about a metre, which is finer than a map pin. */
const round5 = (v) => Math.round(v * 1e5) / 1e5;

async function main() {
  const city = cityFromArgv();
  const areas = readJson(city.boundariesPath).features.map((f) => ({
    ward_id: String(f.properties[city.wardIdField]),
    geometry: f.geometry,
    bbox: bboxOf(f.geometry),
  }));
  const [west, south, east, north] = city.bbox;
  const box = `(${south},${west},${north},${east})`;

  const areaOf = (lon, lat) =>
    areas.find((a) => lon >= a.bbox[0] && lon <= a.bbox[2] && lat >= a.bbox[1] && lat <= a.bbox[3] && pointInGeometry(lon, lat, a.geometry))
      ?.ward_id ?? null;

  // One request for every kind: the public Overpass servers are shared, and
  // four requests in a row are four chances to be turned away.
  const payload = await overpass(
    `[out:json][timeout:120];(nwr["amenity"~"^(hospital|school|bus_station|marketplace)$"]${box};nwr["highway"="bus_stop"]${box};);out center;`,
  );

  const features = [];
  const counts = {};
  for (const { kind, matches } of KINDS) {
    const seen = new Set();
    for (const el of payload.elements ?? []) {
      if (!matches(el.tags ?? {})) continue;
      const lon = el.lon ?? el.center?.lon;
      const lat = el.lat ?? el.center?.lat;
      if (typeof lon !== "number" || typeof lat !== "number") continue;
      const wardId = areaOf(lon, lat);
      if (wardId === null) continue;
      // A stop mapped as both a node and a platform way lands on the same spot twice.
      const spot = `${round5(lon)},${round5(lat)}`;
      if (seen.has(spot)) continue;
      seen.add(spot);
      features.push({
        type: "Feature",
        properties: { kind, name: el.tags?.["name:en"] ?? el.tags?.name ?? null, ward_id: wardId },
        geometry: { type: "Point", coordinates: [round5(lon), round5(lat)] },
      });
    }
    counts[kind] = seen.size;
    console.log(`[ok] ${kind}: ${seen.size} inside the city's areas`);
  }

  writeJson(join(city.dataDir, "places.geojson"), {
    ...featureCollection("places", features),
    source: "OpenStreetMap contributors (ODbL), via Overpass",
    counts,
  });
  console.log(`[ok] wrote ${features.length} places -> ${join(city.dataDir, "places.geojson")}`);

  const empty = Object.entries(counts).filter(([, n]) => n === 0).map(([k]) => k);
  if (empty.length) {
    console.log(`[WARN] no ${empty.join(", ")} mapped inside the city: that layer will be empty`);
    process.exitCode = 2;
  } else {
    console.log("\nGO");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
