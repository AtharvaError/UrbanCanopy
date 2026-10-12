/**
 * Stage 02 (open build): the analysis grid.
 *
 * The same construction as pipeline/01_grid.py: a square fishnet in the city's
 * UTM zone, clipped to the area boundaries. A cell that straddles a boundary
 * splits on the clip, and only its largest fragment is kept, so every cell
 * belongs to exactly one area and no area is counted twice.
 *
 * Inputs:   the boundary file named in the city config
 * Outputs:  data/<slug>/grid.geojson   grid_id, ward_id, ward_gid, area_m2
 *
 * Run: node 02_grid.mjs --city nagpur
 */

import { join } from "node:path";
import polygonClipping from "polygon-clipping";
import { cityFromArgv } from "./lib/city.mjs";
import {
  bboxOf,
  featureCollection,
  geometryArea,
  geometryFrom,
  mapGeometry,
  polygonArea,
  polygonsOf,
  readJson,
  utmProjector,
  writeJson,
} from "./lib/geo.mjs";

function main() {
  const city = cityFromArgv();
  const utm = utmProjector(city.projectedCrs);
  const size = city.cellSizeM;
  console.log(`[..] city: ${city.name} (${city.slug}), ${size} m grid in ${city.projectedCrs}`);

  const wards = readJson(city.boundariesPath).features.map((f, i) => ({
    ward_id: String(f.properties[city.wardIdField]),
    ward_gid: f.properties.gid ?? i + 1,
    geometry: mapGeometry(f.geometry, utm.forward),
  }));
  for (const ward of wards) ward.bbox = bboxOf(ward.geometry);
  console.log(`[ok] loaded ${wards.length} areas`);

  const minX = Math.min(...wards.map((w) => w.bbox[0]));
  const minY = Math.min(...wards.map((w) => w.bbox[1]));
  const maxX = Math.max(...wards.map((w) => w.bbox[2]));
  const maxY = Math.max(...wards.map((w) => w.bbox[3]));

  const cells = [];
  let candidates = 0;
  for (let x = minX; x < maxX; x += size) {
    for (let y = minY; y < maxY; y += size) {
      candidates += 1;
      const square = [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]];
      let best = null;
      for (const ward of wards) {
        if (x > ward.bbox[2] || x + size < ward.bbox[0] || y > ward.bbox[3] || y + size < ward.bbox[1]) continue;
        // Largest single fragment across every area, as the Python stage's
        // sort-by-area-then-drop-duplicates does.
        for (const piece of polygonClipping.intersection(square, polygonsOf(ward.geometry))) {
          const area = polygonArea(piece);
          if (!best || area > best.area) best = { area, piece, ward };
        }
      }
      if (best && best.area > 0) cells.push(best);
    }
  }
  console.log(`[ok] ${cells.length} of ${candidates} candidate cells fall inside the boundaries`);

  const features = cells.map((cell, i) => ({
    type: "Feature",
    properties: {
      grid_id: `cell_${String(i).padStart(4, "0")}`,
      ward_id: cell.ward.ward_id,
      ward_gid: cell.ward.ward_gid,
      area_m2: cell.area,
    },
    geometry: mapGeometry(geometryFrom([cell.piece]), utm.inverse),
  }));

  const outPath = join(city.dataDir, "grid.geojson");
  writeJson(outPath, featureCollection("grid", features));
  console.log(`[ok] wrote ${features.length} grid cells -> ${outPath}`);

  // ------------------------------------------------------- sanity checks --
  let ok = true;
  const covered = new Set(features.map((f) => f.properties.ward_id));
  if (covered.size !== wards.length) {
    const empty = wards.filter((w) => !covered.has(w.ward_id)).map((w) => w.ward_id);
    console.log(`[WARN] grid covers ${covered.size}/${wards.length} areas; none of the cells fell in: ${empty.join(", ")}`);
    ok = false;
  }
  const gridAreaKm2 = cells.reduce((s, c) => s + c.area, 0) / 1e6;
  const wardAreaKm2 = wards.reduce((s, w) => s + geometryArea(w.geometry), 0) / 1e6;
  console.log(`     cells cover ${gridAreaKm2.toFixed(1)} km2 of the areas' ${wardAreaKm2.toFixed(1)} km2`);
  const perWard = [...covered].map((id) => features.filter((f) => f.properties.ward_id === id).length).sort((a, b) => a - b);
  console.log(`     cells per area: min ${perWard[0]}, median ${perWard[perWard.length >> 1]}, max ${perWard.at(-1)}`);
  console.log(`\n${ok ? "GO" : "CHECK WARNINGS"}: ${features.length} cells across ${covered.size} areas.`);
  if (!ok) process.exitCode = 2;
}

main();
