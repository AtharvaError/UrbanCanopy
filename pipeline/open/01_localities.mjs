/**
 * Stage 01 (open build): approximate locality boundaries for a city with no
 * open ward map.
 *
 * Why this exists:
 *   The index ranks areas, and until now it was handed them: Datameet publishes
 *   Mumbai's 24 BMC wards and Pune's 15. Nagpur has no equivalent. Datameet
 *   does not carry it, and OpenStreetMap has the municipal outline (relation
 *   12969115, "Nagpur City") with nothing inside it. The Nagpur Municipal
 *   Corporation's zones and prabhags are published only as PDFs.
 *
 *   So the areas here are constructed, and they are NOT administrative
 *   boundaries. Each one is the part of the city nearer to one named anchor
 *   than to any other: a Voronoi partition of the municipal outline. The
 *   anchors are well-known localities, each placed on a real OpenStreetMap
 *   feature carrying that name (a suburb node where one exists, otherwise a
 *   square, station, lake or road of that name), and the feature each one came
 *   from is recorded beside it in data/<slug>_locality_anchors.json.
 *
 *   What that buys is a name a resident recognises for every cell. What it
 *   does not buy is a boundary anybody governs. A cell at the edge of
 *   "Dharampeth" here may sit in a different NMC zone, and nothing downstream
 *   should be read as saying which body is responsible for it. Every output
 *   feature carries that caveat, and the site repeats it.
 *
 * Inputs:
 *   data/<slug>_locality_anchors.json   name, lat, lon and OSM provenance
 *   OpenStreetMap via Overpass           the municipal outline (cached)
 *
 * Outputs:
 *   data/<slug>_city_boundary.geojson   the outline
 *   data/<slug>_localities.geojson      one polygon per locality
 *
 * Run: node 01_localities.mjs --city nagpur --osm-relation 12969115
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { Delaunay } from "d3-delaunay";
import polygonClipping from "polygon-clipping";
import { DATA_DIR, cityFromArgv } from "./lib/city.mjs";
import { overpass } from "./lib/overpass.mjs";
import {
  bboxOf,
  featureCollection,
  geometryArea,
  geometryFrom,
  mapGeometry,
  pointInGeometry,
  polygonArea,
  polygonsOf,
  readJson,
  utmProjector,
  writeJson,
} from "./lib/geo.mjs";

/**
 * Anchors closer together than this are merged into the earlier one listed.
 * Two anchors a few hundred metres apart would each claim a handful of cells,
 * too few to average an index over.
 */
const MIN_ANCHOR_SPACING_M = 1300;

/** Joins a boundary relation's member ways, which arrive in arbitrary order and direction, into closed rings. */
function stitchRings(ways) {
  const remaining = ways.map((way) => way.map((p) => [p.lon, p.lat]));
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const rings = [];
  while (remaining.length) {
    const ring = remaining.shift();
    while (!same(ring[0], ring.at(-1))) {
      const next = remaining.findIndex((w) => same(w[0], ring.at(-1)) || same(w.at(-1), ring.at(-1)));
      if (next === -1) throw new Error("the relation's ways do not close into a ring");
      const [way] = remaining.splice(next, 1);
      ring.push(...(same(way[0], ring.at(-1)) ? way : way.reverse()).slice(1));
    }
    rings.push(ring);
  }
  return rings;
}

async function loadOutline(city, relationId) {
  const path = join(DATA_DIR, `${city.slug}_city_boundary.geojson`);
  if (existsSync(path)) {
    console.log(`[ok] municipal outline from ${city.slug}_city_boundary.geojson`);
    return readJson(path).features[0].geometry;
  }
  if (!relationId) throw new Error(`${path} not found and no --osm-relation given to fetch it`);

  console.log(`[..] fetching OSM relation ${relationId} via Overpass`);
  const payload = await overpass(`[out:json][timeout:90];relation(${relationId});out geom;`);
  const relation = payload.elements.find((e) => e.type === "relation");
  if (!relation) throw new Error(`Overpass returned no relation ${relationId}`);
  const rings = stitchRings(
    relation.members.filter((m) => m.type === "way" && (m.role === "outer" || m.role === "")).map((m) => m.geometry),
  );
  // The largest ring is the outline; anything else would be an exclave.
  rings.sort((a, b) => polygonArea([b]) - polygonArea([a]));
  const geometry = geometryFrom(rings.map((ring) => [ring]));
  writeJson(
    path,
    featureCollection(`${city.slug}_city_boundary`, [
      {
        type: "Feature",
        properties: {
          name: relation.tags?.name ?? null,
          osm_relation: relationId,
          source: "OpenStreetMap contributors, ODbL",
        },
        geometry,
      },
    ]),
  );
  console.log(`[ok] wrote municipal outline -> ${path}`);
  return geometry;
}

