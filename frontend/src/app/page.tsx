import fs from "fs";
import path from "path";
import Link from "next/link";
import { ArrowRight, Calculator, ClipboardList, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import SiteHeader from "./components/SiteHeader";
import SiteFooter from "./components/SiteFooter";
import Reveal from "./components/Reveal";
import T from "./components/T";
import Hero from "./components/sections/Hero";
import MapPreview from "./components/sections/MapPreview";
import CitationStrip from "./components/sections/CitationStrip";
import { hviColor } from "@/lib/hvi";
import type { StringKey } from "@/lib/i18n";
import { priorityFor } from "@/lib/zonePlanner";

/**
 * The landing page. One job: say what the tool is in ten seconds and send the
 * reader to the map. Top to bottom it follows the order a visitor asks things
 * in: what is this, what does it say, how does it know, what can I do with it,
 * and can I trust it.
 */

type WardFeature = {
  properties: {
    ward_id: string;
    HVI: number | null;
    rank: number | null;
  };
};

function rankedWards() {
  const p = path.join(process.cwd(), "public", "wards_hvi.geojson");
  const gj = JSON.parse(fs.readFileSync(p, "utf-8")) as { features: WardFeature[] };
  return gj.features
    .map((f) => f.properties)
    .filter((w): w is WardFeature["properties"] & { HVI: number; rank: number } => w.rank !== null && w.HVI !== null)
    .sort((a, b) => a.rank - b.rank);
}

const STEPS: { title: StringKey; text: StringKey }[] = [
  { title: "how.1.title", text: "how.1.text" },
  { title: "how.2.title", text: "how.2.text" },
  { title: "how.3.title", text: "how.3.text" },
];

const CARDS: { href: string; icon: typeof MapIcon; title: StringKey; text: StringKey }[] = [
  { href: "/dashboard", icon: MapIcon, title: "cards.map.title", text: "cards.map.text" },
  { href: "/calculator", icon: Calculator, title: "cards.calc.title", text: "cards.calc.text" },
  { href: "/simulate", icon: SlidersHorizontal, title: "cards.sim.title", text: "cards.sim.text" },
  { href: "/plan", icon: ClipboardList, title: "cards.plan.title", text: "cards.plan.text" },
];

export default function Home() {
  const ranked = rankedWards();
  const top = ranked.slice(0, 5);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="flex-1">
        <Hero localities={ranked.length} />

        <Reveal>
          <section className="border-b border-border bg-surface">
            <div className="mx-auto max-w-5xl px-6 py-14">
              <h2 className="text-xl font-semibold text-foreground">
                <T k="top.title" />
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                <T k="top.sub" />
              </p>
              <ol className="mt-6 divide-y divide-border">
                {top.map((w) => (
                  <li key={w.ward_id}>
                    <Link
                      href={`/dashboard?ward=${encodeURIComponent(w.ward_id)}`}
                      className="flex items-center justify-between gap-4 py-3 hover:bg-surface-hover"
                    >
                      <span className="flex items-baseline gap-3">
                        <span className="w-6 text-right font-mono text-sm text-muted-foreground">{w.rank}</span>
                        <span className="font-medium text-foreground">{w.ward_id}</span>
                      </span>
                      <span className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: hviColor(w.HVI) }} aria-hidden />
                          <T k={`band.${priorityFor(w.HVI)}`} />
                        </span>
                        <span className="font-mono text-foreground">{w.HVI.toFixed(1)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
              <Link href="/dashboard" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-teal hover:underline">
                <T k="top.link" />
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <MapPreview />
        </Reveal>

        <Reveal>
          <section className="mx-auto max-w-5xl px-6 py-14">
            <h2 className="text-xl font-semibold text-foreground">
              <T k="how.title" />
            </h2>
            <ol className="mt-6 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="rounded-xl border border-border bg-surface p-5">
                  <p className="font-mono text-sm text-brand-teal">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-2 font-semibold text-foreground">
                    <T k={step.title} />
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    <T k={step.text} />
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </Reveal>

        <Reveal>
          <section className="border-y border-border bg-surface">
            <div className="mx-auto max-w-5xl px-6 py-14">
              <h2 className="text-xl font-semibold text-foreground">
                <T k="cards.title" />
              </h2>
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {CARDS.map((card) => (
                  <Link
                    key={card.href}
                    href={card.href}
                    className="group flex flex-col rounded-xl border border-border bg-background p-5 transition-colors hover:border-brand-teal"
                  >
                    <card.icon className="h-5 w-5 text-brand-teal" aria-hidden />
                    <h3 className="mt-3 font-semibold text-foreground">
                      <T k={card.title} />
                    </h3>
                    <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                      <T k={card.text} />
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-teal">
                      <T k="cards.open" />
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <CitationStrip />
        </Reveal>

        <Reveal>
          <section className="mx-auto max-w-5xl px-6 py-14">
            <h2 className="text-xl font-semibold text-foreground">
              <T k="open.title" />
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              <T k="open.text" />
            </p>
            <Link href="/data" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-teal hover:underline">
              <T k="open.link" />
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </section>
        </Reveal>
      </main>

      <SiteFooter />
    </div>
  );
}
