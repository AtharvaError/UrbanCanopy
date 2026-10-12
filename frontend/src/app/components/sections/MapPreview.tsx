import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { FeatureCollection, Geometry } from "geojson";
import { ACTIVE_CITY } from "@/lib/city";
import { hviColor } from "@/lib/hvi";
import { buildScenarioData } from "@/lib/scenarioData";
import type { WardProps } from "@/lib/wardTypes";

/**
 * Shows the actual product on the landing page: the published localities,
 * coloured by their published scores, as a link to /dashboard.
 *
 * Drawn from the data at build time instead of shipped as a screenshot, so it
 * is always the city the site is serving and never a picture of an older one.
 */
function loadPreview() {
  try {
    const read = (name: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", name), "utf-8"));
    const wards = read("wards_hvi.geojson") as FeatureCollection<Geometry, WardProps>;
    const data = buildScenarioData(read("cells_nbs.geojson"), wards);
    if (!data) return null;
    const scores = new Map(wards.features.map((f) => [f.properties.ward_id, f.properties.HVI]));
    return { ...data, scores };
  } catch {
    return null;
  }
}

export default function MapPreview() {
  const preview = loadPreview();
  return (
    <section className="mx-auto max-w-5xl px-6 py-14">
      <Link
        href="/dashboard"
        className="group block overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-brand-teal"
      >
        {preview && (
          <div className="flex justify-center border-b border-border bg-background px-6 py-8">
            <svg
              viewBox={`0 0 ${preview.viewBox.width} ${preview.viewBox.height}`}
              role="img"
              aria-label={`Heat vulnerability of ${ACTIVE_CITY.name}'s ${preview.wards.length} localities`}
              className="h-72 w-auto transition-transform duration-500 group-hover:scale-[1.02]"
            >
              <g stroke="var(--background)" strokeWidth={1.2} strokeLinejoin="round">
                {preview.wards.map((ward) => (
                  <path key={ward.id} d={ward.d} fill={hviColor(preview.scores.get(ward.id))} />
                ))}
              </g>
            </svg>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="kicker">The dashboard</p>
            <p className="mt-1 font-semibold text-foreground">
              See every locality, ranked, on the live map
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-teal">
            Open
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </section>
  );
}
