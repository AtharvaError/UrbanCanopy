import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import ScoreExplainer from "../components/ScoreExplainer";
import LocalityTypes from "../components/LocalityTypes";
import CalculatorPanel from "./CalculatorPanel";
import { ACTIVE_CITY } from "@/lib/city";
import { scoreModelFrom } from "@/lib/scoreFormula";
import type { WardProfileData } from "@/lib/wardProfile";

export const metadata: Metadata = {
  title: "Zone calculator | UrbanCanopy",
  description:
    "Compare three to five localities, edit any indicator or weight, and see the heat priority score, band and rank change. The scoring formula, its weights and its limits in one place.",
};

function loadProfiles(): WardProfileData | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "ward_profiles.json"), "utf-8"));
  } catch {
    return null;
  }
}

export default function CalculatorPage() {
  const data = loadProfiles();
  const model = data ? scoreModelFrom(data) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold text-foreground">Zone calculator</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Compare a handful of {ACTIVE_CITY.name}&apos;s localities side by side. Change a measured value or
            the weight of a factor and the score, its priority band and its rank update as you type. It is the
            same formula that colours the map, shown in full below.
          </p>
        </div>

        {data && model ? (
          <div className="mt-8 space-y-6">
            <ScoreExplainer model={model} />
            <CalculatorPanel data={data} model={model} />
            <LocalityTypes data={data} />
          </div>
        ) : (
          <p className="mt-8 rounded-xl border border-border bg-surface p-6 text-sm text-muted-foreground">
            The calculator needs the published locality profiles, which this build does not have.
          </p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
