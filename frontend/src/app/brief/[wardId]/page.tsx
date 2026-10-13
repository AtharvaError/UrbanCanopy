import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Feature, FeatureCollection, Geometry, Point } from "geojson";
import { ACTIVE_CITY } from "@/lib/city";
import { hviColor } from "@/lib/hvi";
import { typeOf } from "@/lib/localityTypes";
import { formatCompositeWindow } from "@/lib/runLog";
import { buildScenarioData } from "@/lib/scenarioData";
import { ordinal, type WardProfileData } from "@/lib/wardProfile";
import type { NbsRec, PlaceKind, PlaceProps, WardProps } from "@/lib/wardTypes";
import { builtForm, mainConcern, peopleActions, priorityFor, scoreBreakdown } from "@/lib/zonePlanner";
import PrintButton from "./PrintButton";

/**
 * The action brief: everything the planner says about one locality, on one
 * page that prints. It is built from the same published files and the same
 * functions as the planner, so the two cannot disagree.
 *
 * Laid out for paper. No `<header>` or `<main>` element is used: the print
 * rules written for the dashboard hide the first and restyle the second.
 */

function readPublic<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "public", name), "utf8")) as T;
  } catch {
    return null;
  }
}

const wards = readPublic<FeatureCollection<Geometry, WardProps>>("wards_hvi.geojson");

export function generateStaticParams() {
  return (wards?.features ?? []).map(({ properties }) => ({ wardId: properties.ward_id }));
}

export const dynamicParams = false;

function findWard(wardId: string): Feature<Geometry, WardProps> | undefined {
  const wanted = decodeURIComponent(wardId).toLowerCase();
  return wards?.features.find(({ properties }) => properties.ward_id.toLowerCase() === wanted);
}

export async function generateMetadata({ params }: { params: Promise<{ wardId: string }> }): Promise<Metadata> {
  const { wardId } = await params;
  const name = findWard(wardId)?.properties.ward_id;
  return {
    title: name ? `${name} action brief | UrbanCanopy` : "Action brief | UrbanCanopy",
    description: name ? `Heat priority score, the reasons for it and suggested actions for ${name}, ${ACTIVE_CITY.name}.` : undefined,
  };
}

const PLACE_LABELS: Record<PlaceKind, string> = {
  hospital: "Hospitals",
  school: "Schools",
  bus_stop: "Bus stops",
  market: "Markets",
};

/** Names listed per kind. A brief is one page; the map has the rest. */
const NAMES_PER_KIND = 6;

const signed = (value: number, digits = 1) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-7 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>;
}

