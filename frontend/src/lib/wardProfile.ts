/**
 * Ward profiles: the shape of `public/ward_profiles.json` (written by
 * pipeline/10_ward_profile.py) plus the plain-language rendering of it.
 *
 * Every sentence and every formatted figure here traces back to a field in that
 * file. Nothing is invented, nothing is rounded into a claim the data does not
 * support, and proxies are named as proxies: NDVI is a vegetation index, not a
 * canopy percentage, and the slum layer is a mapped proxy
 * rather than a ward-level census count (docs/methodology.md, section 10).
 *
 * Kept as pure functions so the copy is deterministic and reviewable without
 * rendering anything.
 */

import type { LocalityTypes } from "./localityTypes";
import { FACTOR_LABELS, type IndicatorKey } from "./wardTypes";

export type CityProfile = {
  hvi_mean: number;
  LST_C: number;
  NDVI: number;
  pop_density_km2: number;
  child_pct: number;
  slum_pct: number;
  hospital_dist_m: number;
  impervious_pct: number;
  /** City-wide share mapped as tree cover, 0 to 100. Absent from older builds. */
  tree_pct?: number | null;
  /** City-wide mean surface-temperature change between the two seasons in `change_windows`. */
  lst_change_c?: number | null;
};

/** A season of imagery, as ISO dates. */
export type SeasonWindow = { start: string; end: string };

export type NeighbourRef = { ward_id: string; hvi: number };

export type WardProfile = {
  ward_id: string;
  ward_gid: number;
  hvi: number | null;
  rank: number | null;
  n_cells: number | null;
  percentile: number | null;
  LST_C: number;
  LST_C_delta_city: number;
  NDVI: number;
  NDVI_delta_city: number;
  pop_density_km2: number;
  pop_density_km2_delta_city: number;
  child_pct: number;
  child_pct_delta_city: number;
  slum_pct: number;
  slum_pct_delta_city: number;
  hospital_dist_m: number;
  hospital_dist_m_delta_city: number;
  impervious_pct: number;
  impervious_pct_delta_city: number;
  top_driver?: IndicatorKey;
  top_driver_contrib?: number;
  neighbours: string[];
  /** Which k-means locality type this one was assigned (see `locality_types`). */
  type_id?: number;
  /** Share of the locality ESA WorldCover maps as tree cover, 0 to 100. Context, not part of the score. */
  tree_pct?: number | null;
  /**
   * How much more (positive) or less the surface warmed here than across the
   * city between the two seasons in `change_windows`. Degrees C. Context, not
   * part of the score.
   */
  lst_change_vs_city_c?: number | null;
  coolest_neighbour?: NeighbourRef;
  hottest_neighbour?: NeighbourRef;
};

export type WardProfileData = {
  generated_from: string;
  n_cells: number;
  n_wards: number;
  indicators: IndicatorKey[];
  units: Record<string, string>;
  /** Each indicator's share of the index. Absent from profiles written before the planner panel. */
  weights?: Partial<Record<IndicatorKey, number>>;
  /**
   * What turns a contribution into score points:
   * score = baseline_points + sum(contribution x points_per_contribution).
   */
  score_scale?: { baseline_points: number; points_per_contribution: number };
  /**
   * What each indicator is standardised against, and which way it counts
   * (+1 adds to the score, -1 lowers it). With `weights` and `score_scale`
   * this is the whole formula: a score can be computed from a locality's five
   * values with nothing else.
   */
  indicator_stats?: Partial<Record<IndicatorKey, { mean: number; std: number; direction: 1 | -1 }>>;
  /** The k-means grouping of localities into kinds of place. Absent from older profile files. */
  locality_types?: LocalityTypes;
  /** The two seasons the change layers compare. Absent from older builds. */
  change_windows?: { previous: SeasonWindow; current: SeasonWindow };
  city: CityProfile;
  wards: WardProfile[];
};

export const WARD_PROFILES_URL = "/ward_profiles.json";

/** Below this the ward is not meaningfully warmer or cooler than the city. */
const TEMP_PARITY_C = 0.15;

export function fmtTemp(c: number): string {
  return `${c.toFixed(1)} C`;
}

export function fmtNdvi(v: number): string {
  return v.toFixed(2);
}

export function fmtPct(v: number): string {
  return `${Math.round(v)}%`;
}

/** People per square kilometre, rounded to the nearest hundred. Precision past
 *  that would imply the WorldPop surface is sharper than it is. Indian digit
 *  grouping, since this is a Mumbai civic tool. */
export function fmtDensity(v: number): string {
  return (Math.round(v / 100) * 100).toLocaleString("en-IN");
}

export function fmtDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 10) * 10} m`;
}

/** "1st", "2nd", "3rd", "4th" ... */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function factorLabel(key: IndicatorKey): string {
  return FACTOR_LABELS[key];
}

/**
 * Two or three sentences describing the ward from its measured indicators.
 * Reads as prose, but every number is a field lookup.
 */
export function describeWard(ward: WardProfile, city: CityProfile): string[] {
  const sentences: string[] = [];

  const delta = ward.LST_C_delta_city;
  const cells = ward.n_cells ?? 0;
  const cellPhrase = cells === 1 ? "its single grid cell" : `its ${cells} grid cells`;
  if (Math.abs(delta) < TEMP_PARITY_C) {
    sentences.push(
      `${ward.ward_id} runs about as warm as the rest of the city across ${cellPhrase}, averaging ${fmtTemp(ward.LST_C)} at the surface.`
    );
  } else {
    const direction = delta > 0 ? "hotter" : "cooler";
    sentences.push(
      `${ward.ward_id} runs about ${fmtTemp(Math.abs(delta))} ${direction} than the city average across ${cellPhrase}, at ${fmtTemp(ward.LST_C)} of land surface temperature.`
    );
  }

  sentences.push(
    `Green cover reads ${fmtNdvi(ward.NDVI)} on the NDVI index against ${fmtNdvi(city.NDVI)} city-wide, and ${fmtPct(ward.impervious_pct)} of the ground is built or paved.`
  );

  sentences.push(
    `Around ${fmtDensity(ward.pop_density_km2)} people live per square kilometre, and the nearest hospital averages ${fmtDistance(ward.hospital_dist_m)} away.`
  );

  return sentences;
}

/** One line on which factor pushes this ward's score up hardest. */
export function describeTopDriver(ward: WardProfile): string | null {
  if (!ward.top_driver) return null;
  return `Biggest driver: ${factorLabel(ward.top_driver).toLowerCase()}.`;
}
