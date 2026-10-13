"use client";

import { useEffect, useState } from "react";
import { Flame, Info, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { ACTIVE_CITY } from "@/lib/city";
import { LOCALES, type Lang } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { useWardData } from "@/lib/useWardData";
import { useWeather } from "@/lib/useWeather";
import {
  dayLabel,
  fetchForecastHighs,
  HEAT_ALERT_THRESHOLDS_C,
  heatAlertFor,
  heatOutlook,
  type DayOutlook,
  type HeatAlertLevel,
} from "@/lib/heatOutlook";
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

type Translate = ReturnType<typeof useLanguage>["t"];

/**
 * A forecast day named in the reader's language. `dayLabel` decides whether it
 * is today, tomorrow or a weekday; this only puts the words in.
 */
function localDay(date: string, today: string, lang: Lang, t: Translate, width: "long" | "short" = "long"): string {
  const label = dayLabel(date, today, width);
  if (label === "Today") return t("day.today");
  if (label === "Tomorrow") return t("day.tomorrow");
  if (lang === "en") return label;
  return new Intl.DateTimeFormat(LOCALES[lang], { weekday: width, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

/** The day as it closes a sentence. English needs "on" before a weekday and lower case otherwise. */
function whenPhrase(date: string, today: string, lang: Lang, t: Translate): string {
  const day = localDay(date, today, lang, t);
  if (lang !== "en") return day;
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
 * Two sources, each shown only when it answers. The reading now is
 * OpenWeatherMap's, shared with the header through `useWeather`; the forecast
 * highs are Open-Meteo's. When one cannot be reached its part of the bar says
 * so. Nothing here shows an invented reading.
 */
export default function HeatOutlookBar({ onSelectWard }: { onSelectWard: (wardId: string) => void }) {
  const { weather, status: nowStatus, isStale, tempFormatted, feelsLikeFormatted, lastUpdatedFormatted } = useWeather();
  const [days, setDays] = useState<DayOutlook[] | null>(null);
  const [forecastStatus, setForecastStatus] = useState<"loading" | "ok" | "unavailable">("loading");
  const [showRule, setShowRule] = useState(false);
  const { wards } = useWardData();
  const { lang, t } = useLanguage();

  useEffect(() => {
    let cancelled = false;
    fetchForecastHighs(ACTIVE_CITY).then((result) => {
      if (cancelled) return;
      setDays(result);
      setForecastStatus(result ? "ok" : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const outlook = days ? heatOutlook(days) : null;
  const nowLoading = weather === null && (nowStatus === "idle" || nowStatus === "loading");

  if (weather === null && !outlook) {
    return (
      <div className="border-b border-border bg-background px-6 py-2 text-xs text-muted-foreground" role="status">
        {nowLoading || forecastStatus === "loading"
          ? t("live.checking", { city: ACTIVE_CITY.name })
          : t("live.unavailable")}
      </div>
    );
  }

  // Wards arrive ranked, most concerning first.
  const actFirst =
    !outlook || outlook.level === "none"
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
            {weather && !isStale && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-emerald/70" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                weather ? (isStale ? "bg-amber-500" : "bg-brand-emerald") : "bg-muted-foreground"
              }`}
            />
          </span>
          <span className="font-medium uppercase tracking-wide text-muted-foreground">{t("outlook.live")}</span>
          {weather ? (
            <>
              <span>
                {t("live.now", { city: ACTIVE_CITY.name })} <span className="font-mono text-sm font-semibold">{tempFormatted}</span>{" "}
                {t("live.air")}
              </span>
              <span className="text-muted-foreground">
                {t("live.feels")} <span className="font-mono text-foreground">{feelsLikeFormatted}</span>
              </span>
              {isStale && lastUpdatedFormatted && (
                <span className="text-muted-foreground">last updated {lastUpdatedFormatted}</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">
              {nowLoading ? t("live.checking", { city: ACTIVE_CITY.name }) : t("outlook.nowUnavailable")}
            </span>
          )}
        </p>

        {days && outlook ? (
          <>
            <ul className="flex items-center gap-3" aria-label="Forecast highs">
              {days.map((day) => {
                const hot = heatAlertFor(day.maxC) !== "none";
                return (
                  <li key={day.date} className="flex items-baseline gap-1 text-muted-foreground">
                    <span>{localDay(day.date, days[0].date, lang, t, "short")}</span>
                    <span
                      className={`font-mono text-foreground ${hot ? "font-semibold underline decoration-2 underline-offset-2" : ""}`}
                    >
                      {Math.round(day.maxC)}°
                    </span>
                  </li>
                );
              })}
            </ul>

            <OutlookStatement outlook={outlook} days={days} actFirst={actFirst} onSelectWard={onSelectWard} />
          </>
        ) : (
          <p className="text-muted-foreground" role="status">
            {forecastStatus === "loading" ? "Checking the forecast…" : "The forecast is unavailable right now."}
          </p>
        )}

        <button
          onClick={() => setShowRule((v) => !v)}
          aria-expanded={showRule}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
          {t("outlook.how")}
        </button>
      </div>

      {showRule && (
        <p className="mt-2 max-w-4xl leading-relaxed text-muted-foreground">
          The temperature now is live from OpenWeatherMap, refreshed every five minutes. Forecast highs are live from
          Open-Meteo. Both are for the city as a whole. A forecast high of {HEAT_ALERT_THRESHOLDS_C.heatWave}°C or more
          is a heat wave and {HEAT_ALERT_THRESHOLDS_C.severe}°C or more a severe one, the India Meteorological
          Department&apos;s criteria on actual temperature. {HEAT_ALERT_THRESHOLDS_C.watch} to{" "}
          {HEAT_ALERT_THRESHOLDS_C.heatWave}°C is shown as a heat watch, which is this tool&apos;s own label and not an
          official declaration. Weather does not change any locality&apos;s score: the score says where to act, the
          forecast says when. The localities named on an alert day are the highest-ranked ones in the Critical and
          High bands.
        </p>
      )}
    </section>
  );
}

function OutlookStatement({
  outlook,
  days,
  actFirst,
  onSelectWard,
}: {
  outlook: NonNullable<ReturnType<typeof heatOutlook>>;
  days: DayOutlook[];
  actFirst: string[];
  onSelectWard: (wardId: string) => void;
}) {
  const today = days[0].date;
  const lastDay = days[days.length - 1];
  const style = LEVEL_STYLE[outlook.level];
  const LevelIcon = style.icon;
  const { lang, t } = useLanguage();

  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-foreground" role="status">
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium ${style.pill}`}>
        <LevelIcon className={`h-3.5 w-3.5 shrink-0 ${style.iconColor}`} aria-hidden />
        {t(`outlook.${outlook.level}`)}
      </span>
      {outlook.level === "none" ? (
        <span className="text-muted-foreground">
          {t("outlook.below", { t: HEAT_ALERT_THRESHOLDS_C.watch, day: localDay(lastDay.date, today, lang, t) })}
        </span>
      ) : (
        <>
          <span className="font-medium">
            {t("outlook.high", { t: outlook.peak.maxC.toFixed(1), day: whenPhrase(outlook.peak.date, today, lang, t) })}
          </span>
          {actFirst.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">{t("outlook.actfirst")}</span>
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
  );
}
