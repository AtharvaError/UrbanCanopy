/**
 * The scenario engine behind `/simulate`: pick wards, apply interventions, see
 * what the cited coefficients say would happen cell by cell.
 *
 * Like `coefficients.ts`, which it builds on, this is deliberately NOT a
 * trained model. It adds no new science, only bookkeeping: which cells an
 * intervention can physically reach, and what the published cooling does to
 * the index. Three rules decide reach, and each is this project's own stated
 * assumption rather than something a paper measured:
 *
 *   Trees        only in cells that pass the plantability filter (stage 06).
 *                Everywhere else the canopy term is zero, however far the
 *                slider is pushed. And only the canopy that is added counts:
 *                the slider is a target, each cell starts from the tree cover
 *                measured in it, and the cooling its existing trees already
 *                give is in today's temperature, so it is not counted again.
 *   Cool roofs   scaled by the cell's impervious share. The slider is an
 *                albedo increase on built-up surface, and a cell that is 30%
 *                built-up only raises its area albedo by 30% of it. Impervious
 *                cover stands in for roofed area; it is not a roof survey.
 *   Parks        capped at the cell's impervious share. Only built-up land can
 *                be converted to park; a cell that is already forest has
 *                nothing to convert.
 *
 * Cooling then moves the index through one indicator only. The coefficients
 * are air-temperature estimates and the index uses land surface temperature;
 * the estimate is subtracted from LST_C one for one, which is an assumption.
 * NDVI and impervious cover are held fixed even though greening would change
 * both, because no cited conversion from canopy percentage to either exists.
 * The other four indicators (population, children, slums, hospital distance)
 * are not things cooling changes at all, which is why a large cooling moves
 * the score by only a few points.
 */

import { canopyCoolingC, coolRoofCoolingC, pocketParkCoolingC } from "./coefficients";

/** A 1 km grid cell, reduced to what the scenario needs. */
export type ScenarioCell = {
  id: string;
  wardId: string;
  /** Published HVI, 0 to 100. */
  hvi: number;
  /** 0 to 100. */
  imperviousPct: number;
  plantable: boolean;
  /**
   * Share of the cell mapped as tree cover today, 0 to 100 (ESA WorldCover, 10 m).
   * It stands in for canopy cover and runs low where trees are narrower than a
   * pixel. Absent from builds made before the tree-cover baseline, where it
   * counts as zero.
   */
  treePct?: number;
  /** WorldPop density times cell area: a modelled surface, not a census count. */
  population: number;
};

export type ScenarioInputs = {
  /** Target canopy cover in treated plantable cells, 0 to 100. A cell already above it is left as it is. */
  canopyPct: number;
  /** Albedo increase on built-up surface, 0 to 1. */
  albedoIncrease: number;
  /** Share of cell area converted to park, 0 to 100. */
  parkAreaPct: number;
};

export type CellCooling = {
  canopyC: number;
  roofC: number;
  roofLowC: number;
  roofHighC: number;
  parkC: number;
  /** Canopy + cool-roof headline + park. */
  totalC: number;
};

const NO_COOLING: CellCooling = {
  canopyC: 0,
  roofC: 0,
  roofLowC: 0,
  roofHighC: 0,
  parkC: 0,
  totalC: 0,
};

/** What the interventions deliver in one treated cell, after the three reach rules. */
export function cellCooling(
  cell: Pick<ScenarioCell, "imperviousPct" | "plantable" | "treePct">,
  inputs: ScenarioInputs,
): CellCooling {
  const builtShare = Math.min(Math.max(cell.imperviousPct, 0), 100) / 100;
  const treesToday = Math.min(Math.max(cell.treePct ?? 0, 0), 100);
  // Raising canopy from today's cover to the target. A target below today's
  // cover changes nothing: the scenario plants trees, it does not fell them.
  const canopyC = cell.plantable
    ? canopyCoolingC(Math.max(inputs.canopyPct, treesToday)) - canopyCoolingC(treesToday)
    : 0;
  const roof = coolRoofCoolingC(Math.max(inputs.albedoIncrease, 0) * builtShare);
  const parkC = pocketParkCoolingC(Math.min(Math.max(inputs.parkAreaPct, 0), builtShare * 100));
  return {
    canopyC,
    roofC: roof.headlineC,
    roofLowC: roof.rangeLowC,
    roofHighC: roof.rangeHighC,
    parkC,
    totalC: canopyC + roof.headlineC + parkC,
  };
}

/**
 * HVI points lost per degree of land-surface cooling.
 *
 * The index is linear (stage 05): each cell's raw score is the sum of its
 * contributions, each contribution is weight x z-score, and the published HVI
 * is that raw score rescaled to 0-100 across all cells. So one degree off
 * LST_C lowers the raw score by weight/sigma, and the HVI by that over the raw
 * range, times 100. Both are recovered from the published cells themselves
 * rather than from a second copy of the weights that could drift from them.
 *
 * The scale is held at today's: a scenario is scored against the city as it
 * is, not re-normalised against the city it would produce.
 */
