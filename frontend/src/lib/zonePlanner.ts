/**
 * The reasoning behind the Zone Intelligence & Action Planner panel.
 *
 * Everything the panel says about a locality is derived here from numbers the
 * pipeline already published. Nothing is estimated, and nothing is added to the
 * index: the panel is a different reading of the same score, never a second
 * score.
 *
 * The score is the Heat Vulnerability Index. The panel calls it an intervention
 * priority score because that is what it is used for, and it is illustrative:
 * a transparent weighted sum of five public indicators, useful for deciding
 * where to look first. It is not a health prediction and the panel never
 * presents it as one.
 */

import { fmtDensity, fmtDistance, fmtNdvi, fmtPct, type WardProfile, type WardProfileData } from "./wardProfile";
import { typeOf } from "./localityTypes";
import { presentIndicators, type IndicatorKey, type WardProps } from "./wardTypes";

export type PriorityLevel = "Critical" | "High" | "Moderate" | "Lower";

/**
 * Score bands, deliberately the map legend's own break points (see `hvi.ts`):
 * the two darkest reds are Critical and High. A band that disagreed with the
 * colour of the area it describes would make one of them wrong.
 */
export const PRIORITY_BANDS: { level: PriorityLevel; min: number }[] = [
  { level: "Critical", min: 80 },
  { level: "High", min: 65 },
  { level: "Moderate", min: 50 },
  { level: "Lower", min: -Infinity },
];

export function priorityFor(score: number): PriorityLevel {
  return (PRIORITY_BANDS.find((band) => score >= band.min) ?? PRIORITY_BANDS[PRIORITY_BANDS.length - 1]).level;
}

/** +1 when a higher value adds to vulnerability, -1 when it protects (pipeline/_indicators.py). */
const DIRECTION: Record<IndicatorKey, 1 | -1> = {
  LST_C: 1,
  NDVI: -1,
  pop_density_km2: 1,
  child_pct: 1,
  slum_pct: 1,
  hospital_dist_m: 1,
  impervious_pct: 1,
};

/** Each indicator named for the concern it measures, so a longer bar always reads as "more of a problem". */
export const CONCERN_LABELS: Record<IndicatorKey, string> = {
  LST_C: "Surface heat",
  NDVI: "Low green cover",
  pop_density_km2: "Population density",
  child_pct: "Young children",
  slum_pct: "Informal housing",
  hospital_dist_m: "Distance to a hospital",
  impervious_pct: "Built-up surface",
};

/** How each concern reads inside the one-line summary. */
const CONCERN_PHRASES: Record<IndicatorKey, string> = {
  LST_C: "above-average surface heat",
  NDVI: "little green cover",
  pop_density_km2: "high population density",
  child_pct: "a high share of young children",
  slum_pct: "a high share of informal housing",
  hospital_dist_m: "long distances to a hospital",
  impervious_pct: "heavily built-up surfaces",
};

function formatRaw(key: IndicatorKey, value: number): string {
  switch (key) {
    case "LST_C":
      return `${value.toFixed(1)}°C`;
    case "NDVI":
      return fmtNdvi(value);
    case "pop_density_km2":
      return `${fmtDensity(value)} per km²`;
    case "hospital_dist_m":
      return fmtDistance(value);
    default:
      return fmtPct(value);
  }
}

function interpret(key: IndicatorKey, value: number, city: number): string {
  switch (key) {
    case "LST_C": {
      const delta = value - city;
      if (Math.abs(delta) < 0.15) return "About as hot at the surface as the city as a whole. This is land surface, not air temperature.";
      return `${Math.abs(delta).toFixed(1)}°C ${delta > 0 ? "hotter" : "cooler"} at the surface than the city average in the hot season. Land surface, not air temperature.`;
    }
    case "NDVI":
      return value < city
        ? "Less vegetation than the city average, so less shade and less cooling from plants."
        : "Greener than the city average, which works in this locality's favour.";
    case "impervious_pct":
      return value > city
        ? "More of the ground is built or paved than across the city. Built surfaces hold heat and release it after dark."
        : "Less built-up than the city average, leaving more open or planted ground.";
    case "pop_density_km2":
      return value > city
        ? "More people live here per square kilometre than across the city, so the same heat reaches more of them."
        : "Fewer people per square kilometre than the city average.";
    case "hospital_dist_m":
      return value > city
        ? "The nearest hospital is further than the city average, which matters when heat makes someone ill."
        : "Closer to a hospital than the city average.";
    case "child_pct":
      return value > city ? "A larger share of young children than the city average." : "A smaller share of young children than the city average.";
    case "slum_pct":
      return value > city ? "More informal housing than the city average." : "Less informal housing than the city average.";
  }
}

