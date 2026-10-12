import fs from "node:fs";
import path from "node:path";
import type { FeatureCollection, Geometry } from "geojson";
import Card from "./Card";
import { ACTIVE_CITY } from "@/lib/city";
import { typeColor, type LocalityTypes as LocalityTypesData } from "@/lib/localityTypes";
import { buildScenarioData } from "@/lib/scenarioData";
import type { WardProfileData } from "@/lib/wardProfile";
import type { WardProps } from "@/lib/wardTypes";

/**
 * "Kinds of locality": the k-means types on a small map, with what sets each
 * apart and which localities it holds.
 *
 * The map is not the only carrier of the grouping. Every type is named in the
 * legend and lists its members beside it, so the colours are a convenience and
 * nothing depends on telling two of them apart.
 */

function loadOutlines() {
  try {
    const read = (name: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", name), "utf-8"));
    return buildScenarioData(read("cells_nbs.geojson"), read("wards_hvi.geojson") as FeatureCollection<Geometry, WardProps>);
  } catch {
    return null;
  }
}

export default function LocalityTypes({ data }: { data: WardProfileData }) {
  const types: LocalityTypesData | undefined = data.locality_types;
  if (!types) return null;
  const outlines = loadOutlines();
  const typeIdOf = new Map(data.wards.map((w) => [w.ward_id, w.type_id]));
  const nameOf = new Map(types.types.map((t) => [t.id, t.name]));

  return (
    <Card id="locality-types">
      <p className="kicker">Kinds of locality</p>
      <h2 className="mt-2 text-lg font-semibold text-foreground">
        {types.k} types, found by clustering
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        The score ranks localities. This sorts them by what kind of place they are, using the same five
        indicators. Two localities can score alike for opposite reasons, and they do not need the same
        response.
      </p>

      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        {outlines && (
          <svg
            viewBox={`0 0 ${outlines.viewBox.width} ${outlines.viewBox.height}`}
            role="img"
            aria-label={`${ACTIVE_CITY.name}'s localities coloured by type`}
            className="h-auto w-full"
          >
            <g stroke="var(--surface)" strokeWidth={1.4} strokeLinejoin="round">
              {outlines.wards.map((ward) => {
                const id = typeIdOf.get(ward.id);
                return (
                  <path key={ward.id} d={ward.d} fill={typeof id === "number" ? typeColor(id) : "var(--muted)"}>
                    {/* One string, not two children: React hydrates a <title>
                        as a single text node and rejects anything else. */}
                    <title>{typeof id === "number" ? `${ward.id}: ${nameOf.get(id)}` : ward.id}</title>
                  </path>
                );
              })}
            </g>
          </svg>
        )}

        <ul className="space-y-5">
          {types.types.map((type) => (
            <li key={type.id} className="flex gap-3">
              <span
                className="mt-1 h-3.5 w-3.5 shrink-0 rounded-sm"
                style={{ backgroundColor: typeColor(type.id) }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {type.name}
                  <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                    {type.n} localities · mean score {type.mean_score.toFixed(1)}
                  </span>
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{type.description}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{type.members.join(", ")}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        Method: k-means on the five indicators, each standardised across the {data.wards.length} localities,
        with a fixed random seed so the result is the same on every run. Group counts tried:{" "}
        {types.candidates.map((c, i) => (
          <span key={c.k}>
            {i > 0 && ", "}
            <span className="font-mono text-foreground">
              {c.k} ({c.silhouette.toFixed(2)})
            </span>
          </span>
        ))}
        . The figure in brackets is the silhouette, from −1 to 1, where higher means cleaner groups. The rule
        used: {types.selection}. Types describe; they are not risk levels, and a locality near the edge of
        its group could reasonably sit in the next one.
      </p>
    </Card>
  );
}
