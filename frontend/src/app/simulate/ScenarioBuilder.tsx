/**
 * Server half of the scenario builder: reads the published cell and ward
 * snapshots once, at render, and hands the client panel a compact payload.
 *
 * The same files the dashboard fetches at runtime are read from disk here, so
 * the builder has its data in the first paint and works with no API, no
 * database and no network.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildScenarioData, type ScenarioData } from "@/lib/scenarioData";
import ScenarioPanel from "./ScenarioPanel";

async function readPublic(name: string) {
  return JSON.parse(await readFile(join(process.cwd(), "public", name), "utf8"));
}

async function loadScenarioData(): Promise<ScenarioData | null> {
  try {
    const [cells, wards] = await Promise.all([
      readPublic("cells_nbs.geojson"),
      readPublic("wards_hvi.geojson"),
    ]);
    return buildScenarioData(cells, wards);
  } catch {
    // Both files are written by pipeline stages. A checkout without them should
    // render the rest of the page rather than 500.
    return null;
  }
}

export default async function ScenarioBuilder() {
  const data = await loadScenarioData();
  if (!data) {
    return (
      <p className="rounded-xl border border-border bg-surface p-6 text-sm text-muted-foreground">
        The scenario builder needs the published cell snapshot, which this build does not have.
      </p>
    );
  }
  return <ScenarioPanel data={data} />;
}
