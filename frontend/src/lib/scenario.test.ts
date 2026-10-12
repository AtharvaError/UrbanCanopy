/**
 * The scenario engine is bookkeeping on top of `coefficients.ts`, so what needs
 * locking is the bookkeeping: that an intervention only lands where it
 * physically can, that the index moves by exactly what stage 05's own
 * arithmetic implies, and that no slider position can claim more cooling than
 * the cited papers allow. The fixtures are the real published cells, because
 * the reach rules only mean anything against the real plantability and
 * impervious layers.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeatureCollection, Geometry } from "geojson";
import { buildScenarioData, geometryAreaKm2 } from "./scenarioData";
import {
  cellCooling,
  hviPointsPerDegree,
  matchingPresetId,
  runScenario,
  HIGH_VULNERABILITY_HVI,
  SCENARIO_PRESETS,
  type ScenarioInputs,
} from "./scenario";
import { ACTIVE_CITY } from "./city";
import { MAX_REALISTIC_CANOPY_PCT, MAX_REALISTIC_PARK_PCT } from "./coefficients";
import type { WardProps } from "./wardTypes";

function readPublic<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "public", name), "utf8")) as T;
}

type CellsGeo = Parameters<typeof buildScenarioData>[0];
const cellsGeo = readPublic<CellsGeo>("cells_nbs.geojson");
const wardsGeo = readPublic<FeatureCollection<Geometry, WardProps>>("wards_hvi.geojson");
const data = buildScenarioData(cellsGeo, wardsGeo)!;

const NOTHING: ScenarioInputs = { canopyPct: 0, albedoIncrease: 0, parkAreaPct: 0 };
const CEILING: ScenarioInputs = { canopyPct: 80, albedoIncrease: 0.3, parkAreaPct: 60 };
const ALL_WARDS = new Set(data.cells.map((c) => c.wardId));
/** Any one published area: the tests below need a real id, not a particular one. */
const ONE_AREA = data.cells[0].wardId;

describe("cellCooling reach rules", () => {
  it("gives no canopy cooling to a cell that fails the plantability filter", () => {
    const blocked = cellCooling({ imperviousPct: 50, plantable: false }, CEILING);
    const allowed = cellCooling({ imperviousPct: 50, plantable: true }, CEILING);
    expect(blocked.canopyC).toBe(0);
    expect(allowed.canopyC).toBeCloseTo(1.0, 10);
  });

  it("scales cool roofs by the built-up share", () => {
    // +0.2 albedo on the built surface of a half-built cell is +0.1 across the
    // cell, which is Santamouris' 0.6 K headline.
    expect(cellCooling({ imperviousPct: 50, plantable: false }, { ...NOTHING, albedoIncrease: 0.2 }).roofC)
      .toBeCloseTo(0.6, 10);
    expect(cellCooling({ imperviousPct: 100, plantable: false }, { ...NOTHING, albedoIncrease: 0.2 }).roofC)
      .toBeCloseTo(1.2, 10);
  });

  it("gives a cell with no built-up land nothing from roofs or parks", () => {
    const forest = cellCooling({ imperviousPct: 0, plantable: false }, CEILING);
    expect(forest.roofC).toBe(0);
    expect(forest.parkC).toBe(0);
    expect(forest.totalC).toBe(0);
  });

  it("caps park conversion at the built-up share", () => {
    const tenPercentBuilt = cellCooling({ imperviousPct: 10, plantable: false }, { ...NOTHING, parkAreaPct: 60 });
    expect(tenPercentBuilt.parkC).toBeCloseTo(0.094, 10);
  });

  it("keeps the headline inside the cool-roof range", () => {
    const c = cellCooling({ imperviousPct: 80, plantable: true }, CEILING);
    expect(c.roofC).toBeGreaterThanOrEqual(c.roofLowC - 1e-9);
    expect(c.roofC).toBeLessThanOrEqual(c.roofHighC + 1e-9);
    expect(c.totalC).toBeCloseTo(c.canopyC + c.roofC + c.parkC, 10);
  });
});

