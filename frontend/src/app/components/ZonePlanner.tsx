"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Loader2, Sparkles, Sun, TreePine, Trees, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACTIVE_CITY } from "@/lib/city";
import { CANOPY_THRESHOLD_PCT, MAX_REALISTIC_CANOPY_PCT, MAX_REALISTIC_PARK_PCT } from "@/lib/coefficients";
import { SCENARIO_PRESETS, matchingPresetId, runScenario, type ScenarioCell, type ScenarioInputs } from "@/lib/scenario";
import { scenarioCellsFrom } from "@/lib/scenarioData";
import { typeColor, typeOf } from "@/lib/localityTypes";
import { useWardData } from "@/lib/useWardData";
import { ordinal } from "@/lib/wardProfile";
import type { NbsRec } from "@/lib/wardTypes";
import {
  builtForm,
  mainConcern,
  peopleActions,
  priorityFor,
  scoreBreakdown,
  type PeopleAction,
  type PriorityLevel,
  type ScoreBreakdown,
} from "@/lib/zonePlanner";

/**
 * Zone Intelligence & Action Planner: the slide-over that opens when a locality
 * is picked on the map or in the ranked list.
 *
 * Three questions, one tab each: why does this locality rank where it does,
 * what would cooling it change, and what should be done. The what-if sliders
 * feed the header and the other two tabs, so the score, its band, its
 * breakdown and the suggested actions all move together.
 *
 * Deliberately not modal. The map stays live beside it, so picking another
 * locality on the map switches the panel instead of having to close it first.
 */

const NO_CHANGE: ScenarioInputs = { canopyPct: 0, albedoIncrease: 0, parkAreaPct: 0 };

/** The single levers compared on the Actions tab, each at a fixed, stated level. */
const LEVERS: { id: string; label: string; detail: string; inputs: ScenarioInputs }[] = [
  { id: "roofs", label: "Cool roofs", detail: "+0.20 albedo on built-up surface", inputs: { ...NO_CHANGE, albedoIncrease: 0.2 } },
  { id: "trees", label: "Tree canopy", detail: "70% canopy where plantable", inputs: { ...NO_CHANGE, canopyPct: 70 } },
  { id: "parks", label: "Pocket parks", detail: "15% of built-up land", inputs: { ...NO_CHANGE, parkAreaPct: 15 } },
];

const PRIORITY_STYLE: Record<PriorityLevel, { dot: string; chip: string }> = {
  Critical: { dot: "bg-red-500", chip: "border-red-500/40 bg-red-500/10" },
  High: { dot: "bg-orange-500", chip: "border-orange-500/40 bg-orange-500/10" },
  Moderate: { dot: "bg-amber-500", chip: "border-amber-500/40 bg-amber-500/10" },
  Lower: { dot: "bg-brand-teal", chip: "border-brand-teal/40 bg-brand-teal/10" },
};

type CellData = { cells: ScenarioCell[]; pointsPerDegree: number };

