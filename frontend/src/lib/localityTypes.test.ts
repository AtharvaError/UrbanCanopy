/**
 * The locality types are computed by the data build and only read here, so
 * what needs holding is that the published grouping is a real partition (every
 * locality in exactly one type) and that the site reads it back faithfully.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TYPE_COLOR_COUNT, typeColor, typeOf } from "./localityTypes";
import type { WardProfileData } from "./wardProfile";

const data = JSON.parse(readFileSync(join(process.cwd(), "public", "ward_profiles.json"), "utf8")) as WardProfileData;
const types = data.locality_types!;

describe("the published locality types", () => {
  it("puts every locality in exactly one type", () => {
    const listed = types.types.flatMap((t) => t.members);
    expect([...listed].sort()).toEqual(data.wards.map((w) => w.ward_id).sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("agrees between each type's member list and each locality's own type id", () => {
    for (const ward of data.wards) {
      const type = types.types.find((t) => t.members.includes(ward.ward_id))!;
      expect(ward.type_id, ward.ward_id).toBe(type.id);
    }
  });

  it("has the number of types it says it chose, each one named, described and non-empty", () => {
    expect(types.types).toHaveLength(types.k);
    expect(new Set(types.types.map((t) => t.name)).size).toBe(types.k);
    for (const type of types.types) {
      expect(type.n).toBe(type.members.length);
      expect(type.n).toBeGreaterThan(0);
      expect(type.name.trim()).not.toBe("");
      expect(type.description).toMatch(/\.$/);
    }
  });

  it("numbers the types by mean score, highest first", () => {
    const means = types.types.map((t) => t.mean_score);
    expect([...means].sort((a, b) => b - a)).toEqual(means);
    expect(types.types.map((t) => t.id)).toEqual(types.types.map((_, i) => i));
  });

  it("publishes the figures behind the choice of k", () => {
    const chosen = types.candidates.find((c) => c.k === types.k)!;
    expect(chosen.silhouette).toBeCloseTo(types.silhouette, 9);
    expect(types.silhouette).toBeGreaterThan(0);
    expect(types.candidates.length).toBeGreaterThan(1);
  });

  it("never needs more colours than are defined", () => {
    expect(types.k).toBeLessThanOrEqual(TYPE_COLOR_COUNT);
    expect(new Set(types.types.map((t) => typeColor(t.id))).size).toBe(types.k);
  });
});

describe("typeOf", () => {
  it("returns each locality's published type", () => {
    for (const ward of data.wards) expect(typeOf(ward, data)!.members).toContain(ward.ward_id);
  });

  it("returns null when there is nothing to read", () => {
    expect(typeOf(null, data)).toBeNull();
    expect(typeOf(data.wards[0], { ...data, locality_types: undefined })).toBeNull();
    expect(typeOf({ ...data.wards[0], type_id: undefined }, data)).toBeNull();
  });
});
