/**
 * The score, as a formula anyone can run by hand.
 *
 *   score = baseline + scale x sum( weight x direction x (value - mean) / std )
 *
 * Every constant on the right is published in `ward_profiles.json`. This module
 * is the calculator's whole engine and the "How the score works" card's source,
 * and it is the same arithmetic the data build uses: with the published weights
 * and a locality's published values it returns that locality's published score
 * (a test holds it to that). Change a value or a weight and it answers the
 * question the page is for: what would the score be then?
 *
 * One thing is held fixed on purpose. `baseline` and `scale` were set by the
 * published weights, so that the lowest and highest cell in the city land on 0
 * and 100. With other weights the same anchors are kept, which lets a changed
 * score be compared with the published one on one ruler. The price is that an
 * extreme combination can run past either end, where it is clamped.
 */

import type { WardProfile, WardProfileData } from "./wardProfile";
import type { IndicatorKey } from "./wardTypes";

export type ScoreModel = {
  indicators: IndicatorKey[];
  mean: Record<string, number>;
  std: Record<string, number>;
  /** +1 when a higher value raises the score, -1 when it lowers it. */
  direction: Record<string, 1 | -1>;
  /** The published weights, summing to 1. */
  weights: Record<string, number>;
  /** What a locality that is average on every indicator scores. */
  baseline: number;
  /** Score points per unit of weighted, standardised difference. */
  scale: number;
};

/** Null when the profile file predates the published formula constants. */
export function scoreModelFrom(data: WardProfileData): ScoreModel | null {
  if (!data.score_scale || !data.weights || !data.indicator_stats) return null;
  const model: ScoreModel = {
    indicators: data.indicators,
    mean: {},
    std: {},
    direction: {},
    weights: {},
    baseline: data.score_scale.baseline_points,
    scale: data.score_scale.points_per_contribution,
  };
  for (const key of data.indicators) {
    const stats = data.indicator_stats[key];
    const weight = data.weights[key];
    if (!stats || weight === undefined) return null;
    model.mean[key] = stats.mean;
    model.std[key] = stats.std;
    model.direction[key] = stats.direction;
    model.weights[key] = weight;
  }
  return model;
}

/** Weights as shares of one whole. All zero means no preference, which is equal weighting. */
export function normaliseWeights(raw: Record<string, number>, indicators: readonly IndicatorKey[]): Record<string, number> {
  const total = indicators.reduce((sum, key) => sum + Math.max(raw[key] ?? 0, 0), 0);
  return Object.fromEntries(
    indicators.map((key) => [key, total > 0 ? Math.max(raw[key] ?? 0, 0) / total : 1 / indicators.length]),
  );
}

export type ScoreResult = {
  /** 0 to 100. */
  score: number;
  /** Before clamping, so a caller can say when the ends were hit. */
  unclamped: number;
  /** Points each indicator adds to or takes from the baseline. */
  points: Record<string, number>;
};

export function computeScore(
  values: Partial<Record<IndicatorKey, number>>,
  weights: Record<string, number>,
  model: ScoreModel,
): ScoreResult {
  const points: Record<string, number> = {};
  let total = model.baseline;
  for (const key of model.indicators) {
    const value = values[key];
    const spread = model.std[key];
    const standardised = value === undefined || !spread ? 0 : (model.direction[key] * (value - model.mean[key])) / spread;
    points[key] = model.scale * (weights[key] ?? 0) * standardised;
    total += points[key];
  }
  return { score: Math.min(Math.max(total, 0), 100), unclamped: total, points };
}

export type ZoneScore = ScoreResult & { wardId: string; rank: number };

/** A locality's own values, with any edited ones laid over them. */
export function valuesFor(
  ward: WardProfile,
  indicators: readonly IndicatorKey[],
  edits: Partial<Record<IndicatorKey, number>> = {},
): Partial<Record<IndicatorKey, number>> {
  return Object.fromEntries(indicators.map((key) => [key, edits[key] ?? ward[key]]));
}

/**
 * Scores every locality under one set of weights and ranks them, most
 * concerning first. Ties share the better rank.
 */
export function scoreAll(
  data: WardProfileData,
  weights: Record<string, number>,
  model: ScoreModel,
  edits: Record<string, Partial<Record<IndicatorKey, number>>> = {},
): ZoneScore[] {
  const scored = data.wards.map((ward) => ({
    wardId: ward.ward_id,
    ...computeScore(valuesFor(ward, model.indicators, edits[ward.ward_id]), weights, model),
  }));
  const ordered = scored.map((s) => s.unclamped).sort((a, b) => b - a);
  return scored.map((s) => ({ ...s, rank: ordered.indexOf(s.unclamped) + 1 }));
}

/** How an indicator is entered in the calculator: its unit and a plausible range to type within. */
export const INDICATOR_INPUTS: Record<IndicatorKey, { label: string; unit: string; min: number; max: number; step: number; digits: number }> = {
  LST_C: { label: "Surface temperature", unit: "°C", min: 20, max: 65, step: 0.1, digits: 1 },
  NDVI: { label: "Green cover (NDVI)", unit: "0 to 1", min: 0, max: 1, step: 0.01, digits: 2 },
  pop_density_km2: { label: "Population density", unit: "per km²", min: 0, max: 100000, step: 100, digits: 0 },
  child_pct: { label: "Young children", unit: "%", min: 0, max: 100, step: 0.1, digits: 1 },
  slum_pct: { label: "Informal housing", unit: "%", min: 0, max: 100, step: 0.1, digits: 1 },
  hospital_dist_m: { label: "Distance to a hospital", unit: "m", min: 0, max: 10000, step: 10, digits: 0 },
  impervious_pct: { label: "Built-up surface", unit: "%", min: 0, max: 100, step: 1, digits: 0 },
};
