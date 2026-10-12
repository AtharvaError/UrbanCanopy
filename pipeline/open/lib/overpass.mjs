/**
 * OpenStreetMap queries through Overpass, with the response cached on disk.
 *
 * Any one public Overpass instance is routinely overloaded, and a 504 from the
 * first is not a reason to fail a build, so several are tried in turn. The
 * cache is what makes a rerun reproducible: OSM changes daily, and a second run
 * a week later should not silently move hospitals.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { CACHE_DIR } from "./city.mjs";
import { readJson, writeJson } from "./geo.mjs";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const USER_AGENT = "ucip-pipeline/1.0 (urban heat vulnerability research)";

export async function overpass(query, { refresh = false } = {}) {
  const key = createHash("sha1").update(query).digest("hex").slice(0, 16);
  const cachePath = join(CACHE_DIR, `overpass_${key}.json`);
  if (!refresh && existsSync(cachePath)) return readJson(cachePath);

  let last = "no endpoint tried";
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const endpoint of ENDPOINTS) {
      try {
        const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
          signal: AbortSignal.timeout(150_000),
        });
        const text = await response.text();
        if (response.ok && text.trimStart().startsWith("{")) {
          const payload = JSON.parse(text);
          writeJson(cachePath, { ...payload, _query: query, _fetched_at: new Date().toISOString() });
          return payload;
        }
        last = `${endpoint}: HTTP ${response.status}`;
      } catch (error) {
        last = `${endpoint}: ${error.message}`;
      }
      console.log(`[..] ${last}; trying the next Overpass endpoint`);
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
  }
  throw new Error(`every Overpass endpoint failed. Last: ${last}`);
}