/** The published cells, fetched once for the what-if engine. Null until they arrive. */
function useScenarioCells(): CellData | null {
  const [data, setData] = useState<CellData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/cells_nbs.geojson")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`cells ${r.status}`))))
      .then((geo) => {
        if (cancelled) return;
        const { cells, pointsPerDegree } = scenarioCellsFrom(geo);
        setData({ cells, pointsPerDegree });
      })
      // Without cells the panel still explains the score; only What if is unavailable.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

function PriorityBadge({ level }: { level: PriorityLevel }) {
  const style = PRIORITY_STYLE[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground ${style.chip}`}>
      <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden />
      {level} priority
    </span>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Points on a centred bar: right of centre pushes the score up, left pulls it down. */
function PointsBar({ points, scale }: { points: number; scale: number }) {
  const width = Math.min(Math.abs(points) / scale, 1) * 50;
  return (
    <div className="relative h-2.5 rounded-full bg-muted" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <div
        className={`absolute inset-y-0 rounded-full ${points >= 0 ? "bg-red-400" : "bg-emerald-400"}`}
        style={points >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
      />
    </div>
  );
}

function signed(points: number): string {
  return `${points >= 0 ? "+" : "−"}${Math.abs(points).toFixed(1)}`;
}

function WhyTab({ breakdown, compareCity, scenarioActive }: { breakdown: ScoreBreakdown; compareCity: boolean; scenarioActive: boolean }) {
  const scale = Math.max(...breakdown.factors.map((f) => Math.abs(f.points)), 5);
  const net = breakdown.total - breakdown.baseline;
  return (
    <div>
      <p className="kicker">Why this locality ranks here</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        A locality that is exactly average on every factor scores{" "}
        <span className="font-mono text-foreground">{breakdown.baseline.toFixed(1)}</span>. Each factor below adds
        points (red) or removes them (green) from there.
        {scenarioActive && " The surface-heat row includes your what-if scenario."}
      </p>

      <ul className="mt-4 space-y-4">
        {breakdown.factors.map((factor) => (
          <li key={factor.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{factor.label}</span>
              <span className="font-mono text-sm text-foreground">{signed(factor.points)} pts</span>
            </div>
            <div className="mt-1.5">
              <PointsBar points={factor.points} scale={scale} />
            </div>
            <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
              <div>
                <dt className="sr-only">Measured value</dt>
                <dd>
                  <span className="text-foreground">{factor.raw}</span>
                  {compareCity && <> (city {factor.cityRaw})</>}
                </dd>
              </div>
              <div>
                <dt className="sr-only">Concern level among localities</dt>
                <dd>concern {factor.normalised.toFixed(0)}/100</dd>
              </div>
              <div>
                <dt className="sr-only">Weight in the index</dt>
                <dd>weight {(factor.weight * 100).toFixed(0)}%</dd>
              </div>
            </dl>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{factor.interpretation}</p>
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-lg border border-border bg-surface p-3 font-mono text-xs text-muted-foreground">
        {breakdown.baseline.toFixed(1)} city average {net >= 0 ? "+" : "−"} {Math.abs(net).toFixed(1)} from the factors ={" "}
        <span className="font-semibold text-foreground">{breakdown.total.toFixed(1)} / 100</span>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Concern is where this locality sits between the best (0) and worst (100) locality on that factor. Weights
        come from a principal component analysis of {ACTIVE_CITY.name}&apos;s own cells, not from judgement.
      </p>
    </div>
  );
}

function Slider({
  id,
  icon,
  label,
  value,
  max,
  step,
  display,
  note,
  onChange,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  max: number;
  step: number;
  display: string;
  note: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-foreground">
          {icon}
          {label}
        </label>
        <span className="font-mono text-xs text-muted-foreground">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-brand-teal"
      />
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}

type Outcome = {
  scoreBefore: number;
  scoreAfter: number;
  rankBefore: number;
  rankAfter: number;
  coolingC: number;
  cells: number;
  plantableCells: number;
};

function WhatIfTab({
  inputs,
  onChange,
  outcome,
  ready,
}: {
  inputs: ScenarioInputs;
  onChange: (inputs: ScenarioInputs) => void;
  outcome: Outcome | null;
  ready: boolean;
}) {
  const activePreset = matchingPresetId(inputs);
  const changed = inputs.canopyPct > 0 || inputs.albedoIncrease > 0 || inputs.parkAreaPct > 0;
  if (!ready) return <p className="text-sm text-muted-foreground">Loading the cell data for this locality…</p>;

  return (
    <div>
      <p className="kicker">What if we cooled this locality?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SCENARIO_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.inputs)}
            aria-pressed={activePreset === preset.id}
            title={preset.description}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activePreset === preset.id
                ? "border-brand-teal bg-brand-teal/15 text-foreground"
                : "border-border text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            {preset.label}
          </button>
        ))}
        {changed && (
          <button
            type="button"
            onClick={() => onChange(NO_CHANGE)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Reset
          </button>
        )}
      </div>

      <div className="mt-5 space-y-5">
        <Slider
          id="planner-canopy"
          icon={<TreePine className="h-4 w-4 text-brand-emerald" aria-hidden />}
          label="Tree canopy cover"
          value={inputs.canopyPct}
          max={MAX_REALISTIC_CANOPY_PCT}
          step={1}
          display={`${inputs.canopyPct}% cover`}
          note={`Only in plantable cells: ${outcome?.plantableCells ?? 0} of ${outcome?.cells ?? 0} here. No cooling below ~${CANOPY_THRESHOLD_PCT}% canopy (Ziter et al. 2019).`}
          onChange={(canopyPct) => onChange({ ...inputs, canopyPct })}
        />
        <Slider
          id="planner-albedo"
          icon={<Sun className="h-4 w-4 text-brand-teal" aria-hidden />}
          label="Cool-roof albedo increase"
          value={inputs.albedoIncrease}
          max={0.3}
          step={0.01}
          display={`+${inputs.albedoIncrease.toFixed(2)} albedo`}
          note="On built-up surface, in proportion to how built-up each cell is (Santamouris 2014)."
          onChange={(albedoIncrease) => onChange({ ...inputs, albedoIncrease })}
        />
        <Slider
          id="planner-park"
          icon={<Trees className="h-4 w-4 text-brand-emerald" aria-hidden />}
          label="Pocket-park coverage"
          value={inputs.parkAreaPct}
          max={MAX_REALISTIC_PARK_PCT}
          step={1}
          display={`${inputs.parkAreaPct}% of cell area`}
          note="Only built land can become a park, so this is capped at each cell's built-up share (Bowler et al. 2010)."
          onChange={(parkAreaPct) => onChange({ ...inputs, parkAreaPct })}
        />
      </div>

      {outcome && (
        <dl className="mt-6 grid grid-cols-2 gap-3">
          {[
            { label: "Estimated cooling", value: `${outcome.coolingC.toFixed(2)}°C`, note: "mean across this locality's cells" },
            {
              label: "Priority score",
              value: `${outcome.scoreBefore.toFixed(1)} to ${outcome.scoreAfter.toFixed(1)}`,
              note: `${priorityFor(outcome.scoreBefore)} to ${priorityFor(outcome.scoreAfter)}`,
            },
            { label: "Rank", value: `${outcome.rankBefore} to ${outcome.rankAfter}`, note: "if only this locality is treated" },
            { label: "Points removed", value: (outcome.scoreBefore - outcome.scoreAfter).toFixed(1), note: "all from the surface-heat factor" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-surface p-3">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{stat.label}</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-foreground">{stat.value}</dd>
              <dd className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{stat.note}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        A cited coefficient estimator, not a trained model or a climate simulation. The coefficients come from
        studies of other cities. Cooling changes one of the index&apos;s factors; density and hospital access are
        untouched, which is why the score moves less than the temperature.
      </p>
    </div>
  );
}

function ActionsTab({
  levers,
  recs,
  people,
  outcome,
  scenarioActive,
}: {
  levers: { id: string; label: string; detail: string; coolingC: number; points: number }[] | null;
  recs: NbsRec[];
  people: PeopleAction[];
  outcome: Outcome | null;
  scenarioActive: boolean;
}) {
  return (
    <div>
      {scenarioActive && outcome && (
        <div className="mb-5 rounded-lg border border-brand-teal/30 bg-brand-teal/5 p-3 text-xs leading-relaxed text-muted-foreground">
          Your what-if scenario cools this locality by{" "}
          <span className="font-mono text-foreground">{outcome.coolingC.toFixed(2)}°C</span> and moves it from{" "}
          <span className="font-medium text-foreground">{priorityFor(outcome.scoreBefore)}</span> to{" "}
          <span className="font-medium text-foreground">{priorityFor(outcome.scoreAfter)}</span> priority.
        </div>
      )}

      <p className="kicker">For people, this hot season</p>
      {people.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {people.map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-surface p-3">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.action}</p>
              <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">{item.because}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No rule fires: this locality is at or better than the city average on every measure the rules use.
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Each suggestion has one rule, a comparison with the city average, shown under it. The rules are this
        tool&apos;s own rules of thumb, not study findings, and they are not medical advice.
      </p>

      <p className="kicker mt-6">Which lever moves this locality most</p>
      {levers ? (
        <ol className="mt-3 space-y-2">
          {levers.map((lever, i) => (
            <li key={lever.id} className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
              <span className="font-mono text-xs text-brand-teal">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{lever.label}</p>
                <p className="text-[11px] text-muted-foreground">{lever.detail}</p>
              </div>
              <div className="shrink-0 text-right font-mono text-xs">
                <p className="text-foreground">{lever.coolingC.toFixed(2)}°C</p>
                <p className="text-muted-foreground">−{lever.points.toFixed(1)} pts</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Loading the cell data for this locality…</p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Each lever is tried alone at the level shown, on this locality&apos;s own cells. Trees only count where the
        land cover allows planting.
      </p>

      <p className="kicker mt-6">Recommended from the rules</p>
      {recs.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {recs.map((rec) => (
            <li key={rec.intervention} className="rounded-lg border border-border bg-surface p-3">
              <p className="text-sm font-medium text-foreground">{rec.intervention}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{rec.rationale}</p>
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                {rec.cell_count} {rec.cell_count === 1 ? "cell" : "cells"} · {rec.citation}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No rule fired here: no cell in this locality is both in the city&apos;s most vulnerable quarter and in its
          least green quarter.
        </p>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Plantability here is a land-cover screen that has not been calibrated for central India&apos;s ecology. It
        does not clear a site for planting.
      </p>

      <Link
        href="/simulate"
        className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand-teal hover:underline"
      >
        Plan several localities together
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

function PlannerBody({
  wardId,
  onSelectWard,
  cellData,
  tab,
  onTabChange,
  compareCity,
  onCompareCityChange,
}: {
  wardId: string;
  onSelectWard: (wardId: string | null) => void;
  cellData: CellData | null;
  tab: string;
  onTabChange: (tab: string) => void;
  compareCity: boolean;
  onCompareCityChange: (compare: boolean) => void;
}) {
  const { wards, recs, profiles, error } = useWardData();
  const [inputs, setInputs] = useState<ScenarioInputs>(NO_CHANGE);
  const [aiState, setAiState] = useState<{
    wardId: string;
    explanation: string;
    error: string;
  }>({
    wardId,
    explanation: "",
    error: "",
  });
  const [aiLoading, setAiLoading] = useState(false);

  const aiExplanation = aiState.wardId === wardId ? aiState.explanation : "";
  const aiError = aiState.wardId === wardId ? aiState.error : "";

  const selected = wards?.find((f) => f.properties.ward_id === wardId) ?? null;
  const profile = profiles?.wards.find((w) => w.ward_id === wardId) ?? null;
  const index = wards?.findIndex((f) => f.properties.ward_id === wardId) ?? -1;

  const scenarioActive = inputs.canopyPct > 0 || inputs.albedoIncrease > 0 || inputs.parkAreaPct > 0;

  const outcome = useMemo((): Outcome | null => {
    if (!cellData) return null;
    const result = runScenario(cellData.cells, new Set([wardId]), inputs, cellData.pointsPerDegree);
    const ward = result.wards.find((w) => w.wardId === wardId);
    if (!ward) return null;
    return {
      scoreBefore: ward.hviBefore,
      scoreAfter: ward.hviAfter,
      rankBefore: ward.rankBefore,
      rankAfter: ward.rankAfter,
      coolingC: ward.meanCoolingC,
      cells: ward.cells,
      plantableCells: ward.plantableCells,
    };
  }, [cellData, wardId, inputs]);

  const levers = useMemo(() => {
    if (!cellData) return null;
    return LEVERS.map((lever) => {
      const ward = runScenario(cellData.cells, new Set([wardId]), lever.inputs, cellData.pointsPerDegree).wards.find(
        (w) => w.wardId === wardId,
      );
      return {
        id: lever.id,
        label: lever.label,
        detail: lever.detail,
        coolingC: ward?.meanCoolingC ?? 0,
        points: ward ? ward.hviBefore - ward.hviAfter : 0,
      };
    }).sort((a, b) => b.points - a.points);
  }, [cellData, wardId]);

  // The published breakdown, with whatever the what-if scenario removes taken
  // off the one factor cooling acts on.
  const breakdown = useMemo((): ScoreBreakdown | null => {
    if (!selected || !profile || !profiles) return null;
    const base = scoreBreakdown(selected.properties, profile, profiles);
    if (!base || !outcome || !scenarioActive) return base;
    const removed = outcome.scoreBefore - outcome.scoreAfter;
    const factors = base.factors
      .map((f) => (f.key === "LST_C" ? { ...f, points: f.points - removed } : f))
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    return { ...base, factors, total: base.total - removed };
  }, [selected, profile, profiles, outcome, scenarioActive]);

  if (error) return <p className="p-5 text-sm text-destructive">Failed to load locality data: {error}</p>;
  if (!wards || !selected) return <p className="p-5 text-sm text-muted-foreground">Loading…</p>;

  const props = selected.properties;
  const published = props.HVI ?? 0;
  const score = scenarioActive && outcome ? outcome.scoreAfter : published;
  const rank = scenarioActive && outcome ? outcome.rankAfter : (props.rank ?? 0);
  const level = priorityFor(score);
  const cityAverage = profiles?.city.hvi_mean ?? null;
  const wardRecs = (recs ?? []).filter((r) => r.ward_id === wardId).sort((a, b) => a.priority - b.priority);
  const previous = index > 0 ? wards[index - 1].properties.ward_id : null;
  const next = index >= 0 && index < wards.length - 1 ? wards[index + 1].properties.ward_id : null;
  const type = typeOf(profile, profiles);

  const selectedLocality = {
    name: props.ward_id,
    hvi: Number(score.toFixed(1)),
    rank: rank,
    factors: breakdown
      ? Object.fromEntries(
          breakdown.factors.map((f) => [f.label, `${f.raw} (${signed(f.points)} pts)`])
        )
      : {},
    recommendation:
      wardRecs.length > 0
        ? wardRecs.map((r) => `${r.intervention}: ${r.rationale}`).join("; ")
        : "Cool roofs and urban vegetation interventions",
  };

  async function explainHeatRisk(locality: typeof selectedLocality) {
    setAiLoading(true);
    setAiState({ wardId, explanation: "", error: "" });

    try {
      const response = await fetch("http://localhost:3001/api/heat-explain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          localityName: locality.name,
          hvi: locality.hvi,
          rank: locality.rank,
          factors: locality.factors,
          recommendation: locality.recommendation,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      setAiState({ wardId, explanation: data.explanation, error: "" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to contact the AI service.";
      setAiState({ wardId, explanation: "", error: message });
    } finally {
      setAiLoading(false);
    }
  }

  const aiExplainerSection = (
    <section className="ai-heat-explainer rounded-xl border border-border bg-card/60 p-4 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            AI Heat Risk Explainer
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Locality climate intelligence powered by Experiential Labs AI
          </p>
        </div>

        <button
          onClick={() => explainHeatRisk(selectedLocality)}
          disabled={aiLoading || !selectedLocality}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white shadow-xs transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {aiLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Analysing...</span>
            </>
          ) : (
            "Explain with AI"
          )}
        </button>
      </div>

      {aiError && (
        <p role="alert" className="mt-3 rounded border border-destructive/30 bg-destructive/10 p-2.5 text-destructive">
          {aiError}
        </p>
      )}

      {aiExplanation && (
        <div aria-live="polite" className="mt-3 rounded border border-border bg-background p-3.5">
          <h4 className="font-semibold text-foreground">Locality analysis</h4>
          <p style={{ whiteSpace: "pre-wrap" }} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {aiExplanation}
          </p>
        </div>
      )}
    </section>
  );

  return (
    <>
      <header className="border-b border-border px-5 pb-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <PriorityBadge level={level} />
          <div className="flex items-center gap-0.5">
            <IconButton label="Previous locality" onClick={() => previous && onSelectWard(previous)} disabled={!previous}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton label="Next locality" onClick={() => next && onSelectWard(next)} disabled={!next}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton label="Close" onClick={() => onSelectWard(null)}>
              <X className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        </div>

        <h2 id="zone-planner-title" className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
          {props.ward_id}
        </h2>
        {profile && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {builtForm(profile.impervious_pct)} · {props.n_cells} {ACTIVE_CITY.cellLabel} cells
          </p>
        )}
        {type && (
          <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: typeColor(type.id) }} aria-hidden />
            <span>
              <Link href="/calculator#locality-types" className="font-medium text-foreground underline-offset-2 hover:underline">
                {type.name}
              </Link>
              , one of {profiles?.locality_types?.k} kinds of locality. {type.description}
            </span>
          </p>
        )}

        <div className="mt-4 flex items-end gap-4">
          <div>
            <p className="font-mono text-4xl font-semibold leading-none text-foreground">
              {score.toFixed(1)}
              <span className="text-base font-normal text-muted-foreground"> / 100</span>
            </p>
            <p className="mt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Intervention priority score</p>
          </div>
          <div className="pb-0.5 text-xs leading-relaxed text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">{ordinal(rank)}</span> of {wards.length} localities
            </p>
            {cityAverage !== null && (
              <p>
                <span className="font-mono text-foreground">{signed(score - cityAverage)}</span> points against the city
                average
              </p>
            )}
            {scenarioActive && outcome && (
              <p>
                was <span className="font-mono text-foreground">{published.toFixed(1)}</span> before your scenario
              </p>
            )}
          </div>
        </div>

        {breakdown && <p className="mt-3 text-sm leading-relaxed text-foreground">{mainConcern(breakdown)}</p>}

        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={compareCity}
              onChange={(e) => onCompareCityChange(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand-teal"
            />
            Compare with city average
          </label>
          <button
            type="button"
            onClick={() => {
              onTabChange("why");
              explainHeatRisk(selectedLocality);
            }}
            disabled={aiLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {aiLoading ? "Analysing..." : "Explain with AI"}
          </button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="border-b border-border px-5 py-2.5">
          <TabsList>
            <TabsTrigger value="why">Why this zone?</TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5">
              AI Explainer
              <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-400">AI</span>
            </TabsTrigger>
            <TabsTrigger value="whatif">What if?</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>
        </div>
        <div className="ward-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <TabsContent value="why">
            {breakdown ? (
              <div className="space-y-6">
                <WhyTab breakdown={breakdown} compareCity={compareCity} scenarioActive={scenarioActive} />
                <div className="border-t border-border pt-5">
                  {aiExplainerSection}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">The score breakdown is not available for this dataset.</p>
            )}
          </TabsContent>
          <TabsContent value="ai">
            <div className="space-y-4">
              {aiExplainerSection}
            </div>
          </TabsContent>
          <TabsContent value="whatif">
            <WhatIfTab inputs={inputs} onChange={setInputs} outcome={outcome} ready={cellData !== null} />
          </TabsContent>
          <TabsContent value="actions">
            <ActionsTab
              levers={levers}
              recs={wardRecs}
              people={profile && profiles ? peopleActions(profile, profiles, score) : []}
              outcome={outcome}
              scenarioActive={scenarioActive}
            />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}

export default function ZonePlanner({
  selectedWardId,
  onSelectWard,
}: {
  selectedWardId: string | null;
  onSelectWard: (wardId: string | null) => void;
}) {
  const cellData = useScenarioCells();
  // Kept here, above the per-locality body, so stepping to the next locality
  // stays on the tab being read.
  const [tab, setTab] = useState("why");
  const [compareCity, setCompareCity] = useState(true);

  useEffect(() => {
    if (!selectedWardId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onSelectWard(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedWardId, onSelectWard]);

  if (!selectedWardId) return null;

  return (
    <aside
      role="dialog"
      aria-labelledby="zone-planner-title"
      className="animate-in slide-in-from-right fixed inset-y-0 right-0 z-[1500] flex w-full flex-col border-l border-border bg-background shadow-2xl duration-300 sm:w-[460px]"
    >
      {/* Keyed by locality so the what-if sliders start fresh for each one: a
          scenario built for one locality is never silently applied to the next. */}
      <PlannerBody
        key={selectedWardId}
        wardId={selectedWardId}
        onSelectWard={onSelectWard}
        cellData={cellData}
        tab={tab}
        onTabChange={setTab}
        compareCity={compareCity}
        onCompareCityChange={setCompareCity}
      />
    </aside>
  );
}
