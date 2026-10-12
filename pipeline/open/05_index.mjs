/**
 * Stage 05 (open build): tidy the cells, score them, roll them up.
 *
 * Stages 04, 05 and 08 of the Python pipeline in one pass, using the port in
 * lib/index.mjs that verify_mumbai.test.mjs holds to Mumbai's published output.
 *
 *   - A cell missing any indicator is dropped before scoring: one null would
 *     propagate through the z-scores and the PCA and move every weight.
 *   - A cell with no residents is dropped: there is nobody there to be
 *     vulnerable.
 *   - The index runs on whichever of the seven indicators the city carries.
 *     Nagpur has five. The weights are recomputed from the city's own cells, so
 *     they are not Mumbai's and are not comparable with Mumbai's.
 *
 * Inputs:   data/<slug>/grid_people.geojson, the boundary file
 * Outputs:  data/<slug>/cells_hvi.geojson     per-cell HVI and contributions
 *           data/<slug>/wards_hvi.geojson     per-area HVI, rank, dominant factor
 *           data/<slug>/hvi_pca_log.json      weights and explained variance
 *           data/<slug>/sensitivity.json      rank stability under +/-20% weights
 *
 * Run: node 05_index.mjs --city nagpur
 */

import { join } from "node:path";
import { cityFromArgv } from "./lib/city.mjs";
import { featureCollection, readJson, writeJson } from "./lib/geo.mjs";
import { DIRECTIONS, computeIndex, rollupWards, sensitivity } from "./lib/index.mjs";

function main() {
  const city = cityFromArgv();
  const grid = readJson(join(city.dataDir, "grid_people.geojson"));
  console.log(`[ok] loaded ${grid.features.length} cells`);

  // The indicators this city has at all: present on at least one cell.
  const cols = Object.keys(DIRECTIONS).filter((c) =>
    grid.features.some((f) => f.properties[c] !== undefined && f.properties[c] !== null),
  );
  const absent = Object.keys(DIRECTIONS).filter((c) => !cols.includes(c));
  console.log(`[ok] indicators: ${cols.join(", ")}`);
  if (absent.length) console.log(`[note] not available for ${city.name}: ${absent.join(", ")}`);
  if (!cols.includes("LST_C")) throw new Error("LST_C is missing; the index cannot be oriented without it");

  const complete = grid.features.filter((f) => cols.every((c) => f.properties[c] !== null && f.properties[c] !== undefined));
  const dropped = grid.features.length - complete.length;
  if (dropped) console.log(`[WARN] dropped ${dropped}/${grid.features.length} cells with a missing indicator value`);
  const populated = complete.filter((f) => f.properties.pop_density_km2 > 0);
  if (populated.length < complete.length) {
    console.log(`[note] excluded ${complete.length - populated.length} cells with zero population`);
  }

  const rows = populated.map((f) => f.properties);
  const index = computeIndex(rows, cols);
  rows.forEach((row, i) => Object.assign(row, index.cells[i]));
  console.log(`[ok] PC1 explains ${(index.log.explained_variance_pc1 * 100).toFixed(1)}% of variance (${index.log.weight_source})`);
  console.log(
    "[ok] weights: " + cols.map((c) => `${c} ${index.log.weights[c].toFixed(3)}`).join(", "),
  );

  writeJson(join(city.dataDir, "cells_hvi.geojson"), featureCollection("cells_hvi", populated));
  writeJson(join(city.dataDir, "hvi_pca_log.json"), index.log, 2);

  // ------------------------------------------------------- area rollup --
  const wards = rollupWards(rows, cols);
  const boundaries = readJson(city.boundariesPath).features;
  const wardFeatures = boundaries.map((b, i) => {
    const ward_id = String(b.properties[city.wardIdField]);
    const scored = wards.find((w) => w.ward_id === ward_id);
    return {
      type: "Feature",
      properties: { ward_gid: b.properties.gid ?? i + 1, ward_id, ...(scored ?? { HVI: null, rank: null, n_cells: null }) },
      geometry: b.geometry,
    };
  });
  writeJson(join(city.dataDir, "wards_hvi.geojson"), featureCollection("wards_hvi", wardFeatures));

  const stability = sensitivity(rows, index.log.weights);
  writeJson(join(city.dataDir, "sensitivity.json"), stability, 2);

  // ------------------------------------------------------- sanity checks --
  let ok = true;
  if (populated.length < 0.85 * grid.features.length) {
    console.log(`[WARN] lost more than 15% of cells to missing data (${populated.length}/${grid.features.length} kept)`);
    ok = false;
  }
  const unscored = wardFeatures.filter((f) => f.properties.HVI === null).map((f) => f.properties.ward_id);
  if (unscored.length) {
    console.log(`[WARN] areas with no scored cell: ${unscored.join(", ")}`);
    ok = false;
  }
  const dominated = wards.filter((w) => w.single_factor_dominated);
  if (dominated.length) {
    console.log(`[note] ${dominated.length} area(s) driven by a single indicator: ${dominated.map((w) => `${w.ward_id} (${w.dominant_factor})`).join(", ")}`);
  }
  console.log(
    `[ok] sensitivity: mean Kendall tau ${stability.mean_kendall_tau.toFixed(3)}, ` +
      `mean top-5 overlap ${stability.mean_top5_overlap.toFixed(1)}/5`,
  );
  console.log("\nMost vulnerable areas:");
  for (const w of wards.slice(0, 8)) {
    console.log(`  ${String(w.rank).padStart(2)}  ${w.ward_id.padEnd(18)} HVI ${w.HVI.toFixed(1).padStart(5)}  ${w.n_cells} cells  driver ${w.dominant_factor}`);
  }
  console.log(`\n${ok ? "GO" : "CHECK WARNINGS"}: ${populated.length} cells scored across ${wards.length} areas.`);
  if (!ok) process.exitCode = 2;
}

main();
