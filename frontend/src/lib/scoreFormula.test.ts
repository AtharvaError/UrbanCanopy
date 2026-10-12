/**
 * The calculator lets someone change a number and watch the score move. That
 * is only worth showing if the starting point is the real score, so the first
 * thing held here is that the formula, run on the published values with the
 * published weights, returns the published score for every locality.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WardProfileData } from "./wardProfile";
import { computeScore, normaliseWeights, scoreAll, scoreModelFrom, valuesFor, INDICATOR_INPUTS } from "./scoreFormula";

const data = JSON.parse(readFileSync(join(process.cwd(), "public", "ward_profiles.json"), "utf8")) as WardProfileData;
const model = scoreModelFrom(data)!;

describe("the published formula", () => {
  it("is fully published: weights, scale and standardisation constants", () => {
    expect(model).not.toBeNull();
    expect(Object.values(model.weights).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 6);
    for (const key of model.indicators) expect(model.std[key]).toBeGreaterThan(0);
  });

  it("returns every locality's published score and rank", () => {
    const scored = scoreAll(data, model.weights, model);
    for (const ward of data.wards) {
      const result = scored.find((s) => s.wardId === ward.ward_id)!;
      expect(result.score, ward.ward_id).toBeCloseTo(ward.hvi as number, 6);
      expect(result.rank, ward.ward_id).toBe(ward.rank);
    }
  });

  it("scores a locality that is average on everything at the baseline", () => {
    const result = computeScore(model.mean, model.weights, model);
    expect(result.score).toBeCloseTo(model.baseline, 9);
    for (const key of model.indicators) expect(result.points[key]).toBeCloseTo(0, 9);
  });

  it("breaks a score into points that add up to it", () => {
    const ward = data.wards[0];
    const result = computeScore(valuesFor(ward, model.indicators), model.weights, model);
    const summed = model.baseline + Object.values(result.points).reduce((s, p) => s + p, 0);
    expect(summed).toBeCloseTo(result.unclamped, 9);
  });

  it("declines to build a model from a profile file without the constants", () => {
    expect(scoreModelFrom({ ...data, indicator_stats: undefined })).toBeNull();
    expect(scoreModelFrom({ ...data, score_scale: undefined })).toBeNull();
  });
});

describe("changing an input", () => {
  const ward = data.wards[0];
  const base = computeScore(valuesFor(ward, model.indicators), model.weights, model).score;

  it("lowers the score when the surface is cooled", () => {
    const cooled = computeScore(valuesFor(ward, model.indicators, { LST_C: ward.LST_C - 2 }), model.weights, model);
    // Two degrees is 2 / std standard deviations, times the weight, times the scale.
    const expected = (model.scale * model.weights.LST_C * 2) / model.std.LST_C;
    expect(base - cooled.score).toBeCloseTo(expected, 6);
    expect(cooled.score).toBeLessThan(base);
  });

  it("lowers the score when green cover rises, because green cover protects", () => {
    const greener = computeScore(valuesFor(ward, model.indicators, { NDVI: ward.NDVI + 0.1 }), model.weights, model);
    expect(greener.score).toBeLessThan(base);
  });

  it("raises the score when the hospital is further away", () => {
    const further = computeScore(
      valuesFor(ward, model.indicators, { hospital_dist_m: ward.hospital_dist_m + 1000 }),
      model.weights,
      model,
    );
    expect(further.score).toBeGreaterThan(base);
  });

  it("re-ranks the city when one locality is edited", () => {
    const top = data.wards[0];
    const edited = scoreAll(data, model.weights, model, { [top.ward_id]: { pop_density_km2: 0 } });
    expect(edited.find((s) => s.wardId === top.ward_id)!.rank).toBeGreaterThan(1);
    expect(edited.filter((s) => s.rank === 1)).toHaveLength(1);
  });

  it("clamps at the ends of the scale and reports that it did", () => {
    const extreme = computeScore(valuesFor(ward, model.indicators, { pop_density_km2: 500000 }), model.weights, model);
    expect(extreme.score).toBe(100);
    expect(extreme.unclamped).toBeGreaterThan(100);
  });
});

describe("normaliseWeights", () => {
  it("turns any positive numbers into shares of one", () => {
    const weights = normaliseWeights({ LST_C: 30, NDVI: 10 }, ["LST_C", "NDVI"]);
    expect(weights.LST_C).toBeCloseTo(0.75, 9);
    expect(weights.NDVI).toBeCloseTo(0.25, 9);
  });

  it("falls back to equal weights when every slider is at zero", () => {
    const weights = normaliseWeights({ LST_C: 0, NDVI: 0 }, ["LST_C", "NDVI"]);
    expect(weights).toEqual({ LST_C: 0.5, NDVI: 0.5 });
  });

  it("changes the ranking when the weights change", () => {
    const equal = normaliseWeights({}, model.indicators);
    const published = scoreAll(data, model.weights, model);
    const rescored = scoreAll(data, equal, model);
    expect(rescored.some((s) => s.rank !== published.find((p) => p.wardId === s.wardId)!.rank)).toBe(true);
  });
});

describe("INDICATOR_INPUTS", () => {
  it("gives every published value room inside its input range", () => {
    for (const key of model.indicators) {
      const range = INDICATOR_INPUTS[key];
      for (const ward of data.wards) {
        expect(ward[key], `${ward.ward_id} ${key}`).toBeGreaterThanOrEqual(range.min);
        expect(ward[key], `${ward.ward_id} ${key}`).toBeLessThanOrEqual(range.max);
      }
    }
  });
});