export function hviPointsPerDegree(
  rows: { lstC: number; contribLst: number; rawScore: number }[],
): number {
  if (rows.length < 2) return 0;
  const meanLst = rows.reduce((s, r) => s + r.lstC, 0) / rows.length;
  const meanContrib = rows.reduce((s, r) => s + r.contribLst, 0) / rows.length;
  let covariance = 0;
  let variance = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rows) {
    covariance += (r.lstC - meanLst) * (r.contribLst - meanContrib);
    variance += (r.lstC - meanLst) ** 2;
    lo = Math.min(lo, r.rawScore);
    hi = Math.max(hi, r.rawScore);
  }
  if (variance === 0 || hi === lo) return 0;
  return (covariance / variance / (hi - lo)) * 100;
}

/** Cells at or above this score fall in the map's two hottest bands (see `hvi.ts`). */
export const HIGH_VULNERABILITY_HVI = 65;

export type CellOutcome = CellCooling & {
  /** In a selected ward, whether or not any intervention reached it. */
  treated: boolean;
  hviAfter: number;
};

export type WardOutcome = {
  wardId: string;
  selected: boolean;
  cells: number;
  plantableCells: number;
  /** Mean measured tree cover across the ward's cells today, 0 to 100. */
  treePct: number;
  meanCoolingC: number;
  hviBefore: number;
  hviAfter: number;
  rankBefore: number;
  rankAfter: number;
};

export type ScenarioSummary = {
  cellsTreated: number;
  /** Treated cells where at least one intervention had any effect. */
  cellsCooled: number;
  plantableCellsTreated: number;
  /** Means over treated cells, so untouched cells do not dilute them. */
  meanCoolingC: number;
  meanCanopyC: number;
  meanRoofC: number;
  meanParkC: number;
  /** Mean total cooling at the two ends of Santamouris 2014's cool-roof range. */
  meanCoolingLowC: number;
  meanCoolingHighC: number;
  maxCoolingC: number;
  residentsInCooledCells: number;
  highCellsBefore: number;
  highCellsAfter: number;
};

export type ScenarioResult = {
  /** Aligned index for index with the cells passed in. */
  cells: CellOutcome[];
  /** Sorted by rank before, most vulnerable first. */
  wards: WardOutcome[];
  summary: ScenarioSummary;
};

/** Rank descending, ties sharing the lower number, as pandas `method="min"` does in stage 05. */
function rankDescending(values: Map<string, number>): Map<string, number> {
  const sorted = [...values.values()].sort((a, b) => b - a);
  const ranks = new Map<string, number>();
  for (const [id, value] of values) ranks.set(id, sorted.indexOf(value) + 1);
  return ranks;
}

