"use client";

import { useEffect, useState } from "react";
import { Flame, Info, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { ACTIVE_CITY } from "@/lib/city";
import { useWardData } from "@/lib/useWardData";
import {
  dayLabel,
  fetchCityWeather,
  HEAT_ALERT_LABELS,
  HEAT_ALERT_THRESHOLDS_C,
  heatAlertFor,
  heatOutlook,
  type CityWeather,
  type HeatAlertLevel,
} from "@/lib/weather";
import { priorityFor } from "@/lib/zonePlanner";

/** How many localities an alert names. Enough to start with, few enough to read. */
const ACT_FIRST_COUNT = 3;

/**
 * Each level has its own icon as well as its own tint, so the level is never
 * carried by colour alone. The label beside it is always in the text colour.
 */
const LEVEL_STYLE: Record<HeatAlertLevel, { icon: LucideIcon; pill: string; iconColor: string }> = {
  none: { icon: ShieldCheck, pill: "border-border bg-surface", iconColor: "text-brand-emerald" },
  watch: { icon: TriangleAlert, pill: "border-amber-500/50 bg-amber-500/15", iconColor: "text-amber-600 dark:text-amber-400" },
  "heat-wave": { icon: TriangleAlert, pill: "border-orange-600/50 bg-orange-600/15", iconColor: "text-orange-700 dark:text-orange-400" },
  severe: { icon: Flame, pill: "border-red-600/60 bg-red-600/15", iconColor: "text-red-700 dark:text-red-400" },
};

/** "today", "tomorrow" or "on Thursday", to finish a sentence. */
function whenPhrase(date: string, today: string): string {
  const label = dayLabel(date, today);
  return label === "Today" || label === "Tomorrow" ? label.toLowerCase() : `on ${label}`;
}

/**
 * Live weather for the dashboard: the air temperature now, the next few days'
 * highs, and what they mean for when to act.
 *
 * The priority score says where heat is most concerning and does not change
 * with the weather. This bar says when: on a day the forecast crosses a stated
 * threshold it names the localities to start with, and each name opens that
 * locality's planner, where the actions are.
 *
 * When the weather service cannot be reached the bar says so. It never shows a
 * remembered or invented reading.
 */
export default function HeatOutlookBar({ onSelectWard }: { onSelectWard: (wardId: string) => void }) {
  const [weather, setWeather] = useState<CityWeather | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "unavailable">("loading");
  const [showRule, setShowRule] = useState(false);
  const { wards } = useWardData();

  useEffect(() => {
    let cancelled = false;
    fetchCityWeather(ACTIVE_CITY).then((result) => {
      if (cancelled) return;
      setWeather(result);
      setStatus(result ? "ok" : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const outlook = weather ? heatOutlook(weather.days) : null;

  if (status !== "ok" || !weather || !outlook) {
    return (
      <div className="border-b border-border bg-background px-6 py-2 text-xs text-muted-foreground" role="status">
        {status === "loading" ? `Checking ${ACTIVE_CITY.name}'s weather…` : "Live weather is unavailable right now."}
      </div>
    );
  }

  const today = weather.days[0].date;
  const style = LEVEL_STYLE[outlook.level];
  const LevelIcon = style.icon;
  const lastDay = weather.days[weather.days.length - 1];

  // Wards arrive ranked, most concerning first.
  const actFirst =
    outlook.level === "none"
      ? []
      : (wards ?? [])
          .filter((w) => w.properties.HVI !== null && ["Critical", "High"].includes(priorityFor(w.properties.HVI)))
          .slice(0, ACT_FIRST_COUNT)
          .map((w) => w.properties.ward_id);

  return (
    <section aria-label="Live weather and heat outlook" className="border-b border-border bg-background px-6 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <p className="flex items-center gap-2 text-foreground">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-emerald/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-emerald" />
          </span>
          <span className="font-medium uppercase tracking-wide text-muted-foreground">Live</span>
          <span>
            {ACTIVE_CITY.name} now{" "}
            <span className="font-mono text-sm font-semibold">{weather.temperatureC.toFixed(1)}°C</span> air
          </span>
          {weather.feelsLikeC !== null && (
            <span className="text-muted-foreground">
              feels like <span className="font-mono text-foreground">{weather.feelsLikeC.toFixed(1)}°C</span>
            </span>
          )}
          {weather.humidityPct !== null && (
            <span className="hidden text-muted-foreground sm:inline">
              humidity <span className="font-mono text-foreground">{Math.round(weather.humidityPct)}%</span>
            </span>
          )}
        </p>

        <ul className="flex items-center gap-3" aria-label="Forecast highs">
          {weather.days.map((day) => {
            const hot = heatAlertFor(day.maxC) !== "none";
            return (
              <li key={day.date} className="flex items-baseline gap-1 text-muted-foreground">
                <span>{dayLabel(day.date, today, "short")}</span>
                <span className={`font-mono text-foreground ${hot ? "font-semibold underline decoration-2 underline-offset-2" : ""}`}>
                  {Math.round(day.maxC)}°
                </span>
              </li>
            );
          })}
        </ul>

        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-foreground" role="status">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium ${style.pill}`}>
            <LevelIcon className={`h-3.5 w-3.5 shrink-0 ${style.iconColor}`} aria-hidden />
            {HEAT_ALERT_LABELS[outlook.level]}
          </span>
          {outlook.level === "none" ? (
            <span className="text-muted-foreground">
              Highs stay below {HEAT_ALERT_THRESHOLDS_C.watch}°C through {dayLabel(lastDay.date, today)}.
            </span>
          ) : (
            <>
              <span>
                A high of <span className="font-mono font-semibold">{outlook.peak.maxC.toFixed(1)}°C</span> is forecast{" "}
                {whenPhrase(outlook.peak.date, today)}.
              </span>
              {actFirst.length > 0 && (
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground">Act first in</span>
                  {actFirst.map((wardId) => (
                    <button
                      key={wardId}
                      onClick={() => onSelectWard(wardId)}
                      className="rounded-full border border-border bg-surface px-2 py-0.5 font-medium hover:bg-surface-hover"
                    >
                      {wardId}
                    </button>
                  ))}
                </span>
              )}
            </>
          )}
        </p>

        <button
          onClick={() => setShowRule((v) => !v)}
          aria-expanded={showRule}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
          How is this decided?
        </button>
      </div>

      {showRule && (
        <p className="mt-2 max-w-4xl leading-relaxed text-muted-foreground">
          Readings and forecast highs are live from Open-Meteo, for the city as a whole. A forecast high of{" "}
          {HEAT_ALERT_THRESHOLDS_C.heatWave}°C or more is a heat wave and {HEAT_ALERT_THRESHOLDS_C.severe}°C or more a
          severe one, the India Meteorological Department&apos;s criteria on actual temperature.{" "}
          {HEAT_ALERT_THRESHOLDS_C.watch} to {HEAT_ALERT_THRESHOLDS_C.heatWave}°C is shown as a heat watch, which is
          this tool&apos;s own label and not an official declaration. Weather does not change any locality&apos;s
          score: the score says where to act, the forecast says when. The localities named on an alert day are the
          highest-ranked ones in the Critical and High bands.
        </p>
      )}
    </section>
  );
}
