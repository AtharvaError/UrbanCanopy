"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import CoefficientSparkline from "./CoefficientSparkline";
import Citation from "./Citation";
import { matchCitationFromText } from "@/lib/citations";
import { areasForWard } from "@/lib/wardAreas";
import { hviColor } from "@/lib/hvi";
import {
  CONTRIB_BAR_MAX,
  FACTOR_LABELS,
  INDICATOR_KEYS,
  presentIndicators,
  type NbsRec,
  type WardProps,
} from "@/lib/wardTypes";
import {
  describeTopDriver,
  describeWard,
  fmtDensity,
  fmtDistance,
  fmtNdvi,
  fmtPct,
  fmtTemp,
  ordinal,
  type CityProfile,
  type NeighbourRef,
  type WardProfile,
} from "@/lib/wardProfile";

/**
 * Everything the dashboard knows about one ward, in reading order: what the
 * place is, what its numbers actually say, where it sits against the rest of
 * the city, then the factor breakdown (F2) and the cited interventions (F3).
 *
 * The bottom two sections are lifted unchanged from the old WardPanel detail
 * view rather than rewritten, so they still render exactly as the pitch-deck
 * screenshots show them.
 */

/** How each indicator is written out in the comparison table. */
const INDICATOR_FORMAT: Record<(typeof INDICATOR_KEYS)[number], (v: number) => string> = {
  LST_C: fmtTemp,
  NDVI: fmtNdvi,
  pop_density_km2: fmtDensity,
  child_pct: fmtPct,
  slum_pct: fmtPct,
  hospital_dist_m: fmtDistance,
  impervious_pct: fmtPct,
};

function NeighbourChip({
  label,
  neighbour,
  onSelectWard,
}: {
  label: string;
  neighbour: NeighbourRef;
  onSelectWard: (wardId: string) => void;
}) {
  return (
    <button
      onClick={() => onSelectWard(neighbour.ward_id)}
      className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-sm"
        style={{ background: hviColor(neighbour.hvi) }}
        aria-hidden
      />
      <span className="text-xs">
        <span className="text-muted-foreground">{label} </span>
        <span className="font-medium text-foreground">{neighbour.ward_id}</span>
        <span className="ml-1 font-mono text-muted-foreground">{neighbour.hvi.toFixed(1)}</span>
      </span>
    </button>
  );
}