async function main() {
  const city = cityFromArgv();
  const relationArg = process.argv.indexOf("--osm-relation");
  const relationId = relationArg !== -1 ? Number(process.argv[relationArg + 1]) : null;

  const anchorsPath = join(DATA_DIR, `${city.slug}_locality_anchors.json`);
  if (!existsSync(anchorsPath)) throw new Error(`${anchorsPath} not found`);
  const anchors = readJson(anchorsPath).anchors;

  const outline = await loadOutline(city, relationId);
  const utm = utmProjector(city.projectedCrs);
  const outlineM = mapGeometry(outline, utm.forward);
  console.log(`[ok] outline covers ${(geometryArea(outlineM) / 1e6).toFixed(1)} km2, working in ${city.projectedCrs}`);

  const kept = [];
  for (const anchor of anchors) {
    const [x, y] = utm.forward([anchor.lon, anchor.lat]);
    if (!pointInGeometry(x, y, outlineM)) {
      console.log(`[skip] ${anchor.name}: outside the municipal outline`);
      continue;
    }
    const clash = kept.find((k) => Math.hypot(k.x - x, k.y - y) < MIN_ANCHOR_SPACING_M);
    if (clash) {
      console.log(`[skip] ${anchor.name}: within ${MIN_ANCHOR_SPACING_M} m of ${clash.anchor.name}`);
      continue;
    }
    kept.push({ anchor, x, y });
  }
  if (kept.length < 3) throw new Error("fewer than three anchors survive; a partition needs at least three");

  const [minX, minY, maxX, maxY] = bboxOf(outlineM);
  const voronoi = Delaunay.from(kept.map((k) => [k.x, k.y])).voronoi([minX - 5000, minY - 5000, maxX + 5000, maxY + 5000]);
  const outlinePolygons = polygonsOf(outlineM);

  const features = kept
    .map((k, i) => {
      const pieces = polygonClipping.intersection([voronoi.cellPolygon(i)], outlinePolygons);
      const geometryM = geometryFrom(pieces);
      if (!geometryM) return null;
      return {
        type: "Feature",
        properties: {
          name: k.anchor.name,
          kind: "approximate locality (Voronoi around an OSM anchor), not an administrative boundary",
          anchor_lat: k.anchor.lat,
          anchor_lon: k.anchor.lon,
          anchor_osm_feature: k.anchor.osm_feature ?? null,
          anchor_osm_match: k.anchor.osm_match ?? null,
          area_km2: Math.round(geometryArea(geometryM) / 1e4) / 100,
        },
        geometry: mapGeometry(geometryM, utm.inverse),
        areaM2: geometryArea(geometryM),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.properties.name.localeCompare(b.properties.name));

  features.forEach((f, i) => {
    f.properties = { gid: i + 1, ...f.properties };
  });
  const covered = features.reduce((s, f) => s + f.areaM2, 0) / geometryArea(outlineM);
  const areas = features.map((f) => f.properties.area_km2).sort((a, b) => a - b);
  for (const f of features) delete f.areaM2;

  const outPath = join(DATA_DIR, `${city.slug}_localities.geojson`);
  writeJson(outPath, featureCollection(`${city.slug}_localities`, features));
  console.log(`[ok] wrote ${features.length} localities -> ${outPath}`);
  console.log(
    `     area: min ${areas[0]} km2, median ${areas[areas.length >> 1]} km2, max ${areas.at(-1)} km2; ` +
      `${(covered * 100).toFixed(1)}% of the outline covered`,
  );
  if (city.expectedWardCount !== null && features.length !== city.expectedWardCount) {
    console.log(
      `[WARN] config expects ${city.expectedWardCount} areas, built ${features.length}. ` +
        "Update boundaries.expected_ward_count in the city config.",
    );
    process.exitCode = 2;
  }
  if (Math.abs(covered - 1) > 0.001) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exit(1);
});
