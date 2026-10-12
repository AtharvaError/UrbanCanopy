"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import Card from "../components/Card";
import { hviColor } from "@/lib/hvi";
import {
  INDICATOR_INPUTS,
  computeScore,
  normaliseWeights,
  scoreAll,
  valuesFor,
  type ScoreModel,
} from "@/lib/scoreFormula";
import type { WardProfileData } from "@/lib/wardProfile";
import type { IndicatorKey } from "@/lib/wardTypes";
import { CONCERN_LABELS, priorityFor, type PriorityLevel } from "@/lib/zonePlanner";

/**
 * The zone calculator: pick three to five localities, change any number or any
 * weight, and watch the score, the band and the rank follow.
 *
 * It runs `lib/scoreFormula.ts` and nothing else. With nothing changed it shows
 * the published scores, so every difference on screen is something the user
 * did.
 */

const MIN_ZONES = 3;
const MAX_ZONES = 5;
/** Weight sliders run 0 to this; only the proportions matter. */
const SLIDER_MAX = 50;

const LEVEL_DOT: Record<PriorityLevel, string> = {
  Critical: "bg-red-500",
  High: "bg-orange-500",
  Moderate: "bg-amber-500",
  Lower: "bg-brand-teal",
};

type Edits = Record<string, Partial<Record<IndicatorKey, number>>>;

const chipClass = (active: boolean, disabled = false) =>
  `rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active
      ? "border-brand-teal bg-brand-teal/15 text-foreground"
      : disabled
        ? "cursor-not-allowed border-border text-muted-foreground/40"
        : "border-border text-muted-foreground hover:bg-surface-hover hover:text-foreground"
  }`;

