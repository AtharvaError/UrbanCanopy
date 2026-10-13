/**
 * Turns the published cell and ward snapshots into the compact payload the
 * scenario builder draws from.
 *
 * Runs on the server (see `simulate/ScenarioBuilder.tsx`). The two GeoJSON
 * files are about 2 MB between them and the builder needs a fraction of that:
 * six numbers per cell and an outline it can draw. Projecting to SVG paths here
 * means the browser receives shapes ready to render instead of coordinates to
 * project, and the map needs no tile server, which matters for a page that has
 * to keep working offline in front of an audience.
 */

import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { hviPointsPerDegree, type ScenarioCell } from "./scenario";
import { INDICATOR_KEYS } from "./wardTypes";

export type MapCell = ScenarioCell & {
  /** SVG path in the payload's viewBox units. */
  d: string;
};

export type MapWard = { id: string; d: string };

export type ScenarioData = {
  cells: MapCell[];
  wards: MapWard[];
  viewBox: { width: number; height: number };
  /** See `hviPointsPerDegree`. */
  pointsPerDegree: number;
};

type CellProps = {
  grid_id: string;
  ward_id: string;
  HVI: number | null;
  LST_C: number | null;
  impervious_pct: number | null;
  pop_density_km2: number | null;
  plantable: boolean | number | null;
  [key: string]: unknown;
};

/**
 * The published cells reduced to what the scenario engine needs, with the
 * index's sensitivity to cooling. No geometry is kept beyond measuring each
 * cell's area, so this is cheap enough to run in the browser.
 */
export function scenarioCellsFrom(cellsGeo: FeatureCollection<Geometry, CellProps>): {
  features: Feature<Geometry, CellProps & { HVI: number; LST_C: number }>[];
  cells: ScenarioCell[];
  pointsPerDegree: number;
} {
  const features = cellsGeo.features.filter(
    (f): f is Feature<Geometry, CellProps & { HVI: number; LST_C: number }> =>
      f.geometry !== null &&
      typeof f.properties.HVI === "number" &&
      typeof f.properties.LST_C === "number",
  );
  const cells = features.map((f) => {
    const p = f.properties;
    return {
      id: p.grid_id,
      wardId: p.ward_id,
      hvi: p.HVI,
      imperviousPct: p.impervious_pct ?? 0,
      plantable: p.plantable === true || p.plantable === 1,
      treePct: typeof p.tree_pct === "number" ? p.tree_pct : 0,
      population: Math.round((p.pop_density_km2 ?? 0) * geometryAreaKm2(f.geometry)),
    };
  });
  const pointsPerDegree = hviPointsPerDegree(
    features.map((f) => ({
      lstC: f.properties.LST_C,
      contribLst: Number(f.properties.contrib_LST_C ?? 0),
      rawScore: INDICATOR_KEYS.reduce((sum, key) => sum + Number(f.properties[`contrib_${key}`] ?? 0), 0),
    })),
  );
  return { features, cells, pointsPerDegree };
}

const VIEW_WIDTH = 400;
const METRES_PER_DEG_LAT = 110_574;
const METRES_PER_DEG_LNG_EQUATOR = 111_320;

/** Outer ring first, then holes, for every polygon in the geometry. */
function polygonsOf(geometry: Geometry | null): Position[][][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function ringAreaM2(ring: Position[], cosLat: number): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    twice += x1 * y2 - x2 * y1;
  }
  return (Math.abs(twice) / 2) * METRES_PER_DEG_LNG_EQUATOR * cosLat * METRES_PER_DEG_LAT;
}

/**
 * Planar area in km2. Cells are nominally 1 km squares, but the ones on the
 * coast are clipped to the land, so counting cells would overstate how many
 * people live in them.
 */
export function geometryAreaKm2(geometry: Geometry | null): number {
  let m2 = 0;
  for (const rings of polygonsOf(geometry)) {
    if (rings.length === 0) continue;
    const cosLat = Math.cos((rings[0][0][1] * Math.PI) / 180);
    m2 += ringAreaM2(rings[0], cosLat);
    for (const hole of rings.slice(1)) m2 -= ringAreaM2(hole, cosLat);
  }
  return Math.max(m2, 0) / 1e6;
}

export function buildScenarioData(
  cellsGeo: FeatureCollection<Geometry, CellProps>,
  wardsGeo: FeatureCollection<Geometry, { ward_id: string }>,
): ScenarioData | null {
  const scenario = scenarioCellsFrom(cellsGeo);
  const usable = scenario.features;
  if (usable.length === 0) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const f of [...usable, ...wardsGeo.features]) {
    for (const rings of polygonsOf(f.geometry)) {
      for (const [lng, lat] of rings[0] ?? []) {
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }

  // Equirectangular with one cosine correction at the city's mid-latitude. Over
  // 40 km of latitude the distortion is well under a pixel at this size.
  const cosLat = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const scale = VIEW_WIDTH / ((maxLng - minLng) * cosLat);
  const project = ([lng, lat]: Position): [number, number] => [
    (lng - minLng) * cosLat * scale,
    (maxLat - lat) * scale,
  ];

  /** Drops vertices closer than `tolerance` units to the last one kept. */
  const pathOf = (geometry: Geometry | null, tolerance: number): string => {
    const parts: string[] = [];
    for (const rings of polygonsOf(geometry)) {
      for (const ring of rings) {
        let last: [number, number] | null = null;
        const points: string[] = [];
        for (const position of ring) {
          const p = project(position);
          if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < tolerance) continue;
          points.push(`${p[0].toFixed(1)} ${p[1].toFixed(1)}`);
          last = p;
        }
        if (points.length >= 3) parts.push(`M${points.join("L")}Z`);
      }
    }
    return parts.join("");
  };

  const cells: MapCell[] = scenario.cells.map((cell, i) => ({ ...cell, d: pathOf(usable[i].geometry, 0.3) }));

  return {
    cells,
    wards: wardsGeo.features.map((f) => ({ id: f.properties.ward_id, d: pathOf(f.geometry, 1.5) })),
    viewBox: { width: VIEW_WIDTH, height: Math.ceil((maxLat - minLat) * scale) },
    pointsPerDegree: scenario.pointsPerDegree,
  };
}
