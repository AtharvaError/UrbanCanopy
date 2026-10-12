/**
 * Stage 04 (open build): who lives in each cell, and how far they are from a
 * hospital.
 *
 * The counterpart of pipeline/03_vectors.py, without Earth Engine:
 *
 *   pop_density_km2   WorldPop 2020 population (unconstrained, the 1 km
 *                     aggregate), shared between the cells each pixel overlaps
 *                     by area, then divided by the cell's area.
 *   hospital_dist_m   straight-line distance from the cell centroid to the
 *                     nearest OpenStreetMap hospital.
 *
 * There is deliberately no slum_pct. Mumbai's comes from a mapped slum-cluster
 * layer that has no open equivalent for most cities. The Python stage writes
 * zero for every cell when the layer is missing, which then sits in the index
 * as an indicator with no variance and a published weight of nothing. Leaving
 * the column out is the same arithmetic and says what is actually known: the
 * index downstream runs on the indicators a city has.
 *
 * The population raster is coarser than the grid, and that is a real limit.
 * The Earth Engine stage reads WorldPop at 100 m. WorldPop's own server does
 * not honour range requests, so reading a city's window out of the 1.8 GB
 * national 100 m file means downloading all of it; the 1 km aggregate of the
 * same product is 19 MB. At 1 km a pixel's people are spread evenly over the
 * 500 m cells under it, so neighbouring cells share a density and a lake or a
 * park inside a populated pixel is credited with residents it does not have.
 * Density is right at the scale of a locality and smoothed below it.
 *
 * Hospitals are taken from the city's bounding box, not clipped to the
 * boundary as the Python stage does. Someone living at the edge of the city
 * goes to the nearest hospital, and it does not stop being nearest for sitting
 * 200 m outside the municipal line.
 *
 * Inputs:
 *   data/<slug>/grid_layers.geojson
 *   WorldPop (CC BY 4.0), OpenStreetMap via Overpass (ODbL)
 *
 * Outputs:
 *   data/<slug>/grid_people.geojson
 *
 * Run: node 04_people.mjs --city nagpur
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE_DIR, cityFromArgv } from "./lib/city.mjs";
import { bboxOf, centroid, geometryArea, mapGeometry, pointInGeometry, readJson, utmProjector, writeJson } from "./lib/geo.mjs";
import { overpass } from "./lib/overpass.mjs";
import { readGeographicWindow, withRetry } from "./lib/raster.mjs";

/** Pinned to one vintage on purpose, as the Earth Engine stage pins IND_2020: a newer file must be a deliberate change. */
const WORLDPOP_FILE = "ind_ppp_2020_1km_Aggregated.tif";
const WORLDPOP_URL = `https://data.worldpop.org/GIS/Population/Global_2000_2020_1km/2020/IND/${WORLDPOP_FILE}`;
/** Each population pixel is split this many ways per side to share it between the cells it straddles (about 46 m apart). */
const SUBSAMPLES = 20;

