/**
 * The planner panel puts numbers in front of a planner under the heading "why
 * this locality ranks here". If those numbers do not add up to the score beside
 * them, the panel is explaining a different index from the one it shows. So the
 * central test here is arithmetic: for every published locality, the breakdown
 * must sum to the published score.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeatureCollection, Geometry } from "geojson";
import type { WardProfileData } from "./wardProfile";
import type { WardProps } from "./wardTypes";
import {
  PRIORITY_BANDS,
  builtForm,
  hoverSummary,
  mainConcern,
  peopleActions,
  priorityFor,
  scoreBreakdown,
  type ScoreBreakdown,
} from "./zonePlanner";

function readPublic<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "public", name), "utf8")) as T;
}

const wards = readPublic<FeatureCollection<Geometry, WardProps>>("wards_hvi.geojson").features.map((f) => f.properties);
const profiles = readPublic<WardProfileData>("ward_profiles.json");

const breakdownFor = (ward: WardProps) =>
  scoreBreakdown(ward, profiles.wards.find((p) => p.ward_id === ward.ward_id)!, profiles)!;

describe("priorityFor", () => {
  it("follows the map legend's break points", () => {
    expect(priorityFor(100)).toBe("Critical");
    expect(priorityFor(80)).toBe("Critical");
    expect(priorityFor(79.99)).toBe("High");
    expect(priorityFor(65)).toBe("High");
    expect(priorityFor(64.99)).toBe("Moderate");
    expect(priorityFor(50)).toBe("Moderate");
    expect(priorityFor(49.99)).toBe("Lower");
    expect(priorityFor(0)).toBe("Lower");
  });

  it("has bands in descending order with a catch-all at the bottom", () => {
    const mins = PRIORITY_BANDS.map((b) => b.min);
    expect([...mins].sort((a, b) => b - a)).toEqual(mins);
    expect(mins[mins.length - 1]).toBe(-Infinity);
  });
});

describe("scoreBreakdown on the published localities", () => {
  it("sums to the published score for every locality", () => {
    expect(wards.length).toBeGreaterThan(0);
    for (const ward of wards) {
      const breakdown = breakdownFor(ward);
      expect(breakdown.total, ward.ward_id).toBeCloseTo(ward.HVI as number, 6);
      const summed = breakdown.baseline + breakdown.factors.reduce((s, f) => s + f.points, 0);
      expect(summed, ward.ward_id).toBeCloseTo(ward.HVI as number, 6);
    }
  });

  it("starts every locality from the same baseline, the city-average score", () => {
    const baselines = new Set(wards.map((w) => breakdownFor(w).baseline));
    expect(baselines.size).toBe(1);
    expect([...baselines][0]).toBeCloseTo(profiles.city.hvi_mean, 6);
  });

  it("lists one row per indicator the city has, largest effect first", () => {
    for (const ward of wards) {
      const { factors } = breakdownFor(ward);
      expect(factors.map((f) => f.key).sort()).toEqual([...profiles.indicators].sort());
      const sizes = factors.map((f) => Math.abs(f.points));
      expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    }
  });

  it("uses weights that are shares of one index", () => {
    const { factors } = breakdownFor(wards[0]);
    expect(factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 6);
    for (const f of factors) expect(f.weight).toBeGreaterThan(0);
  });

  it("keeps the concern level between 0 and 100, with both ends reached", () => {
    for (const key of profiles.indicators) {
      const levels = wards.map((w) => breakdownFor(w).factors.find((f) => f.key === key)!.normalised);
      expect(Math.min(...levels)).toBeCloseTo(0, 6);
      expect(Math.max(...levels)).toBeCloseTo(100, 6);
    }
  });

  it("reads green cover as a deficit: the greenest locality is the least concerning", () => {
    const greenest = [...profiles.wards].sort((a, b) => b.NDVI - a.NDVI)[0];
    const ward = wards.find((w) => w.ward_id === greenest.ward_id)!;
    expect(breakdownFor(ward).factors.find((f) => f.key === "NDVI")!.normalised).toBeCloseTo(0, 6);
  });

  it("declines to produce a breakdown without the score scale", () => {
    const legacy = { ...profiles, score_scale: undefined };
    expect(scoreBreakdown(wards[0], profiles.wards[0], legacy)).toBeNull();
  });
});

describe("mainConcern", () => {
  const row = (key: ScoreBreakdown["factors"][number]["key"], points: number) => ({
    key,
    label: key,
    raw: "",
    cityRaw: "",
    normalised: 50,
    weight: 0.2,
    points,
    interpretation: "",
  });

  it("names the largest upward factors, biggest first", () => {
    const sentence = mainConcern({
      baseline: 60,
      total: 80,
      factors: [row("pop_density_km2", 12), row("impervious_pct", 9), row("LST_C", 3), row("hospital_dist_m", -4)],
    });
    expect(sentence).toBe(
      "High population density overlaps with heavily built-up surfaces and above-average surface heat.",
    );
  });

  it("does not name a factor that lowers the score", () => {
    const sentence = mainConcern({ baseline: 60, total: 62, factors: [row("LST_C", 6), row("NDVI", -4)] });
    expect(sentence).toBe("Above-average surface heat is what sets this locality apart from the city average.");
  });

  it("says so when nothing pushes the locality above the city average", () => {
    const sentence = mainConcern({ baseline: 60, total: 50, factors: [row("LST_C", -6), row("NDVI", 0.2)] });
    expect(sentence).toBe("No single factor pushes this locality above the city average.");
  });

  it("writes a complete sentence for every published locality", () => {
    for (const ward of wards) {
      const sentence = mainConcern(breakdownFor(ward));
      expect(sentence).toMatch(/^[A-Z].*\.$/);
    }
  });
});

describe("peopleActions", () => {
  const profileOf = (id: string) => profiles.wards.find((p) => p.ward_id === id)!;

  it("fires each rule exactly when its comparison with the city holds", () => {
    for (const profile of profiles.wards) {
      const ids = peopleActions(profile, profiles, profile.hvi as number).map((a) => a.id);
      expect(ids.includes("water"), profile.ward_id).toBe(profile.pop_density_km2 > profiles.city.pop_density_km2);
      expect(ids.includes("shade"), profile.ward_id).toBe(
        profile.impervious_pct > profiles.city.impervious_pct && profile.NDVI < profiles.city.NDVI,
      );
      expect(ids.includes("work-hours"), profile.ward_id).toBe(profile.LST_C > profiles.city.LST_C);
      expect(ids.includes("outreach"), profile.ward_id).toBe(profile.hospital_dist_m > profiles.city.hospital_dist_m);
      expect(ids.includes("cool-room"), profile.ward_id).toBe((profile.hvi as number) >= 65);
    }
  });

  it("states the numbers a rule fired on", () => {
    for (const profile of profiles.wards) {
      for (const action of peopleActions(profile, profiles, profile.hvi as number)) {
        expect(action.because, `${profile.ward_id} ${action.id}`).toMatch(/\d/);
        expect(action.action.trim()).not.toBe("");
      }
    }
  });

  it("drops the cool room when a what-if scenario takes the score below the High band", () => {
    const top = profileOf(wards[0].ward_id);
    expect(peopleActions(top, profiles, 80).some((a) => a.id === "cool-room")).toBe(true);
    expect(peopleActions(top, profiles, 60).some((a) => a.id === "cool-room")).toBe(false);
  });

  it("gives every locality in the city something or nothing, never an error", () => {
    const counts = profiles.wards.map((p) => peopleActions(p, profiles, p.hvi as number).length);
    expect(Math.max(...counts)).toBeGreaterThan(0);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(0);
  });
});

describe("hoverSummary", () => {
  it("summarises every published locality with its band, rank and four facts", () => {
    for (const profile of profiles.wards) {
      const summary = hoverSummary(profile, profiles)!;
      expect(summary.name).toBe(profile.ward_id);
      expect(summary.level).toBe(priorityFor(profile.hvi as number));
      expect(summary.rank).toBe(profile.rank);
      expect(summary.total).toBe(profiles.n_wards);
      expect(summary.facts).toHaveLength(4);
    }
  });

  it("names a driver only when a factor is above the city average", () => {
    const profile = profiles.wards[0];
    expect(hoverSummary({ ...profile, top_driver_contrib: 0.2 }, profiles)!.driver).not.toBeNull();
    expect(hoverSummary({ ...profile, top_driver_contrib: -0.1 }, profiles)!.driver).toBeNull();
  });

  it("returns nothing for a locality with no score", () => {
    expect(hoverSummary({ ...profiles.wards[0], hvi: null }, profiles)).toBeNull();
  });
});

describe("builtForm", () => {
  it("describes land cover, in four bands", () => {
    expect(builtForm(95)).toBe("Dense built-up area");
    expect(builtForm(85)).toBe("Dense built-up area");
    expect(builtForm(70)).toBe("Mostly built-up area");
    expect(builtForm(40)).toBe("Mixed built and open land");
    expect(builtForm(10)).toBe("Urban fringe, mostly open land");
  });
});
