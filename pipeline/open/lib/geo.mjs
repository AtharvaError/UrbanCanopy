/**
 * Planar geometry over GeoJSON polygons, and the projection to do it in.
 *
 * Everything metric (areas, distances, the fishnet) happens in the city's UTM
 * zone, never in degrees. Geometries stay as plain GeoJSON coordinate arrays so
 * nothing here needs a native geometry library.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import proj4 from "proj4";

/** Best-fit UTM EPSG code for a [min_lon, min_lat, max_lon, max_lat] box. Mirrors `utm_crs_for` in pipeline/_city.py. */
export function utmEpsgFor(bbox) {
  const lon = (bbox[0] + bbox[2]) / 2;
  const lat = (bbox[1] + bbox[3]) / 2;
  const zone = Math.floor((lon + 180) / 6) + 1;
  return `EPSG:${lat >= 0 ? 326 : 327}${String(zone).padStart(2, "0")}`;
}

/** Forward and inverse transforms between WGS84 lon/lat and a UTM EPSG code. */
export function utmProjector(epsg) {
  const code = Number(epsg.replace("EPSG:", ""));
  const south = Math.floor(code / 100) === 327;
  const zone = code % 100;
  const def = `+proj=utm +zone=${zone} ${south ? "+south " : ""}+datum=WGS84 +units=m +no_defs`;
  const p = proj4("EPSG:4326", def);
  return {
    forward: ([lon, lat]) => p.forward([lon, lat]),
    inverse: ([x, y]) => p.inverse([x, y]),
  };
}

/** Every polygon in a Polygon or MultiPolygon, each as [outer, ...holes]. */
export function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

/** A polygon list back to the simplest GeoJSON geometry that holds it. */
export function geometryFrom(polygons) {
  if (polygons.length === 0) return null;
  if (polygons.length === 1) return { type: "Polygon", coordinates: polygons[0] };
  return { type: "MultiPolygon", coordinates: polygons };
}

export function mapGeometry(geometry, fn) {
  return geometryFrom(polygonsOf(geometry).map((rings) => rings.map((ring) => ring.map(fn))));
}

/** Shoelace. Positive means counter-clockwise. */
export function signedRingArea(ring) {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    twice += x1 * y2 - x2 * y1;
  }
  return twice / 2;
}

export function polygonArea(rings) {
  if (rings.length === 0) return 0;
  let area = Math.abs(signedRingArea(rings[0]));
  for (const hole of rings.slice(1)) area -= Math.abs(signedRingArea(hole));
  return Math.max(area, 0);
}

export function geometryArea(geometry) {
  return polygonsOf(geometry).reduce((sum, rings) => sum + polygonArea(rings), 0);
}

/** Area-weighted centroid of a geometry's outer rings. */
export function centroid(geometry) {
  let sx = 0;
  let sy = 0;
  let sa = 0;
  for (const rings of polygonsOf(geometry)) {
    const ring = rings[0];
    let cx = 0;
    let cy = 0;
    let twice = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      const cross = x1 * y2 - x2 * y1;
      twice += cross;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
    }
    if (twice === 0) continue;
    const area = Math.abs(twice / 2);
    sx += (cx / (3 * twice)) * area;
    sy += (cy / (3 * twice)) * area;
    sa += area;
  }
  return sa === 0 ? null : [sx / sa, sy / sa];
}

export function bboxOf(geometry) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rings of polygonsOf(geometry)) {
    for (const [x, y] of rings[0]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(x, y, geometry) {
  for (const rings of polygonsOf(geometry)) {
    if (!pointInRing(x, y, rings[0])) continue;
    if (rings.slice(1).some((hole) => pointInRing(x, y, hole))) continue;
    return true;
  }
  return false;
}

function pointSegmentDistance(px, py, [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Whether two geometries touch or overlap, within `tolerance` in their own units. */
export function geometriesAdjacent(a, b, tolerance) {
  const [ax0, ay0, ax1, ay1] = bboxOf(a);
  const [bx0, by0, bx1, by1] = bboxOf(b);
  if (ax0 - tolerance > bx1 || bx0 - tolerance > ax1 || ay0 - tolerance > by1 || by0 - tolerance > ay1) return false;
  const ringsA = polygonsOf(a).map((r) => r[0]);
  const ringsB = polygonsOf(b).map((r) => r[0]);
  for (const ra of ringsA) {
    for (const [px, py] of ra) {
      for (const rb of ringsB) {
        for (let i = 0; i < rb.length - 1; i++) {
          if (pointSegmentDistance(px, py, rb[i], rb[i + 1]) <= tolerance) return true;
        }
      }
    }
  }
  return false;
}

/** Douglas-Peucker on a closed ring, keeping it closed. */
export function simplifyRing(ring, tolerance) {
  const open = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
  if (open.length < 4) return ring;
  const keep = new Uint8Array(open.length);
  // Anchor on the two vertices furthest apart, so a ring has a real chord to
  // measure against instead of a zero-length one from its own start to itself.
  let far = 0;
  let farDist = -1;
  for (let i = 1; i < open.length; i++) {
    const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]);
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  keep[0] = 1;
  keep[far] = 1;
  const stack = [[0, far], [far, open.length]];
  while (stack.length) {
    const [start, end] = stack.pop();
    const endPoint = open[end % open.length];
    let worst = -1;
    let worstDist = tolerance;
    for (let i = start + 1; i < end; i++) {
      const d = pointSegmentDistance(open[i][0], open[i][1], open[start], endPoint);
      if (d > worstDist) {
        worstDist = d;
        worst = i;
      }
    }
    if (worst !== -1) {
      keep[worst] = 1;
      stack.push([start, worst], [worst, end]);
    }
  }
  const out = open.filter((_, i) => keep[i]);
  if (out.length < 3) return ring;
  out.push(out[0]);
  return out;
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value, indent = undefined) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, indent), "utf8");
}

export function featureCollection(name, features) {
  return {
    type: "FeatureCollection",
    name,
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
    features,
  };
}
