/**
 * Well-known places inside each area, for areas that are known by a code.
 *
 * Mumbai's BMC wards are codes ("K/E"), and this table is what let a resident
 * find "Andheri East" without knowing that. The areas this deployment publishes
 * are localities named for the place itself ("Sitabuldi"), so there is nothing
 * to translate and the table is empty: the name on the map is already the name
 * a resident would search for.
 *
 * The lookup stays so the list search, the map tooltip and the hero model keep
 * one code path whichever kind of area a city has.
 */
export const WARD_AREAS: Record<string, string[]> = {};

export function areasForWard(wardId: string): string[] {
  return WARD_AREAS[wardId] ?? [];
}
