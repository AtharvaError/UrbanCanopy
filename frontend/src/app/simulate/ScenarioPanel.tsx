"use client";

import { useCallback, useMemo, useState } from "react";
import { Sun, TreePine, Trees } from "lucide-react";
import Card, { StepCard } from "../components/Card";
import CoefficientSparkline from "../components/CoefficientSparkline";
import ScenarioMap from "./ScenarioMap";
import {
  CANOPY_THRESHOLD_PCT,
  MAX_REALISTIC_CANOPY_PCT,
  MAX_REALISTIC_PARK_PCT,
} from "@/lib/coefficients";
import { HVI_BIN_MAX, HVI_COLORS, hviColor } from "@/lib/hvi";
import {
  COOLING_BIN_MAX,
  COOLING_COLORS,
  HIGH_VULNERABILITY_HVI,
  SCENARIO_PRESETS,
  coolingColor,
  matchingPresetId,
  runScenario,
  type ScenarioInputs,
} from "@/lib/scenario";
import type { ScenarioData } from "@/lib/scenarioData";
import { ACTIVE_CITY, AREA_CAVEAT } from "@/lib/city";

/**
 * The scenario builder: choose wards, set interventions, read the result on a
 * before-and-after map of the real 1 km cells.
 *
 * Every number comes from `lib/scenario.ts`, which is the cited estimator in
 * `lib/coefficients.ts` plus three stated reach rules. Nothing here is fitted.
 */

const DEFAULT_PRESET = SCENARIO_PRESETS.find((p) => p.id === "balanced") ?? SCENARIO_PRESETS[0];
const NO_WARDS: ReadonlySet<string> = new Set();
const NOTHING: ScenarioInputs = { canopyPct: 0, albedoIncrease: 0, parkAreaPct: 0 };

/** Drawn where a cell was not cooled, on the cooling view. */
const UNCOOLED_FILL = "var(--muted)";

function binLabels(maxes: readonly number[], unit: string): string[] {
  return maxes.map((max, i) => {
    const min = i === 0 ? 0 : maxes[i - 1];
    return max === Infinity ? `${min}${unit}+` : `${min} to ${max}${unit}`;
  });
}