/** The national file, downloaded once into data/cache/ and read from disk after that. */
async function worldpopBytes() {
  const path = join(CACHE_DIR, WORLDPOP_FILE);
  if (!existsSync(path)) {
    console.log(`[..] downloading ${WORLDPOP_FILE} (about 19 MB) from WorldPop`);
    const response = await withRetry(async () => {
      const r = await fetch(WORLDPOP_URL, { signal: AbortSignal.timeout(600_000) });
      if (!r.ok) throw new Error(`WorldPop returned HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    });
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(path, response);
  }
  const bytes = readFileSync(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function populationByCell(city, cells) {
  const [west, south, east, north] = city.bbox;
  const pop = await readGeographicWindow(await worldpopBytes(), [west, south, east, north]);
  console.log(`[ok] read WorldPop 2020 (1 km) window, ${pop.width} x ${pop.height} pixels`);

  const totals = new Map();
  for (const cell of cells) {
    const geometry = cell.feature.geometry;
    const [minLon, minLat, maxLon, maxLat] = bboxOf(geometry);
    const c0 = Math.max(Math.floor((minLon - pop.originLon) / pop.resLon), 0);
    const c1 = Math.min(Math.ceil((maxLon - pop.originLon) / pop.resLon), pop.width);
    const r0 = Math.max(Math.floor((pop.originLat - maxLat) / pop.resLat), 0);
    const r1 = Math.min(Math.ceil((pop.originLat - minLat) / pop.resLat), pop.height);
    let total = 0;
    let sawData = false;
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const value = pop.values[r * pop.width + c];
        // WorldPop marks no-data with a large negative number.
        if (!(value >= 0)) continue;
        sawData = true;
        let inside = 0;
        for (let sy = 0; sy < SUBSAMPLES; sy++) {
          const lat = pop.originLat - (r + (sy + 0.5) / SUBSAMPLES) * pop.resLat;
          for (let sx = 0; sx < SUBSAMPLES; sx++) {
            const lon = pop.originLon + (c + (sx + 0.5) / SUBSAMPLES) * pop.resLon;
            if (pointInGeometry(lon, lat, geometry)) inside += 1;
          }
        }
        total += value * (inside / (SUBSAMPLES * SUBSAMPLES));
      }
    }
    totals.set(cell.feature.properties.grid_id, sawData ? total : null);
  }
  return totals;
}

async function hospitalPoints(city, utm) {
  const [west, south, east, north] = city.bbox;
  const payload = await overpass(
    `[out:json][timeout:90];nwr["amenity"="hospital"](${south},${west},${north},${east});out center;`,
  );
  return payload.elements
    .map((e) => (e.type === "node" ? [e.lon, e.lat] : e.center ? [e.center.lon, e.center.lat] : null))
    .filter(Boolean)
    .map(utm.forward);
}

async function main() {
  const city = cityFromArgv();
  const grid = readJson(join(city.dataDir, "grid_layers.geojson"));
  const utm = utmProjector(city.projectedCrs);
  const cells = grid.features.map((f) => ({ feature: f, utm: mapGeometry(f.geometry, utm.forward) }));
  console.log(`[ok] loaded ${cells.length} grid cells`);

  console.log("[..] reading WorldPop population per cell");
  const population = await populationByCell(city, cells);

  console.log("[..] querying OpenStreetMap hospitals");
  const hospitals = await hospitalPoints(city, utm);
  console.log(`[ok] ${hospitals.length} OSM hospitals in the city's bounding box`);

  let matched = 0;
  let cityPopulation = 0;
  for (const cell of cells) {
    const p = cell.feature.properties;
    const total = population.get(p.grid_id);
    const areaKm2 = geometryArea(cell.utm) / 1e6;
    p.pop_density_km2 = total !== null && areaKm2 > 0 ? total / areaKm2 : null;
    if (total !== null) {
      matched += 1;
      cityPopulation += total;
    }
    const [cx, cy] = centroid(cell.utm);
    p.hospital_dist_m = hospitals.length
      ? Math.min(...hospitals.map(([hx, hy]) => Math.hypot(hx - cx, hy - cy)))
      : null;
  }

  const outPath = join(city.dataDir, "grid_people.geojson");
  writeJson(outPath, grid);
  console.log(`[ok] wrote ${cells.length} cells (${matched} with population) -> ${outPath}`);

  // ------------------------------------------------------- sanity checks --
  let ok = true;
  if (matched < 0.9 * cells.length) {
    console.log(`[WARN] only ${matched}/${cells.length} cells got WorldPop data`);
    ok = false;
  }
  if (hospitals.length === 0) {
    console.log("[WARN] no OSM hospitals returned; hospital_dist_m is null for every cell");
    ok = false;
  }
  const distances = cells.map((c) => c.feature.properties.hospital_dist_m).filter((v) => v !== null).sort((a, b) => a - b);
  console.log(
    `     modelled population inside the grid: ${Math.round(cityPopulation).toLocaleString("en-IN")}\n` +
      `     hospital distance: median ${Math.round(distances[distances.length >> 1])} m, max ${Math.round(distances.at(-1))} m`,
  );
  console.log(ok ? "\nGO" : "\nCHECK WARNINGS");
  if (!ok) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exit(1);
});