export type FactorRow = {
  key: IndicatorKey;
  label: string;
  /** The measured value, formatted with its unit. */
  raw: string;
  cityRaw: string;
  /** 0 to 100 across the city's localities, 100 being the most concerning one. */
  normalised: number;
  /** The indicator's share of the index, 0 to 1. */
  weight: number;
  /** Score points this factor adds (positive) or removes (negative) against a city-average area. */
  points: number;
  interpretation: string;
};

export type ScoreBreakdown = {
  /** What an area that is exactly average on every indicator scores. */
  baseline: number;
  /** Largest absolute contribution first. */
  factors: FactorRow[];
  /** baseline + every factor's points. Equals the published score. */
  total: number;
};

/**
 * Decomposes a locality's published score into points per factor.
 *
 * Exact, not an approximation: the index is linear, so the score is the
 * city-average baseline plus each factor's contribution rescaled by the same
 * constant (`score_scale`, written by the pipeline). The parts sum to the
 * published score to floating-point precision.
 *
 * Returns null when the profile file predates `score_scale`, so the caller can
 * say the breakdown is unavailable instead of drawing one that does not add up.
 */
export function scoreBreakdown(ward: WardProps, profile: WardProfile, data: WardProfileData): ScoreBreakdown | null {
  if (!data.score_scale || !data.weights) return null;
  const { baseline_points: baseline, points_per_contribution: scale } = data.score_scale;

  const factors = presentIndicators(ward, "contrib_").map((key): FactorRow => {
    const value = profile[key];
    const values = data.wards.map((w) => w[key]);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const position = hi === lo ? 0.5 : (value - lo) / (hi - lo);
    return {
      key,
      label: CONCERN_LABELS[key],
      raw: formatRaw(key, value),
      cityRaw: formatRaw(key, data.city[key]),
      normalised: (DIRECTION[key] === 1 ? position : 1 - position) * 100,
      weight: data.weights?.[key] ?? 0,
      points: (ward[`contrib_${key}`] as number) * scale,
      interpretation: interpret(key, value, data.city[key]),
    };
  });
  factors.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

  return { baseline, factors, total: baseline + factors.reduce((sum, f) => sum + f.points, 0) };
}

/** One sentence naming what pushes this locality above the city average, from its largest upward factors. */
export function mainConcern(breakdown: ScoreBreakdown): string {
  const upward = breakdown.factors
    .filter((f) => f.points >= 0.5)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((f) => CONCERN_PHRASES[f.key]);
  if (upward.length === 0) return "No single factor pushes this locality above the city average.";
  const [first, ...rest] = upward;
  const sentence = first.charAt(0).toUpperCase() + first.slice(1);
  if (rest.length === 0) return `${sentence} is what sets this locality apart from the city average.`;
  const tail = rest.length === 1 ? rest[0] : `${rest[0]} and ${rest[1]}`;
  return `${sentence} overlaps with ${tail}.`;
}

/**
 * A plain description of how built-up a locality is, from its impervious
 * share alone. It is a land-cover reading, not a land-use one: nothing here
 * knows whether an area is a market or a housing estate, and it does not guess.
 */
export function builtForm(imperviousPct: number): string {
  if (imperviousPct >= 85) return "Dense built-up area";
  if (imperviousPct >= 60) return "Mostly built-up area";
  if (imperviousPct >= 35) return "Mixed built and open land";
  return "Urban fringe, mostly open land";
}

export type PeopleAction = {
  id: string;
  title: string;
  /** What to do. */
  action: string;
  /** The rule that fired, with the numbers it fired on. */
  because: string;
};

/**
 * Every people-focused action `peopleActions` can return, in the order it
 * returns them, with its rule in words. The city plan lists actions that no
 * single locality's panel shows together, so it needs the rules without a
 * locality's numbers in them. The test holds this list to the function.
 */