export default function WardDetail({
  ward,
  profile,
  city,
  recs,
  totalWards,
  onSelectWard,
}: {
  ward: WardProps;
  profile: WardProfile | null;
  city: CityProfile | null;
  recs: NbsRec[];
  totalWards: number;
  onSelectWard: (wardId: string) => void;
}) {
  const areas = areasForWard(ward.ward_id);
  const topDriver = profile ? describeTopDriver(profile) : null;

  const [aiState, setAiState] = useState<{
    wardId: string;
    explanation: string;
    error: string;
  }>({
    wardId: ward.ward_id,
    explanation: "",
    error: "",
  });
  const [aiLoading, setAiLoading] = useState(false);

  const aiExplanation = aiState.wardId === ward.ward_id ? aiState.explanation : "";
  const aiError = aiState.wardId === ward.ward_id ? aiState.error : "";

  const selectedLocality = {
    name: areas.length > 0 ? `${ward.ward_id} (${areas.join(", ")})` : ward.ward_id,
    hvi: ward.HVI ?? profile?.hvi ?? null,
    rank: ward.rank ?? profile?.rank ?? null,
    factors: {
      "Land Surface Temperature (LST)": ward.contrib_LST_C ?? profile?.LST_C ?? null,
      "Vegetation Index (NDVI)": ward.contrib_NDVI ?? profile?.NDVI ?? null,
      "Population Density (km²)": ward.contrib_pop_density_km2 ?? profile?.pop_density_km2 ?? null,
      "Child Population %": ward.contrib_child_pct ?? profile?.child_pct ?? null,
      "Slum Settlements %": ward.contrib_slum_pct ?? profile?.slum_pct ?? null,
      "Hospital Distance (m)": ward.contrib_hospital_dist_m ?? profile?.hospital_dist_m ?? null,
      "Impervious Surface %": ward.contrib_impervious_pct ?? profile?.impervious_pct ?? null,
    },
    recommendation:
      recs.length > 0
        ? recs.map((r) => `${r.intervention}: ${r.rationale}`).join("; ")
        : "Prioritize reflective cool roofs and urban shade canopy.",
  };

  async function explainHeatRisk(locality: typeof selectedLocality) {
    setAiLoading(true);
    setAiState({ wardId: ward.ward_id, explanation: "", error: "" });

    try {
      const response = await fetch(
        "/api/heat-explain",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            localityName: locality.name,
            hvi: locality.hvi,
            rank: locality.rank,
            factors: locality.factors,
            recommendation: locality.recommendation,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      setAiState({ wardId: ward.ward_id, explanation: data.explanation, error: "" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to contact the AI service.";
      setAiState({ wardId: ward.ward_id, explanation: "", error: message });
    } finally {
      setAiLoading(false);
    }
  }

  return (
    // Sized for the sidebar, which is the narrowest place this renders; the
    // dialog uses the same padding so a ward reads identically in both.
    <div className="px-4 py-4">
      {areas.length > 0 && (
        <p className="text-sm leading-relaxed text-foreground/80">{areas.join(", ")}</p>
      )}

      {profile && city && (
        <div className="mt-3 space-y-2">
          {describeWard(profile, city).map((sentence) => (
            <p key={sentence} className="text-sm leading-relaxed text-muted-foreground">
              {sentence}
            </p>
          ))}
        </div>
      )}

      {profile && city && (
        <>
          <Separator className="my-4" />
          <p className="kicker">This locality against the city</p>
          <dl className="mt-2.5 space-y-1.5">
            {presentIndicators(profile).map((key) => (
              <div key={key} className="flex items-baseline justify-between gap-3 text-xs">
                <dt className="text-muted-foreground">{FACTOR_LABELS[key]}</dt>
                <dd className="flex shrink-0 items-baseline gap-2 font-mono">
                  <span className="text-foreground">{INDICATOR_FORMAT[key](profile[key])}</span>
                  <span className="text-muted-foreground/70">
                    city {INDICATOR_FORMAT[key](city[key])}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          {profile.rank !== null && profile.percentile !== null && (
            <div className="mt-4">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-foreground">
                  {ordinal(profile.rank)} of {totalWards} for heat vulnerability
                </span>
                <span className="font-mono text-muted-foreground">
                  hotter than {Math.round(profile.percentile)}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, profile.percentile)}%`,
                    background: hviColor(profile.hvi),
                  }}
                />
              </div>
              {topDriver && <p className="mt-2 text-xs text-muted-foreground">{topDriver}</p>}
            </div>
          )}

          {(profile.coolest_neighbour || profile.hottest_neighbour) && (
            <div className="mt-4">
              <p className="kicker">Next door</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.hottest_neighbour && (
                  <NeighbourChip
                    label="Hottest:"
                    neighbour={profile.hottest_neighbour}
                    onSelectWard={onSelectWard}
                  />
                )}
                {profile.coolest_neighbour && (
                  <NeighbourChip
                    label="Coolest:"
                    neighbour={profile.coolest_neighbour}
                    onSelectWard={onSelectWard}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}

      <Separator className="my-4" />
      <p className="kicker">What drives the score</p>
      <div className="mt-2.5 space-y-2">
        {presentIndicators(ward, "contrib_").map((key) => (
          <CoefficientSparkline
            key={key}
            label={FACTOR_LABELS[key]}
            value={(ward[`contrib_${key}`] as number | null) ?? 0}
            max={CONTRIB_BAR_MAX}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Red pushes this locality&apos;s score up, green pushes it down, compared to the city average.
      </p>

      {recs.length > 0 && (
        <>
          <Separator className="my-4" />
          <p className="kicker">Recommended interventions</p>
          <div className="mt-2 space-y-2">
            {recs.map((rec) => {
              const cited = matchCitationFromText(rec.citation);
              return (
                <Card key={rec.intervention + rec.priority} size="sm">
                  <CardContent className="text-xs">
                    <span className="font-medium text-foreground">{rec.intervention}</span>
                    <p className="mt-0.5 text-muted-foreground">{rec.rationale}</p>
                    {cited ? (
                      <div className="mt-1.5">
                        <Citation mode="chip" entry={cited} />
                      </div>
                    ) : (
                      <p className="mt-0.5 italic text-muted-foreground">{rec.citation}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Separator className="my-4" />
      <section className="ai-heat-explainer rounded-xl border border-border bg-card/40 p-3.5 text-xs">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-foreground">AI Heat Risk Explainer</h3>

          <button
            onClick={() => explainHeatRisk(selectedLocality)}
            disabled={aiLoading || !selectedLocality}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiLoading ? "Analysing..." : "Explain with AI"}
          </button>
        </div>

        {aiError && (
          <p role="alert" className="mt-2.5 rounded border border-destructive/20 bg-destructive/10 p-2 text-destructive">
            {aiError}
          </p>
        )}

        {aiExplanation && (
          <div aria-live="polite" className="mt-3 rounded border border-border bg-background p-3">
            <h4 className="font-semibold text-foreground">Locality analysis</h4>
            <p style={{ whiteSpace: "pre-wrap" }} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {aiExplanation}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
