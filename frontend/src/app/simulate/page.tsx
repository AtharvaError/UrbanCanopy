import type { Metadata } from "next";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { CitationList } from "../components/Citation";
import ScenarioBuilder from "./ScenarioBuilder";
import { CITATIONS } from "@/lib/citations";

export const metadata: Metadata = {
  title: "Scenario builder | UrbanCanopy",
  description:
    "Pick localities, apply tree canopy, cool roofs and pocket parks, and see the estimated cooling on a before-and-after map, using cited coefficients",
};

const COEFFICIENT_CITATIONS = CITATIONS.filter((c) => c.category === "cooling-coefficients");

export default function SimulatePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold text-foreground">What if we cooled a locality?</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Choose the localities, choose the interventions, and see an illustrative first-order estimate
            of daytime cooling on the map, cell by cell. It uses coefficients from published research
            rather than a trained model, and each intervention only lands where it physically can:
            trees where planting is ecologically sound, cool roofs where there are buildings.
          </p>
        </div>

        <div className="mt-8">
          <ScenarioBuilder />
        </div>

        <div className="mt-10 max-w-3xl">
          <h2 className="text-lg font-semibold text-foreground">Sources for this estimate</h2>
          <CitationList entries={COEFFICIENT_CITATIONS} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