export default async function LocalityBrief({ params }: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await params;
  const ward = findWard(wardId);
  const data = readPublic<WardProfileData>("ward_profiles.json");
  const profile = data?.wards.find((w) => w.ward_id === ward?.properties.ward_id);
  if (!ward || !data || !profile || ward.properties.HVI === null) notFound();

  const props = ward.properties;
  const score = props.HVI as number;
  const level = priorityFor(score);
  const breakdown = scoreBreakdown(props, profile, data);
  const type = typeOf(profile, data);
  const people = peopleActions(profile, data, score);
  const recs = (readPublic<NbsRec[]>("nbs_recommendations.json") ?? [])
    .filter((r) => r.ward_id === props.ward_id)
    .sort((a, b) => a.priority - b.priority);
  const places = (readPublic<FeatureCollection<Point, PlaceProps>>("places.geojson")?.features ?? []).filter(
    (p) => p.properties.ward_id === props.ward_id,
  );
  const runLog = readPublic<{ composite_window?: { start: string; end: string } | null }>("pipeline_run_log.json");
  const imagery = formatCompositeWindow(runLog?.composite_window ?? null);

  const cells = readPublic<Parameters<typeof buildScenarioData>[0]>("cells_nbs.geojson");
  const outlines = cells && wards ? buildScenarioData(cells, wards) : null;

  const fromYear = data.change_windows?.previous.end.slice(0, 4);
  const warming = profile.lst_change_vs_city_c;

  return (
    <div className="min-h-screen bg-background print:bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 pt-6 print:hidden">
        <Link href={`/dashboard?ward=${encodeURIComponent(props.ward_id)}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to the map
        </Link>
        <PrintButton />
      </div>

      <article className="mx-auto my-6 max-w-3xl rounded-xl border border-border bg-surface px-8 py-8 text-sm leading-relaxed text-foreground print:my-0 print:border-0 print:p-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          UrbanCanopy · {ACTIVE_CITY.name} · Locality action brief
        </p>

        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">{props.ward_id}</h1>
            <p className="mt-1 text-muted-foreground">
              {builtForm(profile.impervious_pct)}
              {type ? ` · ${type.name}` : ""} · {props.n_cells} cells of {ACTIVE_CITY.cellLabel}
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
              <p className="font-mono text-4xl font-semibold leading-none">
                {score.toFixed(1)}
                <span className="text-base font-normal text-muted-foreground"> / 100</span>
              </p>
              <div className="text-muted-foreground">
                <p>
                  <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-baseline" style={{ background: hviColor(score) }} aria-hidden />
                  <span className="font-semibold text-foreground">{level} priority</span>
                </p>
                <p>
                  {props.rank !== null ? `${ordinal(props.rank)} of ${data.n_wards} localities` : "Unranked"}, city average{" "}
                  {data.city.hvi_mean.toFixed(1)}
                </p>
              </div>
            </div>
          </div>

          {outlines && (
            <svg
              viewBox={`0 0 ${outlines.viewBox.width} ${outlines.viewBox.height}`}
              role="img"
              aria-label={`Where ${props.ward_id} is in ${ACTIVE_CITY.name}`}
              className="h-28 w-28 shrink-0"
            >
              <g stroke="#ffffff" strokeWidth={1.2} strokeLinejoin="round">
                {outlines.wards.map((w) => (
                  <path key={w.id} d={w.d} fill={w.id === props.ward_id ? hviColor(score) : "#d4d4d8"} />
                ))}
              </g>
            </svg>
          )}
        </div>

        {breakdown && <p className="mt-4 text-base">{mainConcern(breakdown)}</p>}

        {breakdown && (
          <>
            <SectionTitle>Why it ranks here</SectionTitle>
            <table className="mt-2 w-full text-left">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Factor</th>
                  <th className="py-1 font-medium">Here</th>
                  <th className="py-1 font-medium">City average</th>
                  <th className="py-1 text-right font-medium">Score points</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="py-1.5 text-muted-foreground" colSpan={3}>
                    A locality that is average on every factor
                  </td>
                  <td className="py-1.5 text-right font-mono">{breakdown.baseline.toFixed(1)}</td>
                </tr>
                {breakdown.factors.map((f) => (
                  <tr key={f.key} className="border-t border-border">
                    <td className="py-1.5">{f.label}</td>
                    <td className="py-1.5 font-mono">{f.raw}</td>
                    <td className="py-1.5 font-mono text-muted-foreground">{f.cityRaw}</td>
                    <td className="py-1.5 text-right font-mono">{signed(f.points)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-foreground/40 font-semibold">
                  <td className="py-1.5" colSpan={3}>
                    Priority score
                  </td>
                  <td className="py-1.5 text-right font-mono">{breakdown.total.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {(typeof profile.tree_pct === "number" || typeof warming === "number") && (
          <>
            <SectionTitle>Context, not part of the score</SectionTitle>
            <ul className="mt-2 space-y-1">
              {typeof profile.tree_pct === "number" && (
                <li>
                  <span className="font-medium">Tree cover:</span>{" "}
                  <span className="font-mono">{profile.tree_pct.toFixed(0)}%</span> of the locality is mapped as tree cover
                  {typeof data.city.tree_pct === "number" && (
                    <>
                      , against <span className="font-mono">{data.city.tree_pct.toFixed(0)}%</span> across the city
                    </>
                  )}
                  .
                </li>
              )}
              {typeof warming === "number" && (
                <li>
                  <span className="font-medium">Trend:</span>{" "}
                  {Math.abs(warming) < 0.25 ? (
                    <>its surface has warmed in line with the city</>
                  ) : (
                    <>
                      its surface has warmed <span className="font-mono">{Math.abs(warming).toFixed(1)}°C</span>{" "}
                      {warming > 0 ? "more" : "less"} than the city as a whole
                    </>
                  )}
                  {fromYear ? ` since ${fromYear}` : ""}, hot season to hot season.
                </li>
              )}
            </ul>
          </>
        )}

        <SectionTitle>For people, this hot season</SectionTitle>
        {people.length > 0 ? (
          <ol className="mt-2 space-y-2.5">
            {people.map((item, i) => (
              <li key={item.id} className="flex gap-3 break-inside-avoid">
                <span className="font-mono text-muted-foreground">{i + 1}.</span>
                <div>
                  <p>
                    <span className="font-semibold">{item.title}.</span> {item.action}
                  </p>
                  <p className="text-xs text-muted-foreground">Why here: {item.because}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-muted-foreground">
            No rule fires: this locality is at or better than the city average on every measure the rules use.
          </p>
        )}

        {recs.length > 0 && (
          <>
            <SectionTitle>Longer-term cooling</SectionTitle>
            <ul className="mt-2 space-y-2.5">
              {recs.map((rec) => (
                <li key={rec.intervention} className="break-inside-avoid">
                  <p>
                    <span className="font-semibold">{rec.intervention}</span>{" "}
                    <span className="text-muted-foreground">
                      ({rec.cell_count} {rec.cell_count === 1 ? "cell" : "cells"})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{rec.rationale}.</p>
                </li>
              ))}
            </ul>
          </>
        )}

        {places.length > 0 && (
          <>
            <SectionTitle>Places to start from</SectionTitle>
            <ul className="mt-2 space-y-1">
              {(Object.keys(PLACE_LABELS) as PlaceKind[]).map((kind) => {
                const ofKind = places.filter((p) => p.properties.kind === kind);
                if (ofKind.length === 0) return null;
                const names = [...new Set(ofKind.map((p) => p.properties.name).filter((n): n is string => Boolean(n)))];
                return (
                  <li key={kind}>
                    <span className="font-medium">{PLACE_LABELS[kind]}:</span> <span className="font-mono">{ofKind.length}</span>{" "}
                    mapped
                    {names.length > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({names.slice(0, NAMES_PER_KIND).join(", ")}
                        {names.length > NAMES_PER_KIND ? ", and others" : ""})
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">
              As mapped in OpenStreetMap, which is incomplete: a kind not listed here may still exist in the locality.
            </p>
          </>
        )}

        <SectionTitle>Read this before acting on it</SectionTitle>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>
            The score is an illustrative intervention-priority score from a transparent formula. It ranks where to look
            first. It is not a forecast and not a health prediction.
          </li>
          <li>Heat here is land surface temperature from satellite, the temperature of roofs, roads and soil, not of the air.</li>
          <li>
            Localities are approximate areas around named places, not municipal wards. Population is a 1 km model and
            hospitals are as mapped in OpenStreetMap.
          </li>
          <li>
            The suggestions follow simple stated rules set by this tool. They are a starting list for people who know the
            locality, not a plan and not medical advice.
          </li>
        </ul>

        <p className="mt-6 border-t border-border pt-3 text-[11px] text-muted-foreground">
          Sources: Landsat 8/9 (USGS){imagery ? `, imagery of ${imagery}` : ""}; ESA WorldCover 2021; WorldPop 2020;
          OpenStreetMap contributors. Built with UrbanCanopy, on the open-source UCIP method.
        </p>
      </article>
    </div>
  );
}
