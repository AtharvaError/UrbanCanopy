/**
 * Live weather for the configured city, via Open-Meteo (api.open-meteo.com):
 * free, no API key, no rate-limit auth.
 *
 * Two readers. `LiveTempStrip` shows the current air temperature beside the
 * map's land-surface-temperature proxy. `HeatOutlookBar` shows the current
 * conditions and the next few days' highs, and turns the hottest of them into
 * an alert level.
 *
 * Live weather is one reading for the whole city, so it never enters the
 * priority score, which is per locality. The score says where; this says when.
 *
 * Every fetch here returns `null` on any failure rather than a stale or
 * fabricated value: the product rule is "numbers are real, never invented," and
 * live weather has no honest static-snapshot fallback the way the map's
 * satellite data does.
 */

import type { CityConfig } from "./city";

const FETCH_TIMEOUT_MS = 5000;
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

/** Today plus the next three days. */
export const OUTLOOK_DAYS = 4;

export type CityTemp = {
  temperatureC: number;
  observedAt: string;
};

export type DayOutlook = {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  maxC: number;
};

export type CityWeather = CityTemp & {
  /** What the air feels like with humidity and wind, when the service reports it. */
  feelsLikeC: number | null;
  humidityPct: number | null;
  /** Forecast highs, today first. */
  days: DayOutlook[];
};

/** One GET against the forecast endpoint. Null on any failure, never a throw. */
async function getForecast(city: CityConfig, params: Record<string, string>): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = new URL(FORECAST_URL);
    url.searchParams.set("latitude", String(city.lat));
    url.searchParams.set("longitude", String(city.lon));
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("timezone", city.timezone);

    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("[weather] forecast request failed:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const numberOrNull = (value: unknown): number | null => (typeof value === "number" ? value : null);

export async function fetchCityTemp(city: CityConfig): Promise<CityTemp | null> {
  const data = (await getForecast(city, { current: "temperature_2m" })) as {
    current?: { temperature_2m?: number; time?: string };
  } | null;

  const temperatureC = data?.current?.temperature_2m;
  if (typeof temperatureC !== "number") return null;

  return { temperatureC, observedAt: data?.current?.time ?? "" };
}

/**
 * Current conditions and the forecast highs.
 *
 * The current temperature and at least one forecast day are required; without
 * either there is nothing to build an outlook from, so the result is null.
 * "Feels like" and humidity are optional extras and come back null when absent.
 * A forecast day with no usable high is dropped, not filled in.
 */
export async function fetchCityWeather(city: CityConfig): Promise<CityWeather | null> {
  const data = (await getForecast(city, {
    current: "temperature_2m,apparent_temperature,relative_humidity_2m",
    daily: "temperature_2m_max",
    forecast_days: String(OUTLOOK_DAYS),
  })) as {
    current?: { temperature_2m?: unknown; apparent_temperature?: unknown; relative_humidity_2m?: unknown; time?: string };
    daily?: { time?: unknown; temperature_2m_max?: unknown };
  } | null;

  const temperatureC = data?.current?.temperature_2m;
  if (typeof temperatureC !== "number") return null;

  const dates = data?.daily?.time;
  const highs = data?.daily?.temperature_2m_max;
  if (!Array.isArray(dates) || !Array.isArray(highs)) return null;

  const days: DayOutlook[] = [];
  dates.forEach((date, i) => {
    const maxC = highs[i];
    if (typeof date === "string" && typeof maxC === "number") days.push({ date, maxC });
  });
  if (days.length === 0) return null;

  return {
    temperatureC,
    observedAt: data?.current?.time ?? "",
    feelsLikeC: numberOrNull(data?.current?.apparent_temperature),
    humidityPct: numberOrNull(data?.current?.relative_humidity_2m),
    days,
  };
}

export type HeatAlertLevel = "none" | "watch" | "heat-wave" | "severe";

/**
 * Forecast highs, in °C, at which each level starts.
 *
 * 45 and 47 are the India Meteorological Department's criteria on actual
 * maximum temperature: a heat wave at 45°C or more, a severe one at 47°C or
 * more. 40 is the least a plains station must reach before IMD considers a
 * heat wave at all.
 *
 * IMD's other route to a heat wave, a high 4.5°C or more above the station's
 * long-term normal for the date, is not applied: it needs the normals, which
 * this tool does not hold. So between 40 and 45 the level is "watch", this
 * tool's own word, not an IMD declaration.
 */
export const HEAT_ALERT_THRESHOLDS_C = { watch: 40, heatWave: 45, severe: 47 } as const;

export const HEAT_ALERT_LABELS: Record<HeatAlertLevel, string> = {
  none: "No heat alert",
  watch: "Heat watch",
  "heat-wave": "Heat wave",
  severe: "Severe heat wave",
};

export function heatAlertFor(maxC: number): HeatAlertLevel {
  if (maxC >= HEAT_ALERT_THRESHOLDS_C.severe) return "severe";
  if (maxC >= HEAT_ALERT_THRESHOLDS_C.heatWave) return "heat-wave";
  if (maxC >= HEAT_ALERT_THRESHOLDS_C.watch) return "watch";
  return "none";
}

export type HeatOutlook = {
  /** The level of the hottest day in the outlook. */
  level: HeatAlertLevel;
  /** The hottest day; the earliest one when several tie. */
  peak: DayOutlook;
  /** The first day at or above the watch threshold, or null when none is. */
  firstAlertDay: DayOutlook | null;
};

/** Reads an alert level off a run of forecast days. Null when there are none. */
export function heatOutlook(days: DayOutlook[]): HeatOutlook | null {
  if (days.length === 0) return null;
  const peak = days.reduce((hottest, day) => (day.maxC > hottest.maxC ? day : hottest));
  return {
    level: heatAlertFor(peak.maxC),
    peak,
    firstAlertDay: days.find((day) => heatAlertFor(day.maxC) !== "none") ?? null,
  };
}

/**
 * "Today", "Tomorrow", or the weekday, for a forecast date. The short form is
 * "Today" or a three-letter weekday, for a row of days.
 *
 * Works on calendar dates alone. The service already returns dates in the
 * city's own timezone, so comparing them as dates avoids reading the visitor's
 * clock, which may be in another timezone.
 */
export function dayLabel(date: string, today: string, width: "long" | "short" = "long"): string {
  const parse = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const offsetDays = Math.round((parse(date) - parse(today)) / 86_400_000);
  if (offsetDays === 0) return "Today";
  if (offsetDays === 1 && width === "long") return "Tomorrow";
  return new Intl.DateTimeFormat("en-IN", { weekday: width, timeZone: "UTC" }).format(new Date(parse(date)));
}