describe("hviPointsPerDegree", () => {
  it("recovers weight/sigma over the raw range from the published cells", () => {
    // Recomputed here from the PCA log, a file the engine does not read, so the
    // two cannot agree by construction.
    const pca = readPublic<{ weights: Record<string, number> }>("hvi_pca_log.json");
    const lst = cellsGeo.features.map((f) => f.properties.LST_C as number);
    const mean = lst.reduce((s, x) => s + x, 0) / lst.length;
    const sigma = Math.sqrt(lst.reduce((s, x) => s + (x - mean) ** 2, 0) / lst.length);
    const raw = cellsGeo.features.map((f) =>
      Object.keys(pca.weights).reduce((s, k) => s + Number(f.properties[`contrib_${k}`]), 0),
    );
    const expected = (pca.weights.LST_C / sigma / (Math.max(...raw) - Math.min(...raw))) * 100;
    expect(data.pointsPerDegree).toBeCloseTo(expected, 8);
    expect(data.pointsPerDegree).toBeGreaterThan(0);
  });

  it("returns zero rather than dividing by zero on degenerate input", () => {
    expect(hviPointsPerDegree([])).toBe(0);
    expect(hviPointsPerDegree([{ lstC: 30, contribLst: 0.1, rawScore: 0.2 }])).toBe(0);
    expect(
      hviPointsPerDegree([
        { lstC: 30, contribLst: 0.1, rawScore: 0.2 },
        { lstC: 30, contribLst: 0.1, rawScore: 0.5 },
      ]),
    ).toBe(0);
  });
});

describe("runScenario on the published cells", () => {
  it("reproduces every published ward score and rank when nothing is done", () => {
    const result = runScenario(data.cells, ALL_WARDS, NOTHING, data.pointsPerDegree);
    expect(result.wards).toHaveLength(wardsGeo.features.length);
    for (const f of wardsGeo.features) {
      const ward = result.wards.find((w) => w.wardId === f.properties.ward_id)!;
      expect(ward.hviBefore).toBeCloseTo(f.properties.HVI as number, 6);
      expect(ward.hviAfter).toBeCloseTo(ward.hviBefore, 10);
      expect(ward.rankBefore).toBe(f.properties.rank);
      expect(ward.rankAfter).toBe(ward.rankBefore);
    }
    expect(result.summary.meanCoolingC).toBe(0);
    expect(result.summary.cellsCooled).toBe(0);
    expect(result.summary.highCellsAfter).toBe(result.summary.highCellsBefore);
  });

  it("leaves unselected wards exactly as published", () => {
    const result = runScenario(data.cells, new Set([ONE_AREA]), CEILING, data.pointsPerDegree);
    data.cells.forEach((cell, i) => {
      if (cell.wardId === ONE_AREA) return;
      expect(result.cells[i].treated).toBe(false);
      expect(result.cells[i].totalC).toBe(0);
      expect(result.cells[i].hviAfter).toBe(cell.hvi);
    });
    expect(result.summary.cellsTreated).toBe(data.cells.filter((c) => c.wardId === ONE_AREA).length);
    expect(result.summary.cellsTreated).toBeGreaterThan(0);
  });

  it("lowers a cell's score by its cooling times the index's own sensitivity", () => {
    const result = runScenario(data.cells, ALL_WARDS, CEILING, data.pointsPerDegree);
    data.cells.forEach((cell, i) => {
      const o = result.cells[i];
      expect(o.hviAfter).toBeCloseTo(Math.max(cell.hvi - o.totalC * data.pointsPerDegree, 0), 10);
      expect(o.hviAfter).toBeLessThanOrEqual(cell.hvi);
      expect(o.hviAfter).toBeGreaterThanOrEqual(0);
    });
  });

  it("never claims more cooling than the three papers allow together", () => {
    // Canopy tops out at 1.0 C (Ziter), a fully built cell at +0.3 albedo at
    // 1.8 C (Santamouris headline), and 60% park at 0.564 C (Bowler).
    const ceiling = 1.0 + 1.8 + 0.94 * (MAX_REALISTIC_PARK_PCT / 100);
    const result = runScenario(data.cells, ALL_WARDS, CEILING, data.pointsPerDegree);
    expect(result.summary.maxCoolingC).toBeLessThanOrEqual(ceiling + 1e-9);
    expect(result.summary.meanCoolingC).toBeLessThanOrEqual(result.summary.maxCoolingC);
    expect(result.summary.meanCoolingLowC).toBeLessThanOrEqual(result.summary.meanCoolingC + 1e-9);
    expect(result.summary.meanCoolingHighC).toBeGreaterThanOrEqual(result.summary.meanCoolingC - 1e-9);
  });

  it("can only reduce the count of high-vulnerability cells", () => {
    const result = runScenario(data.cells, ALL_WARDS, CEILING, data.pointsPerDegree);
    expect(result.summary.highCellsBefore).toBe(
      data.cells.filter((c) => c.hvi >= HIGH_VULNERABILITY_HVI).length,
    );
    expect(result.summary.highCellsAfter).toBeLessThan(result.summary.highCellsBefore);
  });

  it("plants trees only in plantable cells, however far the slider goes", () => {
    const result = runScenario(
      data.cells,
      ALL_WARDS,
      { ...NOTHING, canopyPct: MAX_REALISTIC_CANOPY_PCT },
      data.pointsPerDegree,
    );
    const plantable = data.cells.filter((c) => c.plantable).length;
    expect(result.summary.cellsCooled).toBe(plantable);
    expect(result.summary.plantableCellsTreated).toBe(plantable);
    data.cells.forEach((cell, i) => {
      expect(result.cells[i].canopyC > 0).toBe(cell.plantable);
    });
  });

  it("counts residents only in cells an intervention actually reached", () => {
    const everyone = data.cells.reduce((s, c) => s + c.population, 0);
    const roofs = runScenario(data.cells, ALL_WARDS, { ...NOTHING, albedoIncrease: 0.1 }, data.pointsPerDegree);
    const unbuilt = data.cells.filter((c) => c.imperviousPct === 0).reduce((s, c) => s + c.population, 0);
    expect(roofs.summary.residentsInCooledCells).toBe(everyone - unbuilt);
  });
});

