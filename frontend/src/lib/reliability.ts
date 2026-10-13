/**
 * How much the ranking depends on the weights.
 *
 * The weights come from a statistical analysis, and another reasonable method
 * would give different ones. So the honest question about any ranking built on
 * them is: if the weights were different, would the answer change? Two tests
 * answer it, and this file turns both into plain statements.
 *
 *   Nudge test       The data build re-ranks the city ten times, each time with
 *                    one factor's weight moved 20% up or down (stage 05,
 *                    `sensitivity.json`). Read here, not recomputed.
 *   Equal weights    The bluntest alternative there is: every factor counts
 *                    the same. Computed here from the published formula.
 *
 * Neither test says the ranking is right. They say how far it leans on a
 * choice that could have been made differently, which is a narrower and more
 * checkable claim.
 */

import { normaliseWeights, scoreAll, type ScoreModel } from "./scoreFormula";
import type { WardProfileData } from "./wardProfile";
import type { IndicatorKey } from "./wardTypes";

/** `public/sensitivity.json`, as stage 05 of the data build writes it. */
export type Sensitivity = {
  baseline_top5: string[];
  perturbation_pct: number;
  n_runs: number;
  mean_kendall_tau: number;
  mean_top5_overlap: number;
  all_top5_stable: boolean;
  runs: {
    indicator: IndicatorKey;
    /** "+20%" or "-20%". */
    perturbation: string;
    kendall_tau: number;
    top5_overlap: number;
    top5_ranking: string[];
  }[];
};

export type NudgeRun = {
  indicator: IndicatorKey;
  perturbation: string;
  /** How many of the published top five are still in the top five. */
  kept: number;
  /** Published top-five localities that dropped out. */
  left: string[];
  /** Localities that took their place. */
  entered: string[];
  /** Share of locality pairs still in the same order, 0 to 100. */
  pairsInSameOrderPct: number;
};

export type NudgeSummary = {
  topN: number;
  nudgePct: number;
  runs: NudgeRun[];
  /** Published top-five localities that stay in the top five in every run. */
  alwaysTop: string[];
  /** The rest of the published top five, with how many runs each survives. */
  sometimesTop: { wardId: string; runsKept: number }[];
  meanKept: number;
  worstKept: number;
  /** Mean share of locality pairs kept in the same order across the runs, 0 to 100. */
  meanPairsInSameOrderPct: number;
};

/**
 * Kendall's tau as the share of pairs two rankings agree on.
 *
 * Tau runs from -1 to 1 and means little to most readers. It is exactly
 * (agreeing pairs - disagreeing pairs) / all pairs, so (tau + 1) / 2 is the
 * share of pairs in the same order, which can be said in a sentence.
 */
export function pairsInSameOrderPct(kendallTau: number): number {
  return ((kendallTau + 1) / 2) * 100;
}

export function summariseNudges(sensitivity: Sensitivity): NudgeSummary {
  const baseline = sensitivity.baseline_top5;
  const runs: NudgeRun[] = sensitivity.runs.map((run) => ({
    indicator: run.indicator,
    perturbation: run.perturbation,
    kept: run.top5_ranking.filter((id) => baseline.includes(id)).length,
    left: baseline.filter((id) => !run.top5_ranking.includes(id)),
    entered: run.top5_ranking.filter((id) => !baseline.includes(id)),
    pairsInSameOrderPct: pairsInSameOrderPct(run.kendall_tau),
  }));

  const runsKept = (wardId: string) => sensitivity.runs.filter((run) => run.top5_ranking.includes(wardId)).length;
  const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

  return {
    topN: baseline.length,
    nudgePct: Math.round(sensitivity.perturbation_pct * 100),
    runs,
    alwaysTop: baseline.filter((id) => runsKept(id) === runs.length),
    sometimesTop: baseline
      .filter((id) => runsKept(id) < runs.length)
      .map((wardId) => ({ wardId, runsKept: runsKept(wardId) })),
    meanKept: mean(runs.map((r) => r.kept)),
    worstKept: runs.length ? Math.min(...runs.map((r) => r.kept)) : 0,
    meanPairsInSameOrderPct: mean(runs.map((r) => r.pairsInSameOrderPct)),
  };
}

export type EqualWeightCheck = {
  topN: number;
  /** The top N under equal weights, most concerning first. */
  top: string[];
  kept: number;
  left: string[];
  entered: string[];
  /** Localities whose rank moves by this many places or fewer, out of all of them. */
  withinThreePlaces: number;
  total: number;
  /** The locality that moves furthest, and by how many places (positive is up the ranking). */
  biggestMove: { wardId: string; from: number; to: number } | null;
};

/**
 * Re-ranks the city with every factor weighted the same and compares the
 * result with the published ranking.
 */
export function equalWeightCheck(data: WardProfileData, model: ScoreModel, topN = 5): EqualWeightCheck {
  const published = scoreAll(data, model.weights, model);
  const equal = scoreAll(data, normaliseWeights({}, model.indicators), model);
  const rankOf = (scores: typeof published) => new Map(scores.map((s) => [s.wardId, s.rank]));
  const before = rankOf(published);
  const after = rankOf(equal);

  const topOf = (scores: typeof published) =>
    [...scores].sort((a, b) => a.rank - b.rank || a.wardId.localeCompare(b.wardId)).slice(0, topN).map((s) => s.wardId);
  const publishedTop = topOf(published);
  const top = topOf(equal);

  let biggestMove: EqualWeightCheck["biggestMove"] = null;
  let withinThreePlaces = 0;
  for (const [wardId, from] of before) {
    const to = after.get(wardId) ?? from;
    if (Math.abs(to - from) <= 3) withinThreePlaces += 1;
    if (!biggestMove || Math.abs(to - from) > Math.abs(biggestMove.to - biggestMove.from)) biggestMove = { wardId, from, to };
  }

  return {
    topN,
    top,
    kept: top.filter((id) => publishedTop.includes(id)).length,
    left: publishedTop.filter((id) => !top.includes(id)),
    entered: top.filter((id) => !publishedTop.includes(id)),
    withinThreePlaces,
    total: before.size,
    biggestMove,
  };
}
