/**
 * The JavaScript port of the index must reproduce Mumbai.
 *
 * Mumbai's committed dataset was produced by the Python stages. Feeding the
 * same input cells through this port and requiring the same scores, weights,
 * ranks, plantability flags and recommendations is the strongest check
 * available that the two implementations are one index and not two.
 *
 * Run: node --test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./lib/geo.mjs";
import { computeIndex, presentIndicators, rollupWards, sensitivity } from "./lib/index.mjs";
import { applyNbs } from "./lib/nbs.mjs";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const TOLERANCE = 1e-9;

const close = (actual, expected, label, tolerance = TOLERANCE) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: got ${actual}, expected ${expected}`);

const cells = readJson(join(DATA, "cells.geojson")).features.map((f) => f.properties);
const publishedCells = new Map(readJson(join(DATA, "cells_hvi.geojson")).features.map((f) => [f.properties.grid_id, f.properties]));
const cols = presentIndicators(cells[0]);
const index = computeIndex(cells, cols);

test("carries Mumbai's seven indicators in canonical order", () => {
  assert.deepEqual(cols, ["LST_C", "NDVI", "pop_density_km2", "child_pct", "slum_pct", "hospital_dist_m", "impervious_pct"]);
});

test("reproduces the published PCA weights", () => {
  const log = readJson(join(DATA, "hvi_pca_log.json"));
  close(index.log.explained_variance_pc1, log.explained_variance_pc1, "explained variance");
  assert.equal(index.log.weight_source, log.weight_source);
  for (const c of cols) {
    close(index.log.weights[c], log.weights[c], `weight ${c}`);
    close(index.log.loadings_pc1[c], log.loadings_pc1[c], `loading ${c}`);
  }
});

test("reproduces every published cell score and contribution", () => {
  assert.equal(cells.length, publishedCells.size);
  cells.forEach((cell, i) => {
    const published = publishedCells.get(cell.grid_id);
    close(index.cells[i].HVI, published.HVI, `${cell.grid_id} HVI`, 1e-8);
    for (const c of cols) close(index.cells[i][`contrib_${c}`], published[`contrib_${c}`], `${cell.grid_id} contrib_${c}`);
  });
});

test("reproduces the published ward scores, ranks and dominant factors", () => {
  const scored = cells.map((cell, i) => ({ ...cell, ...index.cells[i] }));
  const wards = rollupWards(scored, cols);
  const published = readJson(join(DATA, "wards_hvi.geojson")).features.map((f) => f.properties);
  assert.equal(wards.length, published.length);
  for (const expected of published) {
    const ward = wards.find((w) => w.ward_id === expected.ward_id);
    close(ward.HVI, expected.HVI, `${expected.ward_id} HVI`, 1e-8);
    assert.equal(ward.rank, expected.rank, `${expected.ward_id} rank`);
    assert.equal(ward.n_cells, expected.n_cells);
    assert.equal(ward.dominant_factor, expected.dominant_factor, `${expected.ward_id} dominant factor`);
    close(ward.dominant_share, expected.dominant_share, `${expected.ward_id} dominant share`, 1e-4);
    assert.equal(ward.single_factor_dominated, expected.single_factor_dominated);
  }
});

test("reproduces the published sensitivity analysis", () => {
  const expected = readJson(join(DATA, "sensitivity.json"));
  const actual = sensitivity(cells, readJson(join(DATA, "hvi_pca_log.json")).weights);
  assert.deepEqual(actual.baseline_top5, expected.baseline_top5);
  assert.equal(actual.n_runs, expected.n_runs);
  close(actual.mean_kendall_tau, expected.mean_kendall_tau, "mean tau", 1e-9);
  close(actual.mean_top5_overlap, expected.mean_top5_overlap, "mean overlap");
  actual.runs.forEach((run, i) => {
    assert.equal(run.indicator, expected.runs[i].indicator);
    close(run.kendall_tau, expected.runs[i].kendall_tau, `tau run ${i}`, 1e-9);
    assert.deepEqual(run.top5_ranking, expected.runs[i].top5_ranking);
  });
});

test("reproduces every published plantability flag and recommendation", () => {
  const published = readJson(join(DATA, "cells_nbs.geojson")).features.map((f) => f.properties);
  // Start from the published inputs with the two outputs removed, so the port
  // has to derive them.
  const rows = published.map(({ plantable: _p, nbs_fired: _n, ...rest }) => ({ ...rest }));
  const { recommendations } = applyNbs(rows);
  rows.forEach((row, i) => {
    assert.equal(row.plantable, published[i].plantable, `${row.grid_id} plantable`);
    assert.equal(row.nbs_fired, published[i].nbs_fired, `${row.grid_id} nbs_fired`);
  });
  assert.deepEqual(recommendations, readJson(join(DATA, "nbs_recommendations.json")));
});
