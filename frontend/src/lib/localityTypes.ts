/**
 * Locality types: the k-means grouping the data build publishes in
 * `ward_profiles.json` (pipeline/open/07_profiles.mjs).
 *
 * A type is not a risk level. The score already ranks localities; the type says
 * what kind of place one is, from the same five indicators. It is read off the
 * published file here and never recomputed, so the label on the map, in the
 * panel and on the calculator page is one label.
 */

import type { WardProfile, WardProfileData } from "./wardProfile";

export type LocalityType = {
  id: number;
  name: string;
  /** Which indicators set this type apart from the average locality, in words. */
  description: string;
  n: number;
  mean_score: number;
  /** The type's centre, in standard deviations from the average locality. */
  centroid_z: Record<string, number>;
  members: string[];
};

export type LocalityTypes = {
  method: string;
  k: number;
  /** -1 to 1. Higher means the types are more cleanly separated. */
  silhouette: number;
  /** The rule that chose k. */
  selection: string;
  candidates: { k: number; silhouette: number; inertia: number }[];
  types: LocalityType[];
};

/**
 * One colour per type, by id. The four are defined in globals.css with a light
 * and a dark value each, and were checked as a set for separation under
 * colour-vision deficiency. They are deliberately not the vulnerability ramp:
 * a type is a kind, not an amount, and must not look like a score.
 */
export const TYPE_COLOR_COUNT = 4;

export function typeColor(id: number): string {
  return `var(--type-${(id % TYPE_COLOR_COUNT) + 1})`;
}

/** The type a locality was assigned, or null when the file has no types. */
export function typeOf(profile: WardProfile | null | undefined, data: WardProfileData | null | undefined): LocalityType | null {
  if (!profile || !data?.locality_types || typeof profile.type_id !== "number") return null;
  return data.locality_types.types.find((t) => t.id === profile.type_id) ?? null;
}
