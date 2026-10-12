/**
 * WARD_AREAS is a hand-maintained lookup read by area id. An entry for an id
 * the pipeline does not publish is a label nothing will ever show, and the UI
 * spreads the lookup's result straight into JSX, so a missing id must come
 * back as an empty list. Tying the lookup to the published GeoJSON makes a
 * stale table a test failure instead of a blank label found during a demo.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeatureCollection, Geometry } from "geojson";
import { WARD_AREAS, areasForWard } from "./wardAreas";

const wardsGeo = JSON.parse(
  readFileSync(join(process.cwd(), "public", "wards_hvi.geojson"), "utf8")
) as FeatureCollection<Geometry, { ward_id: string }>;

const wardIdsInData = wardsGeo.features.map((f) => f.properties.ward_id);

describe("areasForWard", () => {
  it("returns an empty array for an unknown id rather than undefined", () => {
    // Callers spread this straight into JSX; undefined would throw.
    expect(areasForWard("ZZ")).toEqual([]);
    expect(areasForWard("")).toEqual([]);
  });

  it("returns an array for every published area", () => {
    for (const id of wardIdsInData) expect(Array.isArray(areasForWard(id))).toBe(true);
  });
});

describe("WARD_AREAS", () => {
  it("has no entries for areas that do not exist in the data", () => {
    const orphaned = Object.keys(WARD_AREAS).filter((id) => !wardIdsInData.includes(id));
    expect(orphaned).toEqual([]);
  });

  it("lists only non-empty place names", () => {
    for (const [wardId, areas] of Object.entries(WARD_AREAS)) {
      expect(areas.length, `${wardId} has no places`).toBeGreaterThan(0);
      for (const area of areas) expect(area.trim()).not.toBe("");
    }
  });
});
