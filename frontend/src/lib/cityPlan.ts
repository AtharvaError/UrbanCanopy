/**
 * The city action plan: the planner's per-locality suggestions, added up.
 *
 * The planner answers "what should happen in this locality?". A commissioner
 * asks the other question: "what does the whole city need, and where first?".
 * Nothing new is decided here. Each locality's actions come from the same
 * `peopleActions` rules its own panel uses, and the longer-term measures from
 * the same recommendations file, so the plan and the panels cannot disagree.
 */

import type { WardProfileData } from "./wardProfile";
import type { NbsRec } from "./wardTypes";
import { PEOPLE_ACTION_CATALOGUE, PRIORITY_BANDS, peopleActions, priorityFor, type PriorityLevel } from "./zonePlanner";

export type CityPlanRow = {
  wardId: string;
  rank: number;
  score: number;
  level: PriorityLevel;
  /** Ids of the people-focused actions whose rule fires here. */
  actions: string[];
  /** The locality's first-priority longer-term measure, or null when the rules name none. */
  longTerm: string | null;
};

export type CityPlan = {
  /** Every scored locality, most concerning first. */
  rows: CityPlanRow[];
  bands: { level: PriorityLevel; count: number }[];
  /** Each people-focused action with the localities it applies to, most concerning first. */
  actions: { id: string; title: string; rule: string; localities: string[] }[];
  /** Each longer-term measure with how many localities and grid cells it covers, widest first. */
  longTerm: { intervention: string; localities: number; cells: number }[];
};

export function buildCityPlan(data: WardProfileData, recs: NbsRec[]): CityPlan {
  const rows: CityPlanRow[] = data.wards
    .filter((ward): ward is typeof ward & { hvi: number; rank: number } => ward.hvi !== null && ward.rank !== null)
    .map((ward) => {
      const own = recs.filter((r) => r.ward_id === ward.ward_id).sort((a, b) => a.priority - b.priority);
      return {
        wardId: ward.ward_id,
        rank: ward.rank,
        score: ward.hvi,
        level: priorityFor(ward.hvi),
        actions: peopleActions(ward, data, ward.hvi).map((a) => a.id),
        longTerm: own[0]?.intervention ?? null,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.wardId.localeCompare(b.wardId));

  const interventions = new Map<string, { localities: Set<string>; cells: number }>();
  for (const rec of recs) {
    const entry = interventions.get(rec.intervention) ?? { localities: new Set<string>(), cells: 0 };
    entry.localities.add(rec.ward_id);
    entry.cells += rec.cell_count;
    interventions.set(rec.intervention, entry);
  }

  return {
    rows,
    bands: PRIORITY_BANDS.map(({ level }) => ({ level, count: rows.filter((r) => r.level === level).length })),
    actions: PEOPLE_ACTION_CATALOGUE.map((action) => ({
      ...action,
      localities: rows.filter((r) => r.actions.includes(action.id)).map((r) => r.wardId),
    })),
    longTerm: [...interventions]
      .map(([intervention, entry]) => ({ intervention, localities: entry.localities.size, cells: entry.cells }))
      .sort((a, b) => b.localities - a.localities || b.cells - a.cells || a.intervention.localeCompare(b.intervention)),
  };
}

/**
 * One CSV field. Quoted when it needs to be, and never able to start a formula:
 * locality names come from a public map anyone can edit, and a spreadsheet
 * runs a cell that begins with =, +, - or @ as a formula.
 */
function csvField(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The plan's table as CSV, one row per locality, for a spreadsheet. */
export function cityPlanCsv(plan: CityPlan): string {
  const header = ["Rank", "Locality", "Priority", "Score", ...plan.actions.map((a) => a.title), "Longer-term cooling"];
  const lines = plan.rows.map((row) => [
    row.rank,
    row.wardId,
    row.level,
    row.score.toFixed(1),
    ...plan.actions.map((a) => (row.actions.includes(a.id) ? "Yes" : "")),
    row.longTerm ?? "",
  ]);
  return [header, ...lines].map((line) => line.map(csvField).join(",")).join("\r\n") + "\r\n";
}
