/**
 * Runs the open build end to end for one city, and optionally publishes it.
 *
 *   node run.mjs --city nagpur            build into data/nagpur/
 *   node run.mjs --city nagpur --publish  build, then copy to frontend/public/
 *   node run.mjs --city nagpur --from 05  resume at a stage (earlier output is reused)
 *
 * A stage exiting 2 has raised a warning worth reading and the run continues.
 * A stage exiting 1 has failed and the run stops there, before anything is
 * published: a half-built city must never replace the one the site is serving.
 *
 * Publishing is a separate, explicit step for the same reason the Python
 * pipeline guards it. frontend/public/ holds exactly one city, and this
 * overwrites it.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_DIR, cityFromArgv } from "./lib/city.mjs";
import { readJson, writeJson } from "./lib/geo.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const STAGES = [
  { id: "02", script: "02_grid.mjs" },
  { id: "03", script: "03_satellite.mjs" },
  { id: "04", script: "04_people.mjs" },
  { id: "05", script: "05_index.mjs" },
  { id: "06", script: "06_nbs.mjs" },
  { id: "07", script: "07_profiles.mjs" },
];

/** What the site reads. Everything else in the city's data directory is intermediate. */
const PUBLISHED = [
  "wards_hvi.geojson",
  "cells_nbs.geojson",
  "cells_ndvi_change.geojson",
  "nbs_recommendations.json",
  "ward_profiles.json",
  "hero_city.json",
  "hero_region.json",
  "hvi_pca_log.json",
  "pipeline_run_log.json",
];

function main() {
  const city = cityFromArgv();
  const fromArg = process.argv.indexOf("--from");
  const from = fromArg !== -1 ? process.argv[fromArg + 1] : STAGES[0].id;
  const publish = process.argv.includes("--publish");

  const startedAt = new Date().toISOString();
  const stages = [];
  let failed = false;
  for (const stage of STAGES) {
    if (stage.id < from) {
      stages.push({ id: stage.id, script: stage.script, status: "skipped", returncode: null, seconds: 0 });
      continue;
    }
    console.log(`\n=== stage ${stage.id}: ${stage.script} ===`);
    const t0 = Date.now();
    const result = spawnSync(process.execPath, [join(HERE, stage.script), "--city", city.slug], { stdio: "inherit" });
    const status = result.status === 0 ? "ok" : result.status === 2 ? "warn" : "fail";
    stages.push({
      id: stage.id,
      script: stage.script,
      status,
      returncode: result.status,
      seconds: Math.round((Date.now() - t0) / 100) / 10,
    });
    if (status === "fail") {
      failed = true;
      break;
    }
  }

  const provenancePath = join(city.dataDir, "provenance_satellite.json");
  const log = {
    started_at: startedAt,
    finished_at: failed ? null : new Date().toISOString(),
    city: city.slug,
    build: "open",
    // The site states data age as a pair: when the build ran, and which
    // imagery it was computed from. A refresh date alone overstates freshness.
    composite_window: existsSync(provenancePath) ? readJson(provenancePath).composite_window : null,
    stages,
  };
  writeJson(join(city.dataDir, "pipeline_run_log.json"), log, 2);

  console.log("\n=== summary ===");
  for (const s of stages) console.log(`  ${s.id}  ${s.status.padEnd(7)} ${String(s.seconds).padStart(7)} s  ${s.script}`);
  if (failed) {
    console.log("\n[FAIL] a stage failed; nothing was published.");
    process.exit(1);
  }

  if (publish) {
    mkdirSync(PUBLIC_DIR, { recursive: true });
    for (const file of PUBLISHED) {
      const source = join(city.dataDir, file);
      if (!existsSync(source)) {
        console.log(`[skip] ${file}: not produced by this run`);
        continue;
      }
      copyFileSync(source, join(PUBLIC_DIR, file));
      console.log(`[ok] published ${file}`);
    }
  } else {
    console.log("\nBuilt, not published. Re-run with --publish to copy the result to frontend/public/.");
  }
  if (stages.some((s) => s.status === "warn")) process.exitCode = 2;
}

main();
