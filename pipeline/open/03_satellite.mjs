/**
 * Stage 03 (open build): the satellite layers, without Earth Engine.
 *
 * What it does:
 *   Produces the same per-cell columns as pipeline/02_gee_layers.py and the
 *   land-cover part of 06_nbs.py, from the same products, read from Microsoft
 *   Planetary Computer's public archive instead of through Earth Engine:
 *
 *     LST_C            seasonal median land surface temperature, Landsat 8/9
 *                      Collection 2 Level 2, band ST_B10
 *     NDVI             seasonal median vegetation index, same scenes
 *     NDVI_prev        the same index nine years earlier, for green-cover change
 *     lst_clear_obs    cloud-free observations behind each cell's LST
 *     LST_C_prev       the same season's LST nine years earlier, for the warming layer
 *     impervious_pct   share of the cell that is WorldCover class 50 (built-up)
 *     tree_pct         share of the cell that is WorldCover class 10 (tree cover)
 *     worldcover_class the cell's most common ESA WorldCover 2021 class
 *     dist_to_water_m  mean distance to the nearest water, wetland or mangrove pixel
 *
 *   The recipe is the Earth Engine stage's, constant for constant: scenes under
 *   20% cloud, QA_PIXEL bits 3 and 4 (cloud, cloud shadow) masked, a per-band
 *   median across the season, then NDVI from the median red and near-infrared.
 *
 * Where it differs, and why it is recorded rather than hidden:
 *   - A pixel counts toward a cell when its centre is inside the cell. Earth
 *     Engine weights pixels by the fraction inside. At 30 m pixels in a 500 m
 *     cell the difference is in the second decimal place.
 *   - The season comes from the city config (`imagery.season_*_month`), not
 *     from Mumbai's November to February window.
 *
 * Inputs:
 *   data/<slug>/grid.geojson
 *   Planetary Computer: landsat-c2-l2, esa-worldcover (public, no account)
 *
 * Outputs:
 *   data/<slug>/grid_layers.geojson
 *   data/<slug>/provenance_satellite.json   every scene id the composite used
 *
 * Run: node 03_satellite.mjs --city nagpur
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE_DIR, cityFromArgv } from "./lib/city.mjs";
import { bboxOf, mapGeometry, readJson, utmProjector, writeJson } from "./lib/geo.mjs";
import { WORLDCOVER_WATER_LIKE } from "./lib/nbs.mjs";
import {
  distanceToNearest,
  forEachPixelIn,
  readGeographicWindow,
  readOntoLattice,
  signHref,
  stacSearch,
  withRetry,
} from "./lib/raster.mjs";
import { mean, median } from "./lib/stats.mjs";

const MAX_CLOUD = 20;
const SR_SCALE = 2.75e-5;
const SR_OFFSET = -0.2;
const ST_SCALE = 0.00341802;
const ST_OFFSET = 149.0;
const LANDSAT_RESOLUTION_M = 30;
const QA_FILL = 1 << 0;
const QA_CLOUD = 1 << 3;
const QA_CLOUD_SHADOW = 1 << 4;
const WORLDCOVER_BUILTUP_CLASS = 50;
const WORLDCOVER_TREE_CLASS = 10;

/** How far back the green-cover and surface-heat baseline sits. Roughly a decade is long enough to be a trend rather than weather. */
const BASELINE_GAP_YEARS = 9;
/** Below this many cloud-free observations a cell's LST is flagged, as in the Earth Engine stage (issue #94). */
const MIN_CLEAR_OBS = 3;
/** Land cover is read this far beyond the grid so a lake just outside the city still counts as nearby water. */
const WATER_SEARCH_MARGIN_DEG = 0.03;

/** The most recent season that has fully finished, as [start, end] ISO dates. UCIP_SEASON_YEAR reproduces a past run. */
export function mostRecentCompleteSeason(startMonth, endMonth, today = new Date()) {
  const override = process.env.UCIP_SEASON_YEAR;
  let endYear = today.getUTCMonth() + 1 > endMonth ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  if (override) endYear = Number(override);
  const startYear = startMonth <= endMonth ? endYear : endYear - 1;
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, "0");
  return [`${startYear}-${pad(startMonth)}-01`, `${endYear}-${pad(endMonth)}-${pad(lastDay)}`];
}

function shiftYears([start, end], years) {
  const shift = (iso) => `${Number(iso.slice(0, 4)) - years}${iso.slice(4)}`;
  const shiftedEnd = shift(end);
  // 29 February does not exist nine years earlier.
  return [shift(start), shiftedEnd.endsWith("-02-29") ? shiftedEnd.replace("-02-29", "-02-28") : shiftedEnd];
}

