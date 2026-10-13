import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import Card from "../components/Card";
import T from "../components/T";
import DownloadCsvButton from "./DownloadCsvButton";
import { ACTIVE_CITY } from "@/lib/city";
import { buildCityPlan, cityPlanCsv } from "@/lib/cityPlan";
import { hviColor } from "@/lib/hvi";
import { hasString } from "@/lib/i18n";
import type { WardProfileData } from "@/lib/wardProfile";
import type { NbsRec } from "@/lib/wardTypes";
import type { PriorityLevel } from "@/lib/zonePlanner";

export const metadata: Metadata = {
  title: "City action plan | UrbanCanopy",
  description:
    "What the whole city needs this hot season: which localities need drinking water, shade, work advisories, outreach and cool rooms, and where to start.",
};

function readPublic<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", name), "utf-8")) as T;
  } catch {
    return null;
  }
}

/** A score inside each band, so its swatch is the colour the map draws that band in. */
const BAND_SAMPLE_SCORE: Record<PriorityLevel, number> = { Critical: 90, High: 72, Moderate: 57, Lower: 40 };
const BAND_RANGE: Record<PriorityLevel, string> = {
  Critical: "80 and above",
  High: "65 to 80",
  Moderate: "50 to 65",
  Lower: "below 50",
};

/** How many localities a card names. The table below has all of them. */
const START_WITH = 3;

const plannerLink = (wardId: string) => `/dashboard?ward=${encodeURIComponent(wardId)}`;

