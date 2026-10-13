"use client";

import { Thermometer } from "lucide-react";
import { ACTIVE_CITY } from "@/lib/city";
import { useLanguage } from "@/lib/useLanguage";
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
  const { t } = useLanguage();

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
          <span className="text-foreground">{t("live.checking", { city: ACTIVE_CITY.name })}</span>
        )}

        {isOk && (
          <span className="text-foreground">
            {t("live.now", { city: weather.city || ACTIVE_CITY.name })}{" "}
            <span className="font-mono font-medium text-foreground">{tempFormatted}</span> {t("live.air")}
            {feelsLikeFormatted && (
              <span className="text-muted-foreground">
                {" "}
                ({t("live.feels")} {feelsLikeFormatted})
              </span>
            )}
            {isStale && lastUpdatedFormatted && (
              <span className="ml-1 text-xs text-amber-500/90 font-mono">
                [last updated {lastUpdatedFormatted}]
              </span>
            )}
          </span>
        )}

        {isUnavailable && (
          <span className="text-foreground">{t("live.unavailable")}</span>
        )}
      </span>
      <span className="hero-text-shadow max-w-md text-xs leading-relaxed text-foreground">
        {t("live.note")}
      </span>
    </div>
  );
}
