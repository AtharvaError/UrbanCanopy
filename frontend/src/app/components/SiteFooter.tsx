import Link from "next/link";
import Logo from "./Logo";

const QUICK_LINKS = [
  { href: "/dashboard", label: "Map" },
  { href: "/calculator", label: "Calculator" },
  { href: "/simulate", label: "Simulator" },
  { href: "/data", label: "Data & method" },
];

const LEGAL_LINKS = [
  { href: "/legal#license", label: "License" },
  { href: "/legal#data-sources", label: "Data sources" },
  { href: "/legal#disclaimers", label: "Disclaimers" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <Logo />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A decision-support tool for Nagpur&apos;s urban heat, locality by locality, with every
              claim cited.
            </p>
          </div>

          <div>
            <p className="kicker">Quick links</p>
            <ul className="mt-3 space-y-2">
              {QUICK_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="kicker">Legal</p>
            <ul className="mt-3 space-y-2">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>

        <div className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          <p>
            UrbanCanopy is a research prototype, built independently. It is not an official tool of the
            Nagpur Municipal Corporation or any government body.
          </p>
          <p className="mt-2">
            Data: Landsat (USGS) and ESA WorldCover via Microsoft Planetary Computer; WorldPop;
            OpenStreetMap contributors. Basemap by Mapbox.
          </p>
          <p className="mt-4">
            © {new Date().getFullYear()} UrbanCanopy. Built on the open-source UCIP project. Code released under the
            Apache License 2.0.
          </p>
        </div>
      </div>
    </footer>
  );
}
