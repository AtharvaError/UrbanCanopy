/**
 * Stage 06 (open build): plantability and the intervention rules.
 *
 * The decision logic is lib/nbs.mjs, a port of pipeline/_nbs.py that is checked
 * against all of Mumbai's published cells. This stage only feeds it and writes
 * the result. Land cover was already read onto the cells by stage 03.
 *
 * The plantability filter is NOT calibrated for a city whose config says
 * `ecology.calibrated: false`. It refuses built-up land, water, wetland and
 * WorldCover's grassland class, and that last rule was tuned on Mumbai's coast.
 * Native savanna and scrub in other biomes are often mapped as cropland,
 * shrubland or bare ground, and would pass. The stage says so every time it
 * runs for such a city.
 *
 * Inputs:   data/<slug>/cells_hvi.geojson
 * Outputs:  data/<slug>/cells_nbs.geojson, data/<slug>/nbs_recommendations.json
 *
 * Run: node 06_nbs.mjs --city nagpur
 */

import { join } from "node:path";
import { cityFromArgv } from "./lib/city.mjs";
import { readJson, writeJson } from "./lib/geo.mjs";
import { WORLDCOVER_GRASSLAND, applyNbs } from "./lib/nbs.mjs";

function main() {
  const city = cityFromArgv();
  const cells = readJson(join(city.dataDir, "cells_hvi.geojson"));
  const rows = cells.features.map((f) => f.properties);
  console.log(`[ok] loaded ${rows.length} cells`);

  const { thresholds, recommendations } = applyNbs(rows);
  console.log(
    "[ok] thresholds (75th/25th percentile): " +
      Object.entries(thresholds).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", "),
  );
  const plantable = rows.filter((r) => r.plantable).length;
  const grassland = rows.filter((r) => r.worldcover_class === WORLDCOVER_GRASSLAND).length;
  console.log(`[ok] ${plantable}/${rows.length} cells plantable (${grassland} rejected as grassland)`);
  if (city.ecology.calibrated !== true) {
    console.log(
      `[WARN] plantability is NOT ecologically calibrated for ${city.name}. It screens land cover; ` +
        "it does not clear a site for planting. See docs/calibrating-ecology.md.",
    );
  }

  cells.name = "cells_nbs";
  writeJson(join(city.dataDir, "cells_nbs.geojson"), cells);
  writeJson(join(city.dataDir, "nbs_recommendations.json"), recommendations, 2);

  // ------------------------------------------------------- sanity checks --
  const wardsWithRecs = new Set(recommendations.map((r) => r.ward_id));
  const wardCount = new Set(rows.map((r) => r.ward_id)).size;
  const fired = rows.filter((r) => r.nbs_fired).length;
  console.log(`\n${fired} cells carry a recommendation, across ${wardsWithRecs.size}/${wardCount} areas`);
  const ok = wardsWithRecs.size >= 0.6 * wardCount;
  if (!ok) console.log(`[WARN] fewer than 60% of areas got any recommendation`);
  console.log(ok ? "GO" : "CHECK WARNINGS");
  if (!ok) process.exitCode = 2;
}

main();