export default function CityPlanPage() {
  const data = readPublic<WardProfileData>("ward_profiles.json");
  const recs = readPublic<NbsRec[]>("nbs_recommendations.json") ?? [];
  const plan = data ? buildCityPlan(data, recs) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold text-foreground">City action plan</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The map answers what one locality needs. This page adds the localities up: what {ACTIVE_CITY.name} as a whole
            needs this hot season, and where to start. Every line follows from a stated rule, the same rules each
            locality&apos;s own panel uses.
          </p>
        </div>

        {!plan ? (
          <p className="mt-8 rounded-xl border border-border bg-surface p-6 text-sm text-muted-foreground">
            The plan needs the published locality profiles, which this build does not have.
          </p>
        ) : (
          <div className="mt-8 space-y-6">
            <Card>
              <p className="kicker">Where the city stands</p>
              <h2 className="mt-2 text-lg font-semibold text-foreground">{plan.rows.length} localities by priority band</h2>
              <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                {plan.bands.map((band) => (
                  <div key={band.level} className="rounded-lg border border-border bg-background p-4">
                    <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: hviColor(BAND_SAMPLE_SCORE[band.level]) }} aria-hidden />
                      <T k={`band.${band.level}`} />
                    </dt>
                    <dd className="mt-1 font-mono text-3xl font-semibold text-foreground">{band.count}</dd>
                    <dd className="text-xs text-muted-foreground">score {BAND_RANGE[band.level]}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card>
              <p className="kicker">This hot season</p>
              <h2 className="mt-2 text-lg font-semibold text-foreground">What the city needs, and where to start</h2>
              <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {plan.actions.map((action) => {
                  const titleKey = `action.${action.id}.title`;
                  const textKey = `action.${action.id}.text`;
                  return (
                    <li key={action.id} className="flex flex-col rounded-lg border border-border bg-background p-4">
                      <h3 className="font-semibold text-foreground">{hasString(titleKey) ? <T k={titleKey} /> : action.title}</h3>
                      <p className="mt-2">
                        <span className="font-mono text-3xl font-semibold text-foreground">{action.localities.length}</span>
                        <span className="ml-2 text-sm text-muted-foreground">of {plan.rows.length} localities</span>
                      </p>
                      {hasString(textKey) && (
                        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                          <T k={textKey} />
                        </p>
                      )}
                      <p className="mt-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Rule:</span> {action.rule}
                      </p>
                      {action.localities.length > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Start with:</span>{" "}
                          {action.localities.slice(0, START_WITH).map((wardId, i) => (
                            <span key={wardId}>
                              {i > 0 && ", "}
                              <Link href={plannerLink(wardId)} className="text-brand-teal hover:underline">
                                {wardId}
                              </Link>
                            </span>
                          ))}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                &quot;Start with&quot; names the highest-ranked localities the rule applies to. The rules are this
                tool&apos;s own rules of thumb, each a comparison with the city average. They sort localities; they do
                not say how many water points or shelters a locality needs, which takes a site visit.
              </p>
            </Card>

            <Card id="every-locality">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="kicker">Every locality</p>
                  <h2 className="mt-2 text-lg font-semibold text-foreground">Which actions apply where</h2>
                </div>
                <DownloadCsvButton csv={cityPlanCsv(plan)} filename={`${ACTIVE_CITY.slug}-heat-action-plan.csv`} />
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[52rem] text-left text-sm">
                  <thead>
                    <tr className="align-bottom text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Rank</th>
                      <th className="py-2 pr-3 font-medium">Locality</th>
                      <th className="py-2 pr-3 font-medium">Priority</th>
                      <th className="py-2 pr-3 text-right font-medium">Score</th>
                      {plan.actions.map((action) => (
                        <th key={action.id} className="w-20 px-1 py-2 text-center font-medium leading-tight">
                          {action.title}
                        </th>
                      ))}
                      <th className="py-2 pl-3 font-medium">Longer-term cooling</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((row) => (
                      <tr key={row.wardId} className="border-t border-border">
                        <td className="py-2 pr-3 font-mono text-muted-foreground">{row.rank}</td>
                        <td className="py-2 pr-3">
                          <Link href={plannerLink(row.wardId)} className="font-medium text-foreground hover:text-brand-teal hover:underline">
                            {row.wardId}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-1.5 text-foreground">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: hviColor(row.score) }} aria-hidden />
                            <T k={`band.${row.level}`} />
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-foreground">{row.score.toFixed(1)}</td>
                        {plan.actions.map((action) => (
                          <td key={action.id} className="px-1 py-2 text-center">
                            {row.actions.includes(action.id) ? (
                              <Check className="mx-auto h-4 w-4 text-foreground" aria-label="Yes" />
                            ) : (
                              <span className="text-muted-foreground" aria-label="No">
                                ·
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="py-2 pl-3 text-xs text-muted-foreground">{row.longTerm ?? "None from the rules"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {plan.longTerm.length > 0 && (
              <Card>
                <p className="kicker">Beyond this season</p>
                <h2 className="mt-2 text-lg font-semibold text-foreground">Longer-term cooling, across the city</h2>
                <table className="mt-4 w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="py-1.5 pr-4 font-medium">Measure</th>
                      <th className="py-1.5 pr-4 text-right font-medium">Localities</th>
                      <th className="py-1.5 text-right font-medium">{ACTIVE_CITY.cellLabel} cells</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.longTerm.map((item) => (
                      <tr key={item.intervention} className="border-t border-border">
                        <td className="py-2 pr-4 text-foreground">{item.intervention}</td>
                        <td className="py-2 pr-4 text-right font-mono text-foreground">{item.localities}</td>
                        <td className="py-2 text-right font-mono text-foreground">{item.cells}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  From the land-cover rules, cell by cell: trees only where planting is ecologically sound, reflective
                  roofs where it is not. To see what a measure would cool, try it in the{" "}
                  <Link href="/simulate" className="font-medium text-brand-teal hover:underline">
                    simulator
                  </Link>
                  .
                </p>
              </Card>
            )}

            <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
              This is a starting list for people who know the city, not a plan to carry out as written. The score is
              illustrative and is not a health prediction; localities are approximate areas, not municipal wards. How
              far the ranking depends on its weights is set out under{" "}
              <Link href="/data#reliability" className="font-medium text-brand-teal hover:underline">
                Data &amp; method
              </Link>
              .
            </p>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
