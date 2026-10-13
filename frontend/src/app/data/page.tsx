import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import Card from "../components/Card";
import ScoreExplainer from "../components/ScoreExplainer";
import LocalityTypes from "../components/LocalityTypes";
import { SourceAttribution } from "../components/Citation";
import { ACTIVE_CITY } from "@/lib/city";
import { SOURCES } from "@/lib/citations";
import { scoreModelFrom } from "@/lib/scoreFormula";
import type { WardProfileData } from "@/lib/wardProfile";

export const metadata: Metadata = {
  title: "Data & method | UrbanCanopy",
  description:
    "How the heat priority score is computed, what each number is measured from, what is estimated, and the limits of the tool.",
};

function loadProfiles(): WardProfileData | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "ward_profiles.json"), "utf-8"));
  } catch {
    return null;
  }
}

/** What each thing on the site is: measured, modelled or assumed. Kept honest by being in one table. */
const BASIS: { what: string; basis: "Measured" | "Modelled" | "Mapped by volunteers" | "Assumed"; from: string }[] = [
  { what: "Surface heat", basis: "Measured", from: "Landsat 8/9, median of the March to May scenes" },
  { what: "Green cover (NDVI)", basis: "Measured", from: "Landsat 8/9, same scenes" },
  { what: "Built-up surface", basis: "Measured", from: "ESA WorldCover 2021, 10 m" },
  { what: "Tree cover", basis: "Measured", from: "ESA WorldCover 2021, 10 m. Misses trees narrower than a pixel" },
  { what: "Warming trend", basis: "Measured", from: "Landsat, the same season nine years apart, read against the city's own change" },
  { what: "Population density", basis: "Modelled", from: "WorldPop 2020, 1 km" },
  { what: "Hospitals, schools, bus stops, markets", basis: "Mapped by volunteers", from: "OpenStreetMap. Bus stops and markets are far from complete" },
  { what: "Locality boundaries", basis: "Assumed", from: "Each cell joins its nearest named place. No open ward map of the city exists" },
  { what: "Cooling from trees, roofs and parks", basis: "Assumed", from: "Coefficients from studies of other cities, applied here" },
  { what: "Live temperature and forecast", basis: "Measured", from: "OpenWeatherMap and Open-Meteo, one reading for the whole city" },
];

export default function DataPage() {
  const data = loadProfiles();
  const model = data ? scoreModelFrom(data) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold text-foreground">Data &amp; method</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            How {ACTIVE_CITY.name}&apos;s localities are scored, what each number is measured from, and what the tool
            cannot tell you. To change a value or a weight and see the score move, use the{" "}
            <Link href="/calculator" className="font-medium text-brand-teal hover:underline">
              calculator
            </Link>
            .
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {data && model ? (
            <ScoreExplainer model={model} />
          ) : (
            <p className="rounded-xl border border-border bg-surface p-6 text-sm text-muted-foreground">
              The scoring formula needs the published locality profiles, which this build does not have.
            </p>
          )}

          <Card id="measured-or-estimated">
            <p className="kicker">Measured or estimated</p>
            <h2 className="mt-2 text-lg font-semibold text-foreground">What each number rests on</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">On the site</th>
                    <th className="py-1.5 pr-4 font-medium">Basis</th>
                    <th className="py-1.5 font-medium">From</th>
                  </tr>
                </thead>
                <tbody>
                  {BASIS.map((row) => (
                    <tr key={row.what} className="border-t border-border align-top">
                      <td className="py-2 pr-4 font-medium text-foreground">{row.what}</td>
                      <td className="py-2 pr-4 text-foreground">{row.basis}</td>
                      <td className="py-2 text-muted-foreground">{row.from}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {data && <LocalityTypes data={data} />}

          <Card id="sources">
            <p className="kicker">Sources</p>
            <h2 className="mt-2 text-lg font-semibold text-foreground">Every dataset is free and public</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Each carries its own licence, which remains with the provider. The full disclaimers are on the{" "}
              <Link href="/legal#disclaimers" className="font-medium text-brand-teal hover:underline">
                legal page
              </Link>
              .
            </p>
            <SourceAttribution sources={SOURCES} />
          </Card>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
