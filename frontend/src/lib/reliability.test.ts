/**
 * The reliability panel reports what two tests found. These tests check the
 * reporting: that it counts the runs correctly, names the locality that does
 * move, and does not round a mixed result up to "stable".
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { equalWeightCheck, pairsInSameOrderPct, summariseNudges, type Sensitivity } from "./reliability";
import { scoreAll, scoreModelFrom } from "./scoreFormula";
import type { WardProfileData } from "./wardProfile";

const read = <T,>(name: string) => JSON.parse(readFileSync(join(process.cwd(), "public", name), "utf-8")) as T;

const run = (indicator: string, perturbation: string, top5: string[], tau = 1) =>
  ({ indicator, perturbation, kendall_tau: tau, top5_overlap: 0, top5_ranking: top5 }) as Sensitivity["runs"][number];

const made: Sensitivity = {
  baseline_top5: ["A", "B", "C", "D", "E"],
  perturbation_pct: 0.2,
  n_runs: 4,
  mean_kendall_tau: 0,
  mean_top5_overlap: 0,
  all_top5_stable: false,
  runs: [
    run("LST_C", "+20%", ["A", "B", "C", "D", "E"], 1),
    run("LST_C", "-20%", ["A", "B", "C", "D", "F"], 0.8),
    run("NDVI", "+20%", ["B", "A", "C", "D", "F"], 0.6),
    run("NDVI", "-20%", ["A", "B", "C", "G", "F"], 0.6),
  ],
};

describe("pairsInSameOrderPct", () => {
  it("turns Kendall's tau into a share of pairs", () => {
    expect(pairsInSameOrderPct(1)).toBe(100);
    expect(pairsInSameOrderPct(0)).toBe(50);
    expect(pairsInSameOrderPct(-1)).toBe(0);
    expect(pairsInSameOrderPct(0.9)).toBeCloseTo(95, 10);
  });
});

describe("summariseNudges", () => {
  const summary = summariseNudges(made);

  it("counts what each run kept from its own top five, not from a stored figure", () => {
    // The stored top5_overlap in the made-up runs is 0 on purpose.
    expect(summary.runs.map((r) => r.kept)).toEqual([5, 4, 4, 3]);
    expect(summary.meanKept).toBe(4);
    expect(summary.worstKept).toBe(3);
  });

  it("names who left and who came in", () => {
    expect(summary.runs[1]).toMatchObject({ left: ["E"], entered: ["F"] });
    expect(summary.runs[3]).toMatchObject({ left: ["D", "E"], entered: ["G", "F"] });
    expect(summary.runs[0]).toMatchObject({ left: [], entered: [] });
  });

  it("treats a reshuffle inside the top five as kept", () => {
    expect(summary.runs[2].kept).toBe(4);
    expect(summary.runs[2].left).toEqual(["E"]);
  });

  it("separates the localities that never leave from those that sometimes do", () => {
    expect(summary.alwaysTop).toEqual(["A", "B", "C"]);
    expect(summary.sometimesTop).toEqual([
      { wardId: "D", runsKept: 3 },
      { wardId: "E", runsKept: 1 },
    ]);
  });

  it("averages pair agreement across the runs", () => {
    expect(summary.meanPairsInSameOrderPct).toBeCloseTo((100 + 90 + 80 + 80) / 4, 10);
    expect(summary.nudgePct).toBe(20);
  });
});

describe("on the published data", () => {
  const sensitivity = read<Sensitivity>("sensitivity.json");
  const data = read<WardProfileData>("ward_profiles.json");
  const model = scoreModelFrom(data)!;
  const summary = summariseNudges(sensitivity);

  it("agrees with the figures the data build wrote", () => {
    expect(summary.runs.length).toBe(sensitivity.n_runs);
    expect(summary.meanKept).toBeCloseTo(sensitivity.mean_top5_overlap, 10);
    expect(summary.meanPairsInSameOrderPct).toBeCloseTo(pairsInSameOrderPct(sensitivity.mean_kendall_tau), 10);
    summary.runs.forEach((r, i) => expect(r.kept).toBe(sensitivity.runs[i].top5_overlap));
  });

  it("does not call the top five stable when a run changes it", () => {
    const everyRunKeepsAll = summary.runs.every((r) => r.kept === summary.topN);
    expect(everyRunKeepsAll).toBe(sensitivity.all_top5_stable);
    expect(summary.alwaysTop.length + summary.sometimesTop.length).toBe(summary.topN);
    if (!everyRunKeepsAll) expect(summary.sometimesTop.length).toBeGreaterThan(0);
  });

  it("tests the same top five the site publishes", () => {
    const published = [...data.wards].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 5).map((w) => w.ward_id);
    expect(sensitivity.baseline_top5).toEqual(published);
  });

  it("re-ranks every locality under equal weights and reports it consistently", () => {
    const equal = equalWeightCheck(data, model);
    expect(equal.total).toBe(data.wards.length);
    expect(equal.top.length).toBe(5);
    expect(equal.kept + equal.left.length).toBe(5);
    expect(equal.left.length).toBe(equal.entered.length);
    expect(equal.withinThreePlaces).toBeLessThanOrEqual(equal.total);
    // The published weights are close to equal already, so most of the top five should survive.
    expect(equal.kept).toBeGreaterThanOrEqual(3);
  });

  it("reproduces the published ranking when given the published weights", () => {
    // The equal-weight comparison is only meaningful if its "before" is the real ranking.
    const scores = scoreAll(data, model.weights, model);
    for (const ward of data.wards) {
      expect(scores.find((s) => s.wardId === ward.ward_id)!.rank).toBe(ward.rank);
    }
  });
});