function Legend({ title, colors, labels }: { title: string; colors: readonly string[]; labels: string[] }) {
  return (
    <div>
      <p className="text-xs font-medium text-foreground">{title}</p>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {colors.map((color, i) => (
          <li key={color} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
            {labels[i]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PillButton({
  pressed,
  onClick,
  children,
  title,
}: {
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={title}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        pressed
          ? "border-brand-teal bg-brand-teal/15 text-foreground"
          : "border-border text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function ScenarioPanel({ data }: { data: ScenarioData }) {
  const { cells, wards, viewBox, pointsPerDegree } = data;

  // The published ranking, recomputed from the cells so the picker, the table
  // and the "top 5" shortcut all read the same order.
  const baseline = useMemo(
    () => runScenario(cells, NO_WARDS, NOTHING, pointsPerDegree),
    [cells, pointsPerDegree],
  );
  const rankedWardIds = useMemo(() => baseline.wards.map((w) => w.wardId), [baseline]);

  // Residents are reported as a share of this total, never as a headcount. The
  // density surface is modelled and its city total runs well above the census,
  // but a bias that scales every cell alike cancels out of a ratio.
  const cityPopulation = useMemo(() => cells.reduce((sum, c) => sum + c.population, 0), [cells]);

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(rankedWardIds.slice(0, 10)));
  const [inputs, setInputs] = useState<ScenarioInputs>(DEFAULT_PRESET.inputs);
  // Opens on cooling: a few degrees rarely moves a cell across a 15-point
  // score band, so the score view can look unchanged at first glance.
  const [view, setView] = useState<"after" | "cooling">("cooling");
  const [hovered, setHovered] = useState<number | null>(null);

  const result = useMemo(
    () => runScenario(cells, selected, inputs, pointsPerDegree),
    [cells, selected, inputs, pointsPerDegree],
  );

  const toggleWard = useCallback((wardId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(wardId)) next.delete(wardId);
      else next.add(wardId);
      return next;
    });
  }, []);

  const todayFills = useMemo(() => cells.map((c) => hviColor(c.hvi)), [cells]);
  const scenarioFills = useMemo(
    () =>
      result.cells.map((o) =>
        view === "after" ? hviColor(o.hviAfter) : (coolingColor(o.totalC) ?? UNCOOLED_FILL),
      ),
    [result, view],
  );

  const { summary } = result;
  const activePreset = matchingPresetId(inputs);
  const selectedWards = result.wards.filter((w) => w.selected);
  const meanScoreDrop =
    selectedWards.length > 0
      ? selectedWards.reduce((s, w) => s + (w.hviBefore - w.hviAfter), 0) / selectedWards.length
      : 0;
  const treeBlockedCells = summary.cellsTreated - summary.plantableCellsTreated;

  const hoveredCell = hovered === null ? null : cells[hovered];
  const hoveredOutcome = hovered === null ? null : result.cells[hovered];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
        <div className="space-y-6">
          <StepCard
            step={1}
            title="Where"
            description="Pick the localities to treat. Click them here or on either map."
          >
            <div className="flex flex-wrap gap-2">
              <PillButton onClick={() => setSelected(new Set(rankedWardIds.slice(0, 5)))}>
                5 most vulnerable
              </PillButton>
              <PillButton onClick={() => setSelected(new Set(rankedWardIds.slice(0, 10)))}>Top 10</PillButton>
              <PillButton onClick={() => setSelected(new Set(rankedWardIds))}>All {rankedWardIds.length}</PillButton>
              <PillButton onClick={() => setSelected(new Set())}>Clear</PillButton>
            </div>
            {/* Locality names do not fit a grid of chips the way ward codes
                did, so this is a two-column list that scrolls, most vulnerable
                first. */}
            <ul
              className="ward-scroll mt-4 grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1"
              aria-label="Localities, most vulnerable first"
            >
              {baseline.wards.map((ward) => {
                const isSelected = selected.has(ward.wardId);
                return (
                  <li key={ward.wardId}>
                    <button
                      type="button"
                      onClick={() => toggleWard(ward.wardId)}
                      aria-pressed={isSelected}
                      aria-label={`${ward.wardId}, rank ${ward.rankBefore}`}
                      title={`Rank ${ward.rankBefore}`}
                      className={`flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isSelected
                          ? "border-brand-teal bg-brand-teal/15 text-foreground"
                          : "border-border text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      }`}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ backgroundColor: hviColor(ward.hviBefore) }}
                        aria-hidden
                      />
                      <span className="truncate">{ward.wardId}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              {selected.size} of {baseline.wards.length} localities selected, {summary.cellsTreated} of{" "}
              {cells.length} cells.
            </p>
          </StepCard>

          <StepCard step={2} title="What" description="Start from a preset, then adjust.">
            <div className="flex flex-wrap gap-2">
              {SCENARIO_PRESETS.map((preset) => (
                <PillButton
                  key={preset.id}
                  pressed={activePreset === preset.id}
                  onClick={() => setInputs(preset.inputs)}
                  title={preset.description}
                >
                  {preset.label}
                </PillButton>
              ))}
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <label htmlFor="canopy" className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <TreePine className="h-4 w-4 text-brand-emerald" aria-hidden />
                  Tree canopy cover
                </label>
                <input
                  id="canopy"
                  type="range"
                  min={0}
                  max={MAX_REALISTIC_CANOPY_PCT}
                  step={1}
                  value={inputs.canopyPct}
                  onChange={(e) => setInputs({ ...inputs, canopyPct: Number(e.target.value) })}
                  className="mt-2 w-full accent-brand-teal"
                />
                <p className="mt-1 font-mono text-sm text-muted-foreground">{inputs.canopyPct}% cover</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Only in cells that pass the plantability filter. Ziter et al. 2019 found negligible
                  daytime cooling below ~{CANOPY_THRESHOLD_PCT}% canopy.
                </p>
              </div>

              <div>
                <label htmlFor="albedo" className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sun className="h-4 w-4 text-brand-teal" aria-hidden />
                  Cool-roof albedo increase
                </label>
                <input
                  id="albedo"
                  type="range"
                  min={0}
                  max={0.3}
                  step={0.01}
                  value={inputs.albedoIncrease}
                  onChange={(e) => setInputs({ ...inputs, albedoIncrease: Number(e.target.value) })}
                  className="mt-2 w-full accent-brand-teal"
                />
                <p className="mt-1 font-mono text-sm text-muted-foreground">
                  +{inputs.albedoIncrease.toFixed(2)} albedo
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  On built-up surface, so each cell gets it in proportion to its impervious share.
                  Santamouris 2014&apos;s city-scale range; Li, Bou-Zeid &amp; Oppenheimer 2014 supports
                  treating it as roughly linear.
                </p>
              </div>

              <div>
                <label htmlFor="park" className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Trees className="h-4 w-4 text-brand-emerald" aria-hidden />
                  Pocket-park coverage
                </label>
                <input
                  id="park"
                  type="range"
                  min={0}
                  max={MAX_REALISTIC_PARK_PCT}
                  step={1}
                  value={inputs.parkAreaPct}
                  onChange={(e) => setInputs({ ...inputs, parkAreaPct: Number(e.target.value) })}
                  className="mt-2 w-full accent-brand-teal"
                />
                <p className="mt-1 font-mono text-sm text-muted-foreground">{inputs.parkAreaPct}% of cell area</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Capped at each cell&apos;s built-up share: only built land can become a park. Bowler et
                  al. 2010 found parks average ~0.94°C cooler than their surroundings by day.
                </p>
              </div>
            </div>
          </StepCard>
        </div>

        <StepCard
          step={3}
          title="Result"
          description={`Each square is one ${ACTIVE_CITY.cellLabel} cell. Selected localities are outlined.`}
        >
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex h-7 items-center">
                <h4 className="text-sm font-semibold text-foreground">Today</h4>
              </div>
              <div className="mx-auto mt-2 max-w-[20rem]">
                <ScenarioMap
                  label={`Heat vulnerability today, by ${ACTIVE_CITY.cellLabel} cell`}
                  cells={cells}
                  wards={wards}
                  viewBox={viewBox}
                  fills={todayFills}
                  selected={selected}
                  onToggleWard={toggleWard}
                  onHoverCell={setHovered}
                />
              </div>
            </div>
            <div>
              <div className="flex h-7 items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-foreground">With this scenario</h4>
                <div className="flex gap-1" role="group" aria-label="What the scenario map shows">
                  <PillButton pressed={view === "after"} onClick={() => setView("after")}>
                    Score
                  </PillButton>
                  <PillButton pressed={view === "cooling"} onClick={() => setView("cooling")}>
                    Cooling
                  </PillButton>
                </div>
              </div>
              <div className="mx-auto mt-2 max-w-[20rem]">
                <ScenarioMap
                  label={
                    view === "after"
                      ? `Heat vulnerability under this scenario, by ${ACTIVE_CITY.cellLabel} cell`
                      : `Estimated cooling under this scenario, by ${ACTIVE_CITY.cellLabel} cell`
                  }
                  cells={cells}
                  wards={wards}
                  viewBox={viewBox}
                  fills={scenarioFills}
                  selected={selected}
                  onToggleWard={toggleWard}
                  onHoverCell={setHovered}
                />
              </div>
            </div>
          </div>

          <p className="mt-4 min-h-10 text-xs leading-5 text-muted-foreground" aria-live="off">
            {hoveredCell && hoveredOutcome ? (
              <>
                <span className="font-medium text-foreground">{hoveredCell.wardId}</span>. Cell score{" "}
                <span className="font-mono text-foreground">
                  {hoveredCell.hvi.toFixed(1)} to {hoveredOutcome.hviAfter.toFixed(1)}
                </span>
                , cooling <span className="font-mono text-foreground">{hoveredOutcome.totalC.toFixed(2)}°C</span>
                . {Math.round(hoveredCell.imperviousPct)}% built-up,{" "}
                {hoveredCell.plantable ? "plantable" : "not plantable"}.
              </>
            ) : (
              "Hover a cell to read it. Click a cell to add or remove its locality."
            )}
          </p>

          <div className="mt-3 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <Legend
              title="Heat vulnerability (0 to 100)"
              colors={HVI_COLORS}
              labels={binLabels(HVI_BIN_MAX, "")}
            />
            <Legend
              title="Estimated cooling"
              colors={COOLING_COLORS}
              labels={binLabels(COOLING_BIN_MAX, "°C")}
            />
          </div>
        </StepCard>
      </div>

      <Card>
        <p className="kicker">What this scenario does</p>
        {summary.cellsTreated === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Pick at least one locality to run a scenario.</p>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                {
                  label: "Cells treated",
                  value: `${summary.cellsTreated} of ${cells.length}`,
                  note: `${summary.cellsCooled} reached by at least one intervention`,
                },
                {
                  label: "Mean cooling, treated cells",
                  value: `${summary.meanCoolingC.toFixed(2)}°C`,
                  note: `${summary.meanCoolingLowC.toFixed(2)} to ${summary.meanCoolingHighC.toFixed(2)}°C across the cool-roof range. Peak cell ${summary.maxCoolingC.toFixed(2)}°C`,
                },
                {
                  label: "Residents in cooled cells",
                  value:
                    cityPopulation > 0
                      ? `${((summary.residentsInCooledCells / cityPopulation) * 100).toFixed(0)}% of the city`
                      : "Not available",
                  note: "Share of modelled population (WorldPop), not a census count",
                },
                {
                  label: "High-vulnerability cells",
                  value: `${summary.highCellsBefore} to ${summary.highCellsAfter}`,
                  note: `City-wide, scoring ${HIGH_VULNERABILITY_HVI} or more`,
                },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border border-border bg-card p-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</dt>
                  <dd className="mt-1 font-mono text-base font-semibold text-foreground">{stat.value}</dd>
                  <dd className="mt-1 text-xs leading-snug text-muted-foreground">{stat.note}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 space-y-3">
              <CoefficientSparkline
                mode="unidirectional"
                label="From tree canopy"
                value={summary.meanCanopyC}
                max={1.8}
                format={(v) => `${v.toFixed(2)}°C`}
              />
              <CoefficientSparkline
                mode="unidirectional"
                label="From cool roofs"
                value={summary.meanRoofC}
                max={1.8}
                format={(v) => `${v.toFixed(2)}°C`}
              />
              <CoefficientSparkline
                mode="unidirectional"
                label="From pocket parks"
                value={summary.meanParkC}
                max={1.8}
                format={(v) => `${v.toFixed(2)}°C`}
              />
            </div>

            <div className="mt-6 space-y-2 text-sm leading-relaxed text-muted-foreground">
              {inputs.canopyPct > CANOPY_THRESHOLD_PCT && treeBlockedCells > 0 && (
                <p>
                  Trees reach{" "}
                  <span className="font-medium text-foreground">
                    {summary.plantableCellsTreated} of {summary.cellsTreated}
                  </span>{" "}
                  treated cells. The other {treeBlockedCells} fail the plantability filter, so canopy adds
                  nothing there and cool roofs and parks carry the cooling.
                </p>
              )}
              {inputs.canopyPct > 0 && inputs.canopyPct <= CANOPY_THRESHOLD_PCT && (
                <p>
                  Canopy is at or below the {CANOPY_THRESHOLD_PCT}% threshold, so it contributes no
                  cooling yet.
                </p>
              )}
              <p>
                The selected localities&apos; scores fall by{" "}
                <span className="font-medium text-foreground">{meanScoreDrop.toFixed(1)} points</span> on
                average. Cooling moves one of the index&apos;s seven indicators. Population density, slum
                share and distance to a hospital are untouched, which is why the score moves less than
                the temperature does.
              </p>
            </div>
          </>
        )}
      </Card>

      {selectedWards.length > 0 && (
        <Card>
          <p className="kicker">Selected localities</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <caption className="sr-only">
                Selected localities with estimated cooling, and score and rank before and after the scenario
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-4 font-medium">Locality</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Plantable cells</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Mean cooling</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Score</th>
                  <th scope="col" className="py-2 text-right font-medium">Rank</th>
                </tr>
              </thead>
              <tbody>
                {selectedWards.map((ward) => (
                  <tr key={ward.wardId} className="border-b border-border/60">
                    <th scope="row" className="py-2 pr-4 text-left font-medium text-foreground">
                      {ward.wardId}
                    </th>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                      {ward.plantableCells} of {ward.cells}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                      {ward.meanCoolingC.toFixed(2)}°C
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                      {ward.hviBefore.toFixed(1)} to{" "}
                      <span className="text-foreground">{ward.hviAfter.toFixed(1)}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {ward.rankBefore} to <span className="text-foreground">{ward.rankAfter}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-4 text-sm leading-relaxed text-muted-foreground">
        This is a cited coefficient estimator, not a trained model and not a validated climate
        simulation. The coefficients are transferred from other cities&apos; studies, not calibrated
        for {ACTIVE_CITY.name}, and the three interventions are summed as independent illustrative terms,
        not a coupled physical model. They estimate air temperature and are subtracted one for one
        from the index&apos;s land-surface indicator, which is an assumption. Green cover and
        impervious cover are held at today&apos;s values, and scores are read against today&apos;s
        city-wide scale. Plantability is a land-cover screen that has not been calibrated for this
        region&apos;s ecology. {AREA_CAVEAT}
      </div>
    </div>
  );
}
