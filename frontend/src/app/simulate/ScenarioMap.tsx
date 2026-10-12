"use client";

import { memo } from "react";
import type { MapCell, MapWard } from "@/lib/scenarioData";

/**
 * One of the scenario builder's two maps: the 1 km cells filled by whatever the
 * caller is showing, with ward boundaries over them.
 *
 * Plain SVG rather than a second Leaflet instance. The shapes arrive already
 * projected (see `lib/scenarioData.ts`), there are only 541 of them, and a map
 * with no tile layer has nothing to fail when the network does.
 *
 * Memoised, and the hover readout lives in the parent, so moving the pointer
 * across the map re-renders one line of text instead of a thousand paths.
 */
function ScenarioMap({
  label,
  cells,
  wards,
  viewBox,
  fills,
  selected,
  onToggleWard,
  onHoverCell,
}: {
  label: string;
  cells: MapCell[];
  wards: MapWard[];
  viewBox: { width: number; height: number };
  /** One fill per cell, aligned with `cells`. */
  fills: string[];
  selected: ReadonlySet<string>;
  onToggleWard: (wardId: string) => void;
  onHoverCell: (index: number | null) => void;
}) {
  // One listener each on the <svg>, read back off data-i, instead of two
  // closures per cell.
  const indexOf = (target: EventTarget): number | null => {
    const raw = (target as SVGElement).dataset?.i;
    return raw === undefined ? null : Number(raw);
  };

  return (
    <svg
      viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
      role="img"
      aria-label={label}
      className="block h-auto w-full"
      onClick={(e) => {
        const i = indexOf(e.target);
        if (i !== null) onToggleWard(cells[i].wardId);
      }}
      onMouseOver={(e) => onHoverCell(indexOf(e.target))}
      onMouseLeave={() => onHoverCell(null)}
    >
      <g stroke="var(--surface)" strokeWidth={0.7} strokeLinejoin="round">
        {cells.map((cell, i) => (
          <path
            key={cell.id}
            d={cell.d}
            data-i={i}
            fill={fills[i]}
            className="cursor-pointer transition-[filter] hover:brightness-90"
          />
        ))}
      </g>
      <g fill="none" strokeLinejoin="round" pointerEvents="none">
        {wards.map((ward) => (
          <path
            key={ward.id}
            d={ward.d}
            stroke="var(--muted-foreground)"
            strokeOpacity={0.55}
            strokeWidth={0.8}
          />
        ))}
        {/* Selected wards drawn last and cased in the surface colour, so the
            teal outline reads on the dark-red end of the ramp as well as the
            pale end. */}
        {wards
          .filter((ward) => selected.has(ward.id))
          .map((ward) => (
            <g key={ward.id}>
              <path d={ward.d} stroke="var(--surface)" strokeWidth={4.5} />
              <path d={ward.d} stroke="var(--brand-teal)" strokeWidth={2.4} />
            </g>
          ))}
      </g>
    </svg>
  );
}

export default memo(ScenarioMap);