export function runScenario(
  cells: readonly ScenarioCell[],
  selectedWardIds: ReadonlySet<string>,
  inputs: ScenarioInputs,
  pointsPerDegree: number,
): ScenarioResult {
  const outcomes: CellOutcome[] = cells.map((cell) => {
    const treated = selectedWardIds.has(cell.wardId);
    const cooling = treated ? cellCooling(cell, inputs) : NO_COOLING;
    return {
      ...cooling,
      treated,
      // The floor is the scale's own: the coolest cell today defines zero.
      hviAfter: Math.max(cell.hvi - cooling.totalC * pointsPerDegree, 0),
    };
  });

  type Tally = { cells: number; plantable: number; trees: number; cooling: number; before: number; after: number };
  const byWard = new Map<string, Tally>();
  cells.forEach((cell, i) => {
    const t = byWard.get(cell.wardId) ?? { cells: 0, plantable: 0, trees: 0, cooling: 0, before: 0, after: 0 };
    t.cells += 1;
    t.plantable += cell.plantable ? 1 : 0;
    t.trees += cell.treePct ?? 0;
    t.cooling += outcomes[i].totalC;
    t.before += cell.hvi;
    t.after += outcomes[i].hviAfter;
    byWard.set(cell.wardId, t);
  });

  // A ward's score is the mean of its cells, as in the stage 05 rollup.
  const rankBefore = rankDescending(new Map([...byWard].map(([id, t]) => [id, t.before / t.cells])));
  const rankAfter = rankDescending(new Map([...byWard].map(([id, t]) => [id, t.after / t.cells])));

  const wards: WardOutcome[] = [...byWard]
    .map(([wardId, t]) => ({
      wardId,
      selected: selectedWardIds.has(wardId),
      cells: t.cells,
      plantableCells: t.plantable,
      treePct: t.trees / t.cells,
      meanCoolingC: t.cooling / t.cells,
      hviBefore: t.before / t.cells,
      hviAfter: t.after / t.cells,
      rankBefore: rankBefore.get(wardId) ?? 0,
      rankAfter: rankAfter.get(wardId) ?? 0,
    }))
    .sort((a, b) => a.rankBefore - b.rankBefore || a.wardId.localeCompare(b.wardId));

  const summary: ScenarioSummary = {
    cellsTreated: 0,
    cellsCooled: 0,
    plantableCellsTreated: 0,
    meanCoolingC: 0,
    meanCanopyC: 0,
    meanRoofC: 0,
    meanParkC: 0,
    meanCoolingLowC: 0,
    meanCoolingHighC: 0,
    maxCoolingC: 0,
    residentsInCooledCells: 0,
    highCellsBefore: 0,
    highCellsAfter: 0,
  };
  cells.forEach((cell, i) => {
    const o = outcomes[i];
    if (cell.hvi >= HIGH_VULNERABILITY_HVI) summary.highCellsBefore += 1;
    if (o.hviAfter >= HIGH_VULNERABILITY_HVI) summary.highCellsAfter += 1;
    if (!o.treated) return;
    summary.cellsTreated += 1;
    summary.plantableCellsTreated += cell.plantable ? 1 : 0;
    summary.meanCoolingC += o.totalC;
    summary.meanCanopyC += o.canopyC;
    summary.meanRoofC += o.roofC;
    summary.meanParkC += o.parkC;
    summary.meanCoolingLowC += o.canopyC + o.roofLowC + o.parkC;
    summary.meanCoolingHighC += o.canopyC + o.roofHighC + o.parkC;
    summary.maxCoolingC = Math.max(summary.maxCoolingC, o.totalC);
    if (o.totalC > 0) {
      summary.cellsCooled += 1;
      summary.residentsInCooledCells += cell.population;
    }
  });
  if (summary.cellsTreated > 0) {
    summary.meanCoolingC /= summary.cellsTreated;
    summary.meanCanopyC /= summary.cellsTreated;
    summary.meanRoofC /= summary.cellsTreated;
    summary.meanParkC /= summary.cellsTreated;
    summary.meanCoolingLowC /= summary.cellsTreated;
    summary.meanCoolingHighC /= summary.cellsTreated;
  }

  return { cells: outcomes, wards, summary };
}

/**
 * Cooling ramp for the scenario map: ColorBrewer Blues, one hue, light to dark.
 * Deliberately not the HVI ramp in `hvi.ts`. That one means vulnerability and is
 * locked; degrees of cooling are a different quantity and must not borrow its
 * colours.
 */
export const COOLING_COLORS = ["#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c"] as const;

/** Upper bound of each bin in degrees C, aligned 1:1 with COOLING_COLORS. */
export const COOLING_BIN_MAX = [0.5, 1, 1.5, 2, Infinity] as const;

/** Null where nothing was cooled, so the map can draw those cells as neutral. */
export function coolingColor(coolingC: number): string | null {
  if (!(coolingC > 0)) return null;
  for (let i = 0; i < COOLING_BIN_MAX.length; i++) {
    if (coolingC <= COOLING_BIN_MAX[i]) return COOLING_COLORS[i];
  }
  return COOLING_COLORS[COOLING_COLORS.length - 1];
}

export type ScenarioPreset = { id: string; label: string; description: string; inputs: ScenarioInputs };

/**
 * One-click starting points. They are slider positions, nothing more: each
 * stays inside the slider ceilings in `coefficients.ts`, and none is a
 * recommendation.
 */
export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "cool-roofs-first",
    label: "Cool roofs first",
    description: "Reflective roofs only. Works wherever there are buildings.",
    inputs: { canopyPct: 0, albedoIncrease: 0.2, parkAreaPct: 0 },
  },
  {
    id: "green-cover",
    label: "Green cover",
    description: "Dense canopy where planting is ecologically sound, plus pocket parks.",
    inputs: { canopyPct: 70, albedoIncrease: 0, parkAreaPct: 15 },
  },
  {
    id: "balanced",
    label: "Balanced mix",
    description: "Some of each: canopy, cool roofs and parks.",
    inputs: { canopyPct: 60, albedoIncrease: 0.1, parkAreaPct: 10 },
  },
  {
    id: "ceiling",
    label: "Everything at its ceiling",
    description: "Every slider at its maximum. An upper bound, not a plan.",
    inputs: { canopyPct: 80, albedoIncrease: 0.3, parkAreaPct: 60 },
  },
];

/** The preset whose sliders match exactly, so the UI can show which one is active. */
export function matchingPresetId(inputs: ScenarioInputs): string | null {
  const match = SCENARIO_PRESETS.find(
    (p) =>
      p.inputs.canopyPct === inputs.canopyPct &&
      Math.abs(p.inputs.albedoIncrease - inputs.albedoIncrease) < 1e-9 &&
      p.inputs.parkAreaPct === inputs.parkAreaPct,
  );
  return match?.id ?? null;
}