export default function CalculatorPanel({ data, model }: { data: WardProfileData; model: ScoreModel }) {
  const published = useMemo(
    () => Object.fromEntries(model.indicators.map((key) => [key, model.weights[key] * 100])),
    [model],
  );

  // Most and least vulnerable plus two in between, so the starting comparison
  // already spans the range.
  const [selected, setSelected] = useState<string[]>(() => {
    const ranked = data.wards.map((w) => w.ward_id);
    const picks = [0, 1, Math.floor(ranked.length / 2), ranked.length - 1].map((i) => ranked[i]);
    return [...new Set(picks)];
  });
  const [sliders, setSliders] = useState<Record<string, number>>(published);
  const [edits, setEdits] = useState<Edits>({});

  const weights = useMemo(() => normaliseWeights(sliders, model.indicators), [sliders, model]);
  const scored = useMemo(() => scoreAll(data, weights, model, edits), [data, weights, model, edits]);
  const publishedScores = useMemo(() => scoreAll(data, model.weights, model), [data, model]);

  const weightsChanged = model.indicators.some((key) => Math.abs(sliders[key] - published[key]) > 1e-9);
  const anyEdit = Object.values(edits).some((zone) => Object.keys(zone).length > 0);
  const zones = selected.map((id) => data.wards.find((w) => w.ward_id === id)!).filter(Boolean);

  function toggleZone(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((z) => z !== id) : current.length < MAX_ZONES ? [...current, id] : current,
    );
  }

  function setValue(wardId: string, key: IndicatorKey, raw: string) {
    const input = INDICATOR_INPUTS[key];
    const ward = data.wards.find((w) => w.ward_id === wardId)!;
    setEdits((current) => {
      const zone = { ...(current[wardId] ?? {}) };
      const value = Number(raw);
      // An empty or unreadable box goes back to the measured value, and so does
      // typing the measured value back in.
      if (raw.trim() === "" || Number.isNaN(value) || Math.abs(value - ward[key]) < input.step / 1000) delete zone[key];
      else zone[key] = Math.min(Math.max(value, input.min), input.max);
      return { ...current, [wardId]: zone };
    });
  }

  /** The worked example the page offers: cool the first locality's surface by two degrees. */
  function runExample() {
    const first = zones[0];
    if (!first) return;
    setSliders(published);
    setEdits({ [first.ward_id]: { LST_C: Math.round((first.LST_C - 2) * 10) / 10 } });
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="kicker">Step 1</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Pick {MIN_ZONES} to {MAX_ZONES} localities</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {selected.length} selected
            {selected.length < MIN_ZONES && `, pick at least ${MIN_ZONES} to compare`}
            {selected.length === MAX_ZONES && ", the most this view holds"}
          </p>
        </div>
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {data.wards.map((ward) => {
            const active = selected.includes(ward.ward_id);
            const full = !active && selected.length >= MAX_ZONES;
            return (
              <li key={ward.ward_id}>
                <button
                  type="button"
                  onClick={() => toggleZone(ward.ward_id)}
                  aria-pressed={active}
                  disabled={full}
                  className={chipClass(active, full)}
                >
                  {ward.ward_id}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="kicker">Step 2</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Set how much each factor counts</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSliders(published)} aria-pressed={!weightsChanged} className={chipClass(!weightsChanged)}>
              Published weights
            </button>
            <button
              type="button"
              onClick={() => setSliders(Object.fromEntries(model.indicators.map((key) => [key, 20])))}
              className={chipClass(false)}
            >
              Equal weights
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {model.indicators.map((key) => (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`weight-${key}`} className="text-sm font-medium text-foreground">
                  {CONCERN_LABELS[key]}
                </label>
                <span className="font-mono text-xs text-muted-foreground">{(weights[key] * 100).toFixed(0)}%</span>
              </div>
              <input
                id={`weight-${key}`}
                type="range"
                min={0}
                max={SLIDER_MAX}
                step={1}
                value={Math.min(sliders[key], SLIDER_MAX)}
                onChange={(e) => setSliders({ ...sliders, [key]: Number(e.target.value) })}
                className="mt-1.5 w-full accent-brand-teal"
              />
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          The percentages always add to 100: moving one slider changes every factor&apos;s share. The 0 to 100
          scale stays anchored to the published scoring, so a changed score can be compared with the one on the
          map.
        </p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="kicker">Step 3</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Change any number and compare</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={runExample} disabled={zones.length === 0} className={chipClass(false, zones.length === 0)}>
              Example: cool {zones[0]?.ward_id ?? "a locality"} by 2°C
            </button>
            {(anyEdit || weightsChanged) && (
              <button
                type="button"
                onClick={() => {
                  setEdits({});
                  setSliders(published);
                }}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                Reset everything
              </button>
            )}
          </div>
        </div>

        {zones.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Pick localities above to start.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <caption className="sr-only">
                Indicator values for the selected localities, each editable, with the resulting score, band and rank
              </caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Factor
                  </th>
                  {zones.map((zone) => (
                    <th key={zone.ward_id} scope="col" className="px-2 py-2 text-sm font-semibold text-foreground">
                      {zone.ward_id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.indicators.map((key) => {
                  const input = INDICATOR_INPUTS[key];
                  return (
                    <tr key={key} className="border-b border-border/60">
                      <th scope="row" className="py-2 pr-4 text-left font-normal">
                        <span className="text-foreground">{input.label}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">{input.unit}</span>
                      </th>
                      {zones.map((zone) => {
                        const edited = edits[zone.ward_id]?.[key];
                        return (
                          <td key={zone.ward_id} className="px-2 py-1.5">
                            <input
                              type="number"
                              aria-label={`${input.label} for ${zone.ward_id}`}
                              min={input.min}
                              max={input.max}
                              step={input.step}
                              value={Number((edited ?? zone[key]).toFixed(input.digits))}
                              onChange={(e) => setValue(zone.ward_id, key, e.target.value)}
                              className={`w-24 rounded-md border bg-background px-2 py-1 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                edited !== undefined ? "border-brand-teal" : "border-border"
                              }`}
                            />
                            {edited !== undefined && (
                              <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                                was {zone[key].toFixed(input.digits)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-b border-border/60">
                  <th scope="row" className="py-3 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Priority score
                  </th>
                  {zones.map((zone) => {
                    const now = scored.find((s) => s.wardId === zone.ward_id)!;
                    const before = publishedScores.find((s) => s.wardId === zone.ward_id)!;
                    const delta = now.score - before.score;
                    const level = priorityFor(now.score);
                    return (
                      <td key={zone.ward_id} className="px-2 py-3 align-top">
                        <p className="font-mono text-xl font-semibold text-foreground">{now.score.toFixed(1)}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-foreground">
                          <span className={`h-2 w-2 rounded-full ${LEVEL_DOT[level]}`} aria-hidden />
                          {level}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {Math.abs(delta) < 0.05 ? "as published" : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} vs published`}
                        </p>
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row" className="py-3 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Rank of {data.wards.length}
                  </th>
                  {zones.map((zone) => {
                    const now = scored.find((s) => s.wardId === zone.ward_id)!;
                    const before = publishedScores.find((s) => s.wardId === zone.ward_id)!;
                    return (
                      <td key={zone.ward_id} className="px-2 py-3 font-mono text-sm text-foreground">
                        {now.rank}
                        {now.rank !== before.rank && <span className="text-xs text-muted-foreground"> (was {before.rank})</span>}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {zones.length > 0 && (
        <Card>
          <p className="kicker">Selected localities, ranked</p>
          <ul className="mt-4 space-y-2.5">
            {[...zones]
              .map((zone) => ({
                zone,
                now: scored.find((s) => s.wardId === zone.ward_id)!,
                before: publishedScores.find((s) => s.wardId === zone.ward_id)!,
              }))
              .sort((a, b) => b.now.unclamped - a.now.unclamped)
              .map(({ zone, now, before }) => (
                <li key={zone.ward_id} className="flex items-center gap-3 text-xs">
                  <span className="w-36 shrink-0 truncate text-sm text-foreground">{zone.ward_id}</span>
                  <span className="relative h-4 flex-1 rounded bg-muted" aria-hidden>
                    <span
                      className="absolute inset-y-0 left-0 rounded"
                      style={{ width: `${now.score}%`, backgroundColor: hviColor(now.score) }}
                    />
                    {/* Where the published score sits, so a change is visible as a gap. */}
                    <span className="absolute inset-y-[-3px] w-0.5 bg-foreground" style={{ left: `${before.score}%` }} />
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-foreground">{now.score.toFixed(1)}</span>
                </li>
              ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            The bar is the score now. The dark tick is the published score.
          </p>
        </Card>
      )}

      {zones[0] && anyEdit && (
        <ExampleNote
          zoneName={zones[0].ward_id}
          points={computeScore(valuesFor(zones[0], model.indicators, edits[zones[0].ward_id]), weights, model).points}
          basePoints={computeScore(valuesFor(zones[0], model.indicators), weights, model).points}
          indicators={model.indicators}
        />
      )}
    </div>
  );
}

/** Says, for the first locality, which factor the edit moved and by how many points. */
function ExampleNote({
  zoneName,
  points,
  basePoints,
  indicators,
}: {
  zoneName: string;
  points: Record<string, number>;
  basePoints: Record<string, number>;
  indicators: IndicatorKey[];
}) {
  const moved = indicators
    .map((key) => ({ key, change: points[key] - basePoints[key] }))
    .filter((m) => Math.abs(m.change) >= 0.05);
  if (moved.length === 0) return null;
  return (
    <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-4 text-sm leading-relaxed text-muted-foreground">
      In <span className="font-medium text-foreground">{zoneName}</span>, your changes moved{" "}
      {moved.map((m, i) => (
        <span key={m.key}>
          {i > 0 && (i === moved.length - 1 ? " and " : ", ")}
          <span className="text-foreground">{CONCERN_LABELS[m.key].toLowerCase()}</span> by{" "}
          <span className="font-mono text-foreground">
            {m.change > 0 ? "+" : "−"}
            {Math.abs(m.change).toFixed(1)}
          </span>{" "}
          points
        </span>
      ))}
      . Every other factor is unchanged, so that is the whole difference in its score.
    </div>
  );
}
