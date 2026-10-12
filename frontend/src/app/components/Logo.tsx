import { useId } from "react";

/**
 * The UrbanCanopy mark: a tree canopy built out of city blocks.
 *
 * A dome of rounded tiles on a trunk. Read one way it is a tree seen side-on,
 * read the other it is a street grid, which is the product in one shape: where
 * the city's blocks are, and where its canopy should be. Drawn inline so it
 * stays crisp at nav size and needs no image request; `public/logo.svg` is the
 * same drawing for use outside the app.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  // Several marks share a page (header, mobile drawer, footer), and gradient
  // and clip-path ids are document-wide.
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="UrbanCanopy">
      <defs>
        <linearGradient id={`${id}-fill`} x1="8" y1="10" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0EA5B3" />
          <stop offset="1" stopColor="#22C55E" />
        </linearGradient>
        <clipPath id={`${id}-dome`}>
          <path d="M5 40a27 27 0 0 1 54 0z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-dome)`} fill={`url(#${id}-fill)`}>
        {[13, 23, 32].map((y, row) =>
          [5, 19, 33, 47].map((x) => (
            <rect key={`${x}-${y}`} x={x} y={y} width={12} height={row === 0 ? 8 : row === 1 ? 7 : 8} rx={2} />
          )),
        )}
      </g>
      <rect x="29" y="42" width="6" height="11" rx="2" fill={`url(#${id}-fill)`} />
      <rect x="17" y="54" width="30" height="4" rx="2" fill={`url(#${id}-fill)`} />
    </svg>
  );
}

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="h-7 w-7" />
      <span className="text-xl font-semibold tracking-tight text-foreground">
        Urban<span className="text-brand-teal">Canopy</span>
      </span>
    </span>
  );
}
