/**
 * The city action plan is the planner's own suggestions added up. These tests
 * hold it to that: every tick in the plan's table is a rule firing in a
 * locality's own panel, and nothing appears in the plan that a panel would not
 * show.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCityPlan, cityPlanCsv } from "./cityPlan";
import type { WardProfile, WardProfileData } from "./wardProfile";
import type { NbsRec } from "./wardTypes";
import { PEOPLE_ACTION_CATALOGUE, peopleActions, priorityFor } from "./zonePlanner";

const read = <T,>(name: string) => JSON.parse(readFileSync(join(process.cwd(), "public", name), "utf-8")) as T;
const data = read<WardProfileData>("ward_profiles.json");
const recs = read<NbsRec[]>("nbs_recommendations.json");
const plan = buildCityPlan(data, recs);

describe("the catalogue of people-focused actions", () => {
  it("lists exactly the actions the planner can suggest, with the planner's own titles", () => {
    // A locality worse than the city on every measure fires every rule.
    const city = { hvi_mean: 60, LST_C: 40, NDVI: 0.3, pop_density_km2: 1000, child_pct: 0, slum_pct: 0, hospital_dist_m: 500, impervious_pct: 40 };
    const worst = { ...city, ward_id: "x", hvi: 90, pop_density_km2: 9000, impervious_pct: 90, NDVI: 0.1, LST_C: 45, hospital_dist_m: 2000 };
    const all = peopleActions(worst as unknown as WardProfile, { city } as unknown as WardProfileData, 90);
    expect(PEOPLE_ACTION_CATALOGUE.map((a) => a.id)).toEqual(all.map((a) => a.id));
    expect(PEOPLE_ACTION_CATALOGUE.map((a) => a.title)).toEqual(all.map((a) => a.title));
    for (const action of PEOPLE_ACTION_CATALOGUE) expect(action.rule.length).toBeGreaterThan(10);
  });
});

describe("buildCityPlan on the published data", () => {
  it("has every scored locality once, most concerning first", () => {
    expect(plan.rows.length).toBe(data.wards.filter((w) => w.hvi !== null).length);
    expect(new Set(plan.rows.map((r) => r.wardId)).size).toBe(plan.rows.length);
    expect(plan.rows.map((r) => r.rank)).toEqual([...plan.rows.map((r) => r.rank)].sort((a, b) => a - b));
  });

  it("gives each locality exactly the actions its own planner panel shows", () => {
    for (const row of plan.rows) {
      const ward = data.wards.find((w) => w.ward_id === row.wardId)!;
      expect(row.actions).toEqual(peopleActions(ward, data, ward.hvi as number).map((a) => a.id));
      expect(row.level).toBe(priorityFor(ward.hvi as number));
    }
  });

  it("counts every locality in exactly one band", () => {
    expect(plan.bands.reduce((s, b) => s + b.count, 0)).toBe(plan.rows.length);
    for (const band of plan.bands) {
      expect(band.count).toBe(plan.rows.filter((r) => r.level === band.level).length);
    }
  });

  it("lists, under each action, the localities ticked for it and no others", () => {
    for (const action of plan.actions) {
      const ticked = plan.rows.filter((r) => r.actions.includes(action.id)).map((r) => r.wardId);
      expect(action.localities).toEqual(ticked);
    }
    // A cool room is for the Critical and High bands, so its count is theirs.
    const coolRooms = plan.actions.find((a) => a.id === "cool-room")!;
    expect(coolRooms.localities.length).toBe(plan.rows.filter((r) => r.level === "Critical" || r.level === "High").length);
  });

  it("takes a locality's longer-term measure from its first-priority recommendation", () => {
    for (const row of plan.rows) {
      const own = recs.filter((r) => r.ward_id === row.wardId).sort((a, b) => a.priority - b.priority);
      expect(row.longTerm).toBe(own[0]?.intervention ?? null);
    }
  });

  it("adds up longer-term measures without losing or inventing a cell", () => {
    expect(plan.longTerm.reduce((s, m) => s + m.cells, 0)).toBe(recs.reduce((s, r) => s + r.cell_count, 0));
    for (const measure of plan.longTerm) {
      expect(measure.localities).toBe(new Set(recs.filter((r) => r.intervention === measure.intervention).map((r) => r.ward_id)).size);
    }
  });
});

describe("cityPlanCsv", () => {
  const csv = cityPlanCsv(plan);
  const lines = csv.trimEnd().split("\r\n");

  it("has a header and one line per locality", () => {
    expect(lines.length).toBe(plan.rows.length + 1);
    expect(lines[0]).toBe(
      ["Rank", "Locality", "Priority", "Score", ...PEOPLE_ACTION_CATALOGUE.map((a) => a.title), "Longer-term cooling"].join(","),
    );
  });

  it("writes the top locality as the page shows it", () => {
    const top = plan.rows[0];
    expect(lines[1].startsWith(`${top.rank},${top.wardId},${top.level},${top.score.toFixed(1)},`)).toBe(true);
  });

  it("quotes a field that contains a comma or a quote", () => {
    const awkward = buildCityPlan(
      { ...data, wards: [{ ...data.wards[0], ward_id: 'Gandhi "Bagh", East' }] },
      [],
    );
    expect(cityPlanCsv(awkward).split("\r\n")[1]).toContain('"Gandhi ""Bagh"", East"');
  });

  it("cannot be made to run a spreadsheet formula by a place name", () => {
    for (const name of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)"]) {
      const hostile = buildCityPlan({ ...data, wards: [{ ...data.wards[0], ward_id: name }] }, []);
      const field = cityPlanCsv(hostile).split("\r\n")[1].split(",")[1];
      expect(field.replace(/^"/, "").startsWith("'"), name).toBe(true);
    }
  });

  it("leaves a negative number alone, since only text is escaped", () => {
    // Scores are never negative, but the rule must not mangle a number if one were.
    expect(cityPlanCsv({ ...plan, rows: [{ ...plan.rows[0], rank: -1 }] }).split("\r\n")[1].startsWith("-1,")).toBe(true);
  });
});