describe("scenario presets", () => {
  it("stay inside the slider ceilings", () => {
    for (const preset of SCENARIO_PRESETS) {
      expect(preset.inputs.canopyPct).toBeLessThanOrEqual(MAX_REALISTIC_CANOPY_PCT);
      expect(preset.inputs.parkAreaPct).toBeLessThanOrEqual(MAX_REALISTIC_PARK_PCT);
      expect(preset.inputs.albedoIncrease).toBeLessThanOrEqual(0.3);
    }
  });

  it("are recognised from their own slider positions and nothing else", () => {
    for (const preset of SCENARIO_PRESETS) {
      expect(matchingPresetId(preset.inputs)).toBe(preset.id);
    }
    expect(matchingPresetId({ canopyPct: 41, albedoIncrease: 0.07, parkAreaPct: 3 })).toBeNull();
  });
});

describe("buildScenarioData", () => {
  it("keeps every published cell and ward", () => {
    expect(data.cells).toHaveLength(cellsGeo.features.length);
    expect(data.wards).toHaveLength(wardsGeo.features.length);
    expect(new Set(data.cells.map((c) => c.id)).size).toBe(data.cells.length);
  });

  it("draws every shape inside the viewBox", () => {
    for (const shape of [...data.cells, ...data.wards]) {
      expect(shape.d.startsWith("M")).toBe(true);
      const numbers = shape.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      for (let i = 0; i < numbers.length; i += 2) {
        expect(numbers[i]).toBeGreaterThanOrEqual(0);
        expect(numbers[i]).toBeLessThanOrEqual(data.viewBox.width + 0.1);
        expect(numbers[i + 1]).toBeGreaterThanOrEqual(0);
        expect(numbers[i + 1]).toBeLessThanOrEqual(data.viewBox.height + 0.1);
      }
    }
  });

  it("measures an unclipped cell as one grid square", () => {
    // The largest cell is one the boundary did not clip, so it is the grid's
    // own square: the configured side, squared.
    const largest = Math.max(...cellsGeo.features.map((f) => geometryAreaKm2(f.geometry)));
    const expected = (ACTIVE_CITY.cellSizeM / 1000) ** 2;
    expect(largest).toBeGreaterThan(expected * 0.97);
    expect(largest).toBeLessThan(expected * 1.03);
  });

  it("puts the city's modelled population in a plausible range", () => {
    // A city of a few hundred thousand to a few tens of millions. The page
    // reports a share of this total and never a headcount, so this only guards
    // against an area or unit slip of an order of magnitude.
    const total = data.cells.reduce((s, c) => s + c.population, 0);
    expect(total).toBeGreaterThan(300_000);
    expect(total).toBeLessThan(40_000_000);
  });

  it("returns null when no cell carries a score", () => {
    expect(buildScenarioData({ type: "FeatureCollection", features: [] }, wardsGeo)).toBeNull();
  });
});
