/**
 * The Heat Vulnerability Index, as stage 05 computes it.
 *
 * A line-for-line port of pipeline/05_hvi.py, _hvi.py and 08_sensitivity.py,
 * not a reinterpretation. `verify_mumbai.mjs` runs this against Mumbai's
 * committed cells and requires it to reproduce the published scores, weights
 * and ranks, so a difference between the two implementations fails loudly
 * instead of producing a second, slightly different index.
 */

import { firstPrincipalComponent, kendallTau, mean, pearson, rankDescending, zscores } from "./stats.mjs";

/** +1 when a higher value adds to vulnerability, -1 when it protects. Order is the canonical display order (pipeline/_indicators.py). */
export const DIRECTIONS = {
  LST_C: 1,
  NDVI: -1,
  pop_density_km2: 1,
  child_pct: 1,
  slum_pct: 1,
  hospital_dist_m: 1,
  impervious_pct: 1,
};

/** Below this, PC1 loadings are treated as unstable and equal weights are used instead. */
export const MIN_EXPLAINED_VARIANCE = 0.3;
export const DOMINANCE_THRESHOLD = 0.5;

/** The indicators a dataset actually carries, in canonical order. */
export function presentIndicators(row) {
  return Object.keys(DIRECTIONS).filter((c) => row[c] !== undefined && row[c] !== null);
}

/** Rescale to 0-100 across all values; a constant series lands on 50. */
function rescale(values) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return values.map(() => 50);
  return values.map((v) => ((v - lo) / (hi - lo)) * 100);
}

function signedZ(rows, cols) {
  return cols.map((c) => zscores(rows.map((r) => r[c])).map((z) => z * DIRECTIONS[c]));
}

/**
 * Scores every cell. Returns the per-cell HVI and contributions aligned with
 * `rows`, and the weighting that produced them.
 */
export function computeIndex(rows, cols) {
  const z = signedZ(rows, cols);
  const pca = firstPrincipalComponent(z);
  let loadings = pca.loadings;

  const fallbackUsed = pca.explainedVarianceRatio < MIN_EXPLAINED_VARIANCE;
  let weights;
  if (fallbackUsed) {
    weights = cols.map(() => 1 / cols.length);
  } else {
    // Orient PC1 so a higher score means more vulnerable.
    const scores = rows.map((_, r) => cols.reduce((s, _c, i) => s + z[i][r] * loadings[i], 0));
    if (pearson(scores, z[cols.indexOf("LST_C")]) < 0) loadings = loadings.map((l) => -l);
    const total = loadings.reduce((s, l) => s + Math.abs(l), 0);
    weights = loadings.map((l) => Math.abs(l) / total);
  }

  const raw = rows.map((_, r) => cols.reduce((s, _c, i) => s + z[i][r] * weights[i], 0));
  const hvi = rescale(raw);
  const cells = rows.map((_, r) => {
    const out = { HVI: hvi[r] };
    cols.forEach((c, i) => {
      out[`contrib_${c}`] = z[i][r] * weights[i];
    });
    return out;
  });

  return {
    cells,
    log: {
      explained_variance_pc1: pca.explainedVarianceRatio,
      loadings_pc1: Object.fromEntries(cols.map((c, i) => [c, loadings[i]])),
      weight_source: fallbackUsed ? "fallback_equal_reid2009" : "pca_reid2009",
      weights: Object.fromEntries(cols.map((c, i) => [c, weights[i]])),
      fallback_used: fallbackUsed,
      fallback_trigger: `explained_variance_pc1 < ${MIN_EXPLAINED_VARIANCE}`,
    },
  };
}

/** Which indicator drives a score, and by how much (`_hvi.factor_dominance`). */
export function factorDominance(contributions) {
  const entries = Object.entries(contributions).filter(([, v]) => v !== null && v !== undefined);
  const total = entries.reduce((s, [, v]) => s + Math.abs(v), 0);
  if (entries.length === 0 || total === 0) {
    return { dominant_factor: null, dominant_share: null, single_factor_dominated: false };
  }
  let dominant = entries[0];
  for (const entry of entries) if (Math.abs(entry[1]) > Math.abs(dominant[1])) dominant = entry;
  const share = Math.abs(dominant[1]) / total;
  return {
    dominant_factor: dominant[0],
    dominant_share: Math.round(share * 1e4) / 1e4,
    single_factor_dominated: share >= DOMINANCE_THRESHOLD,
  };
}

/** Ward-level rollup: mean of the cells, ranked, most vulnerable first. */
export function rollupWards(rows, cols) {
  const byWard = new Map();
  for (const row of rows) {
    if (!byWard.has(row.ward_id)) byWard.set(row.ward_id, []);
    byWard.get(row.ward_id).push(row);
  }
  const wards = [...byWard].map(([ward_id, members]) => {
    const out = { ward_id, HVI: mean(members.map((m) => m.HVI)), n_cells: members.length };
    for (const c of cols) out[`contrib_${c}`] = mean(members.map((m) => m[`contrib_${c}`]));
    return out;
  });
  const ranks = rankDescending(wards.map((w) => w.HVI));
  wards.forEach((w, i) => {
    w.rank = ranks[i];
    Object.assign(w, factorDominance(Object.fromEntries(cols.map((c) => [c, w[`contrib_${c}`]]))));
  });
  return wards.sort((a, b) => a.rank - b.rank);
}

/** Ward ranking under each weight nudged +/-20% in turn (stage 08). */
export function sensitivity(rows, weightsByCol, perturbation = 0.2, topN = 5) {
  const cols = Object.keys(weightsByCol);
  const z = signedZ(rows, cols);
  const wardIds = [...new Set(rows.map((r) => r.ward_id))];

  const ranking = (weights) => {
    const sums = new Map(wardIds.map((id) => [id, { total: 0, n: 0 }]));
    rows.forEach((row, r) => {
      const tally = sums.get(row.ward_id);
      tally.total += cols.reduce((s, _c, i) => s + z[i][r] * weights[i], 0);
      tally.n += 1;
    });
    return [...sums].map(([id, t]) => [id, t.total / t.n]).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  };

  const base = cols.map((c) => weightsByCol[c]);
  const baseline = ranking(base);
  const baselineTop = new Set(baseline.slice(0, topN));
  const baselinePosition = new Map(baseline.map((id, i) => [id, i]));

  const runs = [];
  cols.forEach((c, index) => {
    for (const [label, sign] of [["+20%", 1], ["-20%", -1]]) {
      const perturbed = [...base];
      perturbed[index] *= 1 + sign * perturbation;
      const total = perturbed.reduce((s, w) => s + w, 0);
      const order = ranking(perturbed.map((w) => w / total));
      const position = new Map(order.map((id, i) => [id, i]));
      runs.push({
        indicator: c,
        perturbation: label,
        kendall_tau: kendallTau(baseline.map((id) => baselinePosition.get(id)), baseline.map((id) => position.get(id))),
        top5_overlap: order.slice(0, topN).filter((id) => baselineTop.has(id)).length,
        top5_ranking: order.slice(0, topN),
      });
    }
  });

  return {
    baseline_top5: baseline.slice(0, topN),
    perturbation_pct: perturbation,
    n_runs: runs.length,
    mean_kendall_tau: mean(runs.map((r) => r.kendall_tau)),
    mean_top5_overlap: mean(runs.map((r) => r.top5_overlap)),
    all_top5_stable: runs.every((r) => r.top5_overlap === topN),
    runs,
  };
}
