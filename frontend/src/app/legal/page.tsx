import type { Metadata } from "next";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { SourceAttribution } from "../components/Citation";
import { SOURCES } from "@/lib/citations";

export const metadata: Metadata = {
  title: "Legal and data attribution | UrbanCanopy",
  description: "License, data sources, and disclaimers for UrbanCanopy",
};

export default function LegalPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-foreground">Legal and data attribution</h1>

        <h2 id="license" className="mt-8 text-lg font-semibold text-foreground">
          License
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          UrbanCanopy is built on the open-source UCIP project, and its code is released under the Apache License 2.0. You are free to use, modify,
          and redistribute it, including commercially, as long as the license and attribution
          notices are preserved.
        </p>

        <h2 id="data-sources" className="mt-8 text-lg font-semibold text-foreground">
          Data sources
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Every dataset behind UrbanCanopy is free and public. Each carries its own license, which remains
          with the upstream provider:
        </p>
        <SourceAttribution sources={SOURCES} />

        <h2 id="disclaimers" className="mt-8 text-lg font-semibold text-foreground">
          Disclaimers
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            UrbanCanopy is a research prototype, built independently. It is not an official tool of the
            Nagpur Municipal Corporation or any government body, and no decision should rest on it
            alone.
          </li>
          <li>
            The heat measure is land surface temperature from satellites, which is not the same as
            the air temperature people feel.
          </li>
          <li>
            Localities are approximate. No open map of Nagpur&apos;s municipal zones or wards
            exists, so each cell is grouped with the nearest named place from OpenStreetMap. They
            are not administrative boundaries.
          </li>
          <li>
            The priority score is illustrative: a transparent weighted sum of five public
            indicators. It is not a health prediction.
          </li>
          <li>
            Intervention recommendations are literature-based suggestions, not engineering
            assessments of specific sites. Plantability is a land-cover screen that has not been
            calibrated for central India&apos;s ecology.
          </li>
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