/**
 * One band of one scene on the lattice, from data/cache/ when it has been read
 * before. A season is about ninety band reads over a slow link, and a build
 * that fails on the eightieth should resume there, not start again. Scenes are
 * immutable once published, so the scene id and the lattice are the whole key.
 */
async function cachedBand(item, asset, lattice) {
  const key = `${item.id}_${asset}_${lattice.originX}_${lattice.originY}_${lattice.width}x${lattice.height}.u16`;
  const path = join(CACHE_DIR, "landsat", key);
  if (existsSync(path)) {
    const bytes = readFileSync(path);
    return new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  const band = await withRetry(async () =>
    readOntoLattice(await signHref("landsat-c2-l2", item.assets[asset].href), lattice, 0),
  );
  mkdirSync(join(CACHE_DIR, "landsat"), { recursive: true });
  writeFileSync(path, Buffer.from(band.buffer, band.byteOffset, band.byteLength));
  return band;
}

/**
 * Median composite of surface temperature, red and near-infrared across a
 * season, on a fixed 30 m lattice, plus the count of clear observations.
 */
async function landsatComposite(city, lattice, bbox, [start, end]) {
  const epsg = Number(city.projectedCrs.replace("EPSG:", ""));
  const items = (await stacSearch("landsat-c2-l2", bbox, `${start}/${end}`))
    .filter((item) => ["landsat-8", "landsat-9"].includes(item.properties.platform))
    .filter((item) => item.properties["eo:cloud_cover"] < MAX_CLOUD)
    .filter((item) => {
      const code = item.properties["proj:epsg"] ?? Number(String(item.properties["proj:code"] ?? "").replace("EPSG:", ""));
      return code === epsg;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  console.log(`[ok] ${items.length} Landsat 8/9 scenes under ${MAX_CLOUD}% cloud in ${start}..${end}`);
  if (items.length === 0) return { items, lst: null, red: null, nir: null, clearObs: null };

  const pixels = lattice.width * lattice.height;
  const stacks = { lwir11: [], red: [], nir08: [] };
  for (const item of items) {
    const read = (asset) => cachedBand(item, asset, lattice);
    const [qa, lwir11, red, nir08] = await Promise.all([read("qa_pixel"), read("lwir11"), read("red"), read("nir08")]);
    // Masked pixels become 0, which is also Landsat's own nodata value.
    for (let i = 0; i < pixels; i++) {
      if (qa[i] === 0 || qa[i] & (QA_FILL | QA_CLOUD | QA_CLOUD_SHADOW)) {
        lwir11[i] = 0;
        red[i] = 0;
        nir08[i] = 0;
      }
    }
    stacks.lwir11.push(lwir11);
    stacks.red.push(red);
    stacks.nir08.push(nir08);
    process.stdout.write(`     read ${item.id}\n`);
  }

  const composite = (stack, withCount) => {
    const out = new Float32Array(pixels).fill(NaN);
    const count = withCount ? new Uint16Array(pixels) : null;
    const values = [];
    for (let i = 0; i < pixels; i++) {
      values.length = 0;
      for (const scene of stack) if (scene[i] !== 0) values.push(scene[i]);
      if (count) count[i] = values.length;
      if (values.length) out[i] = median(values);
    }
    return { out, count };
  };
  const st = composite(stacks.lwir11, true);
  return {
    items,
    lst: st.out,
    clearObs: st.count,
    red: composite(stacks.red, false).out,
    nir: composite(stacks.nir08, false).out,
  };
}

async function main() {
  const city = cityFromArgv();
  if (!city.seasonStartMonth || !city.seasonEndMonth) {
    throw new Error(`${city.slug}: the config needs imagery.season_start_month and season_end_month`);
  }
  const grid = readJson(join(city.dataDir, "grid.geojson"));
  const utm = utmProjector(city.projectedCrs);
  const cells = grid.features.map((f) => ({ feature: f, utm: mapGeometry(f.geometry, utm.forward) }));
  console.log(`[ok] loaded ${cells.length} grid cells`);

  // ------------------------------------------------------------- Landsat --
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    const [x0, y0, x1, y1] = bboxOf(cell.utm);
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  }
  // The archive's Landsat scenes have pixel edges on multiples of 30 m, so a
  // lattice snapped the same way reads each scene without resampling. A scene
  // that turned out to be offset would be read at its nearest pixel instead.
  const snapDown = (v) => Math.floor(v / LANDSAT_RESOLUTION_M) * LANDSAT_RESOLUTION_M;
  const originX = snapDown(minX) - LANDSAT_RESOLUTION_M;
  const originY = snapDown(maxY) + 2 * LANDSAT_RESOLUTION_M;
  const lattice = {
    originX,
    originY,
    resolution: LANDSAT_RESOLUTION_M,
    resX: LANDSAT_RESOLUTION_M,
    resY: LANDSAT_RESOLUTION_M,
    width: Math.ceil((maxX - originX) / LANDSAT_RESOLUTION_M) + 1,
    height: Math.ceil((originY - minY) / LANDSAT_RESOLUTION_M) + 1,
  };

  const current = mostRecentCompleteSeason(city.seasonStartMonth, city.seasonEndMonth);
  const previous = shiftYears(current, BASELINE_GAP_YEARS);
  const now = await landsatComposite(city, lattice, city.bbox, current);
  if (!now.lst) throw new Error("no current-season scenes found");
  const then = await landsatComposite(city, lattice, city.bbox, previous);
  if (!then.red) console.log("[WARN] no baseline scenes: NDVI_prev will be null and the change layer will read 'unknown'");

  const ndvi = (red, nir, i) => {
    const r = red[i] * SR_SCALE + SR_OFFSET;
    const n = nir[i] * SR_SCALE + SR_OFFSET;
    return Number.isNaN(r) || Number.isNaN(n) || n + r === 0 ? NaN : (n - r) / (n + r);
  };

  for (const cell of cells) {
    const lst = [];
    const ndviNow = [];
    const ndviThen = [];
    const lstThen = [];
    const obs = [];
    forEachPixelIn(cell.utm, lattice, (i) => {
      if (!Number.isNaN(now.lst[i])) lst.push(now.lst[i] * ST_SCALE + ST_OFFSET - 273.15);
      const a = ndvi(now.red, now.nir, i);
      if (!Number.isNaN(a)) ndviNow.push(a);
      if (then.red) {
        const b = ndvi(then.red, then.nir, i);
        if (!Number.isNaN(b)) ndviThen.push(b);
        if (!Number.isNaN(then.lst[i])) lstThen.push(then.lst[i] * ST_SCALE + ST_OFFSET - 273.15);
      }
      obs.push(now.clearObs[i]);
    });
    const p = cell.feature.properties;
    p.LST_C = lst.length ? mean(lst) : null;
    p.NDVI = ndviNow.length ? mean(ndviNow) : null;
    p.NDVI_prev = ndviThen.length ? mean(ndviThen) : null;
    p.LST_C_prev = lstThen.length ? mean(lstThen) : null;
    p.lst_clear_obs = obs.length ? mean(obs) : null;
    p.lst_obs_sparse = p.lst_clear_obs !== null && p.lst_clear_obs < MIN_CLEAR_OBS;
  }

  // ---------------------------------------------------------- WorldCover --
  const [west, south, east, north] = city.bbox;
  const coverItems = await stacSearch("esa-worldcover", city.bbox, "2021-01-01/2021-12-31");
  if (coverItems.length !== 1) {
    throw new Error(`expected one WorldCover 2021 tile over the city, found ${coverItems.length}; mosaicking is not implemented`);
  }
  const cover = await withRetry(async () =>
    readGeographicWindow(await signHref("esa-worldcover", coverItems[0].assets.map.href), [
      west - WATER_SEARCH_MARGIN_DEG,
      south - WATER_SEARCH_MARGIN_DEG,
      east + WATER_SEARCH_MARGIN_DEG,
      north + WATER_SEARCH_MARGIN_DEG,
    ]),
  );
  console.log(`[ok] read WorldCover 2021 (${coverItems[0].id}), ${cover.width} x ${cover.height} pixels`);

  const isWater = new Uint8Array(cover.values.length);
  for (let i = 0; i < cover.values.length; i++) isWater[i] = WORLDCOVER_WATER_LIKE.has(cover.values[i]) ? 1 : 0;
  const metresPerDegLat = 110_574;
  const metresPerDegLon = 111_320 * Math.cos((((south + north) / 2) * Math.PI) / 180);
  const distance = distanceToNearest(
    isWater,
    cover.width,
    cover.height,
    cover.resLon * metresPerDegLon,
    cover.resLat * metresPerDegLat,
  );
  const coverLattice = {
    originX: cover.originLon,
    originY: cover.originLat,
    resX: cover.resLon,
    resY: cover.resLat,
    width: cover.width,
    height: cover.height,
  };

  for (const cell of cells) {
    const counts = new Map();
    let total = 0;
    let distanceSum = 0;
    forEachPixelIn(cell.feature.geometry, coverLattice, (i) => {
      const code = cover.values[i];
      if (code === 0) return;
      counts.set(code, (counts.get(code) ?? 0) + 1);
      total += 1;
      distanceSum += distance[i];
    });
    const p = cell.feature.properties;
    if (total === 0) {
      p.impervious_pct = null;
      p.tree_pct = null;
      p.worldcover_class = null;
      p.dist_to_water_m = null;
      continue;
    }
    p.impervious_pct = ((counts.get(WORLDCOVER_BUILTUP_CLASS) ?? 0) / total) * 100;
    // Land mapped as tree cover at 10 m. It stands in for canopy cover and runs
    // low in built-up cells: a street tree narrower than a pixel is not counted.
    p.tree_pct = ((counts.get(WORLDCOVER_TREE_CLASS) ?? 0) / total) * 100;
    p.worldcover_class = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    p.dist_to_water_m = distanceSum / total;
  }

  const outPath = join(city.dataDir, "grid_layers.geojson");
  writeJson(outPath, grid);
  writeJson(
    join(city.dataDir, "provenance_satellite.json"),
    {
      source: "Microsoft Planetary Computer (public STAC, no account)",
      collections: ["landsat-c2-l2", "esa-worldcover"],
      composite_window: { start: current[0], end: current[1] },
      previous_window: { start: previous[0], end: previous[1] },
      max_cloud_pct: MAX_CLOUD,
      scenes_current_window: now.items.map((i) => i.id),
      scenes_previous_window: then.items.map((i) => i.id),
      worldcover_item: coverItems[0].id,
      cells: cells.length,
    },
    2,
  );
  console.log(`[ok] wrote ${cells.length} cells -> ${outPath}`);

  // ------------------------------------------------------- sanity checks --
  const props = cells.map((c) => c.feature.properties);
  const having = (key) => props.map((p) => p[key]).filter((v) => v !== null);
  const lstValues = having("LST_C");
  const ndviValues = having("NDVI");
  const sparse = props.filter((p) => p.lst_obs_sparse).length;
  const obs = having("lst_clear_obs").sort((a, b) => a - b);
  console.log(
    `[ok] clear observations per cell: min ${obs[0].toFixed(1)}, median ${obs[obs.length >> 1].toFixed(1)}, max ${obs.at(-1).toFixed(1)}`,
  );
  if (sparse) console.log(`[WARN] ${sparse} cell(s) below ${MIN_CLEAR_OBS} clear observations, flagged lst_obs_sparse`);

  let ok = true;
  if (lstValues.length < 0.9 * cells.length) {
    console.log(`[WARN] only ${lstValues.length}/${cells.length} cells got an LST value`);
    ok = false;
  }
  // Wider than the Earth Engine stage's 20 to 45 C: that range was written for
  // a coastal winter, and a hot-season composite over a continental city sits
  // well above it. This only catches a unit or scale slip.
  const meanLst = mean(lstValues);
  if (!(15 <= meanLst && meanLst <= 65)) {
    console.log(`[WARN] mean LST ${meanLst.toFixed(2)} C is outside any plausible range`);
    ok = false;
  }
  const meanNdvi = mean(ndviValues);
  if (!(-0.1 <= meanNdvi && meanNdvi <= 0.7)) {
    console.log(`[WARN] mean NDVI ${meanNdvi.toFixed(3)} is outside any plausible range`);
    ok = false;
  }
  const classes = new Map();
  for (const p of props) classes.set(p.worldcover_class, (classes.get(p.worldcover_class) ?? 0) + 1);
  console.log(`     dominant land cover by cell: ${[...classes].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(" ")}`);
  console.log(
    `\n${ok ? "GO" : "CHECK WARNINGS"}: mean LST ${meanLst.toFixed(2)} C (${Math.min(...lstValues).toFixed(1)} to ${Math.max(...lstValues).toFixed(1)}), ` +
      `mean NDVI ${meanNdvi.toFixed(3)}, mean impervious ${mean(having("impervious_pct")).toFixed(1)}%, mean tree cover ${mean(having("tree_pct")).toFixed(1)}%`,
  );
  if (!ok) process.exitCode = 2;
}

if (process.argv[1]?.endsWith("03_satellite.mjs")) {
  main().catch((error) => {
    console.error(`[FAIL] ${error.message}`);
    process.exit(1);
  });
}
