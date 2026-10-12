/**
 * The nature-based-solutions decision logic, ported from pipeline/_nbs.py.
 *
 * This is the logic most worth getting identical. A bug here does not crash, it
 * produces a confident, plausible, wrong recommendation, and the plantability
 * filter is what stops the tool recommending afforestation on native grassland.
 * `verify_mumbai.mjs` checks it against every one of Mumbai's published cells.
 */

import { quantile } from "./stats.mjs";

export const WORLDCOVER_GRASSLAND = 30;
/** Built-up, water, wetland, mangrove. */
export const WORLDCOVER_NONPLANTABLE = new Set([50, 80, 90, 95]);
export const WORLDCOVER_WATER_LIKE = new Set([80, 90, 95]);
export const WORLDCOVER_CLASSES = new Set([10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]);

/** A cell within this distance of mapped water is treated as flood-exposed. A proxy, not a hydrology model. */
export const FLOOD_PRONE_DIST_M = 500;

/** A WorldCover class code as an integer, or null if it is not one. */
export function normaliseWorldcoverClass(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (Number.isNaN(number)) return null;
  const code = Math.round(number);
  return WORLDCOVER_CLASSES.has(code) ? code : null;
}

/** Whether native tree planting is ecologically defensible on this cell. No land-cover reading means no. */
export function isPlantable(worldcoverClass, imperviousPct, imperviousThreshold) {
  const code = normaliseWorldcoverClass(worldcoverClass);
  if (code === null) return false;
  if (WORLDCOVER_NONPLANTABLE.has(code)) return false;
  if (code === WORLDCOVER_GRASSLAND) return false;
  if (imperviousPct === null || imperviousPct === undefined) return false;
  return imperviousPct < imperviousThreshold;
}

/** The 75th/25th percentile cutoffs the rules compare against, taken from the city's own cells. */
export function thresholdsFor(rows) {
  return {
    hvi_p75: quantile(rows.map((r) => r.HVI), 0.75),
    ndvi_p25: quantile(rows.map((r) => r.NDVI), 0.25),
    density_p75: quantile(rows.map((r) => r.pop_density_km2), 0.75),
    impervious_p75: quantile(rows.map((r) => r.impervious_pct), 0.75),
  };
}

/** Every intervention that applies to one cell, with its citation. */
export function fireRules(row, thresholds) {
  const recs = [];
  const hviHigh = row.HVI >= thresholds.hvi_p75;
  const canopyLow = row.NDVI <= thresholds.ndvi_p25;
  const densityHigh = row.pop_density_km2 >= thresholds.density_p75;
  const openSpaceLow = row.NDVI <= thresholds.ndvi_p25;
  const imperviousHigh = row.impervious_pct >= thresholds.impervious_p75;
  const floodProne = row.dist_to_water_m <= FLOOD_PRONE_DIST_M;

  if (hviHigh && canopyLow && row.plantable) {
    recs.push({
      intervention: "Native tree planting + green corridors",
      rationale: "High vulnerability, low canopy, ecologically suitable for restoration",
      citation: "Bastin et al. 2019, Science",
      priority: 1,
    });
  } else if (hviHigh && canopyLow && !row.plantable) {
    recs.push({
      intervention: "Cool roofs + reflective pavements + cooling centres",
      rationale:
        "High vulnerability, low canopy, but native-grassland/built-up cell: afforestation would backfire ecologically",
      citation: "Veldman et al. 2019, Science (response to Bastin 2019)",
      priority: 1,
    });
  }

  if (imperviousHigh && floodProne) {
    recs.push({
      intervention: "Rain gardens + water-sensitive urban design (WSUD)",
      rationale: "Highly impervious cell near mapped water/wetland: runoff and heat compound risk",
      citation: "Methodology proxy: WorldCover water-distance < 500m (no dedicated hydrology layer in P0)",
      priority: 2,
    });
  }

  if (densityHigh && openSpaceLow) {
    recs.push({
      intervention: "Pocket parks",
      rationale: "High population density with little existing green/open space",
      citation: "C40 Urban Cooling Toolbox",
      priority: 3,
    });
  }
  return recs;
}

/**
 * Applies the filter and the rules to every cell. Sets `plantable` and
 * `nbs_fired` on each row and returns the ward-level recommendation rows.
 */
export function applyNbs(rows) {
  const thresholds = thresholdsFor(rows);
  const wardRecs = new Map();
  for (const row of rows) {
    row.worldcover_class = normaliseWorldcoverClass(row.worldcover_class);
    row.plantable = isPlantable(row.worldcover_class, row.impervious_pct, thresholds.impervious_p75);
    const recs = fireRules(row, thresholds);
    row.nbs_fired = recs.length > 0;
    for (const rec of recs) {
      const key = `${row.ward_id}\u0000${rec.intervention}`;
      if (!wardRecs.has(key)) wardRecs.set(key, { ward_id: row.ward_id, ...rec, cell_count: 0 });
      wardRecs.get(key).cell_count += 1;
    }
  }
  const recommendations = [...wardRecs.values()].sort(
    (a, b) => (a.ward_id < b.ward_id ? -1 : a.ward_id > b.ward_id ? 1 : a.priority - b.priority),
  );
  return { thresholds, recommendations };
}
