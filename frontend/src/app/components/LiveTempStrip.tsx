"use client";

import { Thermometer } from "lucide-react";
import { ACTIVE_CITY } from "@/lib/city";
import { useWeather } from "@/lib/useWeather";

/**
 * Live air temperature (OpenWeatherMap for Nagpur), refreshed every 5 minutes.
 * Framed as a methodology contrast against satellite Land Surface Temperature (LST).
 * On fetch failure, preserves last good reading with a subtle stale indicator
 * ("last updated HH:MM"), and never fabricates default numbers.
 */
export default function LiveTempStrip() {
  const { weather, status, isStale, tempFormatted, feelsLikeFormatted, lastUpdatedFormatted } =
    useWeather();

  const isOk = (status === "ok" || status === "idle") && weather !== null;
  const isLoading = status === "loading" && weather === null;
  const isUnavailable = status === "error" && weather === null;

  return (
    <div className="flex flex-col gap-2">
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface/85 px-3 py-1.5 text-sm backdrop-blur-sm">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
          {isOk && !isStale && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-emerald/70" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              isOk
                ? isStale
                  ? "bg-amber-500"
                  : "bg-brand-emerald"
                : "bg-muted-foreground"
            }`}
          />
        </span>
        <Thermometer className="h-4 w-4 shrink-0 text-brand-teal" aria-hidden />

        {isLoading && (
          <span className="text-foreground">Checking {ACTIVE_CITY.name} live weather…</span>
        )}

        {isOk && (
          <span className="text-foreground">
            {weather.city || ACTIVE_CITY.name} now{" "}
            <span className="font-mono font-medium text-foreground">{tempFormatted}</span> air
            {feelsLikeFormatted && (
              <span className="text-muted-foreground"> (feels like {feelsLikeFormatted})</span>
            )}
            {isStale && lastUpdatedFormatted && (
              <span className="ml-1 text-xs text-amber-500/90 font-mono">
                [last updated {lastUpdatedFormatted}]
              </span>
            )}
          </span>
        )}

        {isUnavailable && (
          <span className="text-foreground">Live air temperature unavailable</span>
        )}
      </span>
      <span className="hero-text-shadow max-w-md text-xs leading-relaxed text-foreground">
        The map measures land-surface temperature, a related but different number.
      </span>
    </div>
  );
}
