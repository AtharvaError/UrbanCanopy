/**
 * City configuration for the open build, read from the same
 * config/cities/<slug>.json the Python stages and the frontend use.
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import { readJson, utmEpsgFor } from "./geo.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const DATA_DIR = join(ROOT, "data");
export const PUBLIC_DIR = join(ROOT, "frontend", "public");
export const CACHE_DIR = join(DATA_DIR, "cache");

export function loadCity(slug) {
  const path = join(ROOT, "config", "cities", `${slug}.json`);
  if (!existsSync(path)) {
    const available = readdirSync(join(ROOT, "config", "cities")).map((f) => f.replace(".json", ""));
    throw new Error(`no city config at ${path}. Available: ${available.join(", ")}`);
  }
  const raw = readJson(path);
  const imagery = raw.imagery ?? {};
  const cellSizeM = raw.grid?.cell_size_m ?? 1000;
  return {
    slug: raw.slug,
    name: raw.name,
    bbox: raw.bbox,
    cellSizeM,
    /** "500m", "1km": how the grid resolution reads in a filename and in copy. */
    gridLabel: cellSizeM >= 1000 && cellSizeM % 1000 === 0 ? `${cellSizeM / 1000}km` : `${cellSizeM}m`,
    projectedCrs: raw.grid?.projected_crs ?? utmEpsgFor(raw.bbox),
    boundariesPath: join(DATA_DIR, raw.boundaries.file),
    wardIdField: raw.boundaries.ward_id_field,
    expectedWardCount: raw.boundaries.expected_ward_count ?? null,
    // March to May unless the config says otherwise is not a safe default for
    // every city, so the open build requires the season to be stated.
    seasonStartMonth: imagery.season_start_month,
    seasonEndMonth: imagery.season_end_month,
    ecology: raw.ecology ?? {},
    /** Every artefact for this city lands here, so two cities cannot overwrite each other. */
    dataDir: join(DATA_DIR, raw.slug),
    raw,
  };
}

/** The slug from `--city <slug>`, falling back to UCIP_CITY. The open build has no default city on purpose. */
export function cityFromArgv() {
  const i = process.argv.indexOf("--city");
  const slug = i !== -1 ? process.argv[i + 1] : process.env.UCIP_CITY;
  if (!slug) throw new Error("pass --city <slug> (or set UCIP_CITY)");
  return loadCity(slug);
}