export const PEOPLE_ACTION_CATALOGUE: { id: string; title: string; rule: string }[] = [
  { id: "water", title: "Drinking-water points", rule: "More crowded than the city average." },
  { id: "shade", title: "Shade where people wait", rule: "More built-up and less green than the city average." },
  { id: "work-hours", title: "Midday work advisory", rule: "Hotter at the surface than the city average." },
  { id: "outreach", title: "Outreach priority", rule: "Further from a hospital than the city average." },
  { id: "cool-room", title: "A public cool room", rule: "Critical or High priority: a score of 65 or more." },
];

/**
 * Actions for people, as opposed to the built environment: water, shade where
 * people wait, work timing, outreach, a cool room.
 *
 * Each has one rule, and every rule is a plain comparison with the city average
 * that a reader can check against the numbers on the same panel. These are
 * rules of thumb set by this tool, not findings from a study. The measures
 * themselves are the kind a city heat action plan lists; which locality needs
 * which is what the rules sort out. Nothing here knows where outdoor workers
 * or older residents actually are, because no open data says, so the rules
 * stand on the indicators the index has.
 */
export function peopleActions(profile: WardProfile, data: WardProfileData, score: number): PeopleAction[] {
  const city = data.city;
  const actions: PeopleAction[] = [];

  if (profile.pop_density_km2 > city.pop_density_km2) {
    actions.push({
      id: "water",
      title: "Drinking-water points",
      action: "Set up free drinking-water points at markets, bus stops and labour pick-up points for the hot months.",
      because: `Crowded: ${fmtDensity(profile.pop_density_km2)} people per km² against ${fmtDensity(city.pop_density_km2)} city-wide.`,
    });
  }

  if (profile.impervious_pct > city.impervious_pct && profile.NDVI < city.NDVI) {
    actions.push({
      id: "shade",
      title: "Shade where people wait",
      action: "Add shade structures at bus stops, market lanes and school gates, where people stand in the open.",
      because: `Built-up and bare: ${fmtPct(profile.impervious_pct)} built-up (city ${fmtPct(city.impervious_pct)}) with green cover ${fmtNdvi(profile.NDVI)} (city ${fmtNdvi(city.NDVI)}).`,
    });
  }

  if (profile.LST_C > city.LST_C) {
    actions.push({
      id: "work-hours",
      title: "Midday work advisory",
      action: "Advise contractors and employers to move outdoor work away from noon to 4 pm, with rest breaks in shade.",
      because: `Hot ground: ${profile.LST_C.toFixed(1)}°C at the surface against ${city.LST_C.toFixed(1)}°C city-wide.`,
    });
  }

  if (profile.hospital_dist_m > city.hospital_dist_m) {
    actions.push({
      id: "outreach",
      title: "Outreach priority",
      action: "Send health workers here first during heat alerts, and stock oral rehydration salts at the nearest clinic.",
      because: `Far from care: the nearest hospital averages ${fmtDistance(profile.hospital_dist_m)} away against ${fmtDistance(city.hospital_dist_m)} city-wide.`,
    });
  }

  const level = priorityFor(score);
  if (level === "Critical" || level === "High") {
    actions.push({
      id: "cool-room",
      title: "A public cool room",
      action: "Keep a school, community hall or library open as a cool room on heat-alert days.",
      because: `${level} priority: a score of ${score.toFixed(1)}, at or above 65.`,
    });
  }

  return actions;
}

export type HoverSummary = {
  name: string;
  level: PriorityLevel;
  score: number;
  rank: number | null;
  total: number;
  /** The factor pushing the score up hardest, or null when none is above the city average. */
  driver: string | null;
  /** Three or four measured values, each short enough for one line. */
  facts: string[];
  /** The k-means locality type, when the data carries one. */
  type: string | null;
};

/** What the map says about a locality under the pointer: enough to decide whether to click. */
export function hoverSummary(profile: WardProfile, data: WardProfileData): HoverSummary | null {
  if (profile.hvi === null) return null;
  return {
    name: profile.ward_id,
    level: priorityFor(profile.hvi),
    score: profile.hvi,
    rank: profile.rank,
    total: data.n_wards,
    driver: profile.top_driver && (profile.top_driver_contrib ?? 0) > 0 ? CONCERN_LABELS[profile.top_driver] : null,
    facts: [
      `${profile.LST_C.toFixed(1)}°C surface`,
      `${fmtDensity(profile.pop_density_km2)} people/km²`,
      `${fmtPct(profile.impervious_pct)} built-up`,
      `hospital ${fmtDistance(profile.hospital_dist_m)}`,
    ],
    type: typeOf(profile, data)?.name ?? null,
  };
}
