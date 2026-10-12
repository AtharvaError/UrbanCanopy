import Card from "./Card";
import { ACTIVE_CITY, AREA_CAVEAT } from "@/lib/city";
import type { ScoreModel } from "@/lib/scoreFormula";
import { CONCERN_LABELS, PRIORITY_BANDS } from "@/lib/zonePlanner";

/**
 * "How the score works", in one card: the formula, the weights, the bands, and
 * what the score should not be taken for.
 *
 * Every number in it is read from the published model, so the formula printed
 * here is the one that produced the map, not a description of it.
 */

/** How each factor reads inside the formula line. */
const FORMULA_TERMS: Record<string, string> = {
  LST_C: "surface heat",
  NDVI: "green cover",
  pop_density_km2: "population density",
  child_pct: "young children",
  slum_pct: "informal housing",
  hospital_dist_m: "distance to a hospital",
  impervious_pct: "built-up surface",
};

const LIMITS = [
  "It is an illustrative priority score for deciding where to look first. It is not a forecast and not a health prediction.",
  "Heat is land surface temperature from satellite passes in March to May 2026. That is the temperature of roofs, roads and soil, not the air people feel.",
  `The weights come from a statistical analysis of ${ACTIVE_CITY.name}'s own cells. Here the factors partly pull against each other (open land is hotter, the dense core is more crowded), so no weighting is the single right one. The calculator lets you try others.`,
  AREA_CAVEAT,
  "Population is a modelled 2020 estimate at 1 km, and hospitals are as mapped in OpenStreetMap, which can miss some.",
  "There is no open data on outdoor workers, older residents or informal housing here, so the people most exposed to heat are under-represented.",
];

export default function ScoreExplainer({ model }: { model: ScoreModel }) {
  const factors = [...model.indicators].sort((a, b) => model.weights[b] - model.weights[a]);
  const largest = Math.max(...factors.map((key) => model.weights[key]));

  return (
    <Card id="how-the-score-works">
      <p className="kicker">How the score works</p>
      <h2 className="mt-2 text-lg font-semibold text-foreground">One formula, five public numbers</h2>

      <p className="mt-4 overflow-x-auto rounded-lg border border-border bg-background p-4 font-mono text-[13px] leading-7 text-foreground">
        score = {model.baseline.toFixed(1)} + {model.scale.toFixed(1)} × ({" "}
        {factors.map((key, i) => (
          <span key={key} className="whitespace-nowrap">
            {i > 0 && (model.direction[key] === 1 ? " + " : " − ")}
            {i === 0 && model.direction[key] === -1 && "− "}
            {model.weights[key].toFixed(2)} × {FORMULA_TERMS[key]}
          </span>
        ))}{" "}
        )
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Each factor goes in as how far the locality sits from the city average, measured in standard
        deviations, so a factor at exactly the city average adds nothing. A locality that is average on
        everything scores {model.baseline.toFixed(1)}. Green cover is subtracted because it protects.
      </p>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Weights</h3>
          <ul className="mt-3 space-y-2.5">
            {factors.map((key) => (
              <li key={key} className="flex items-center gap-3 text-xs">
                <span className="w-40 shrink-0 text-muted-foreground">{CONCERN_LABELS[key]}</span>
                <span className="relative h-2 flex-1 rounded-full bg-muted" aria-hidden>
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-brand-teal"
                    style={{ width: `${(model.weights[key] / largest) * 100}%` }}
                  />
                </span>
                <span className="w-10 shrink-0 text-right font-mono text-foreground">
                  {(model.weights[key] * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>

          <h3 className="mt-6 text-sm font-semibold text-foreground">Priority bands</h3>
          <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            {PRIORITY_BANDS.map((band, i) => (
              <li key={band.level} className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-foreground">{band.level}</span>
                <span className="font-mono">
                  {band.min === -Infinity
                    ? `below ${PRIORITY_BANDS[i - 1].min}`
                    : i === 0
                      ? `${band.min} and above`
                      : `${band.min} to ${PRIORITY_BANDS[i - 1].min}`}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Assumptions and limits</h3>
          <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-muted-foreground">
            {LIMITS.map((limit) => (
              <li key={limit} className="border-l-2 border-border pl-3">
                {limit}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
