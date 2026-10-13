/**
 * The forecast side of the dashboard's heat outlook bar.
 *
 * Two things matter most. `fetchForecastHighs` returns null on any failure and
 * never a made-up day, because the bar shows these numbers as live. And the
 * alert thresholds are the ones the bar's own explanation states, so the rule
 * a reader is told is the rule that runs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  dayLabel,
  fetchForecastHighs,
  HEAT_ALERT_THRESHOLDS_C,
  heatAlertFor,
  heatOutlook,
  OUTLOOK_DAYS,
} from "./heatOutlook";
import { NAGPUR } from "./city";

const okResponse = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

const daily = {
  time: ["2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14"],
  temperature_2m_max: [43.1, 44.6, 45.9, 44.0],
};

beforeEach(() => {
  // The failure paths log to console.error by design; keep the test output clean.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fetchForecastHighs", () => {
  it("parses the forecast highs, today first", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse({ daily })));

    expect(await fetchForecastHighs(NAGPUR)).toEqual([
      { date: "2026-05-11", maxC: 43.1 },
      { date: "2026-05-12", maxC: 44.6 },
      { date: "2026-05-13", maxC: 45.9 },
      { date: "2026-05-14", maxC: 44.0 },
    ]);
  });

  it("asks for the city it is given, in that city's timezone", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => okResponse({ daily }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchForecastHighs(NAGPUR);

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("latitude")).toBe(String(NAGPUR.lat));
    expect(url.searchParams.get("longitude")).toBe(String(NAGPUR.lon));
    expect(url.searchParams.get("timezone")).toBe(NAGPUR.timezone);
    expect(url.searchParams.get("daily")).toBe("temperature_2m_max");
    expect(url.searchParams.get("forecast_days")).toBe(String(OUTLOOK_DAYS));
  });

  it("passes an abort signal so the request cannot hang forever", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => okResponse({ daily }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchForecastHighs(NAGPUR);

    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("drops a forecast day with no usable high instead of filling it in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        okResponse({ daily: { time: ["2026-05-11", "2026-05-12", "2026-05-13"], temperature_2m_max: [43.1, null, 45.9] } })
      )
    );

    expect(await fetchForecastHighs(NAGPUR)).toEqual([
      { date: "2026-05-11", maxC: 43.1 },
      { date: "2026-05-13", maxC: 45.9 },
    ]);
  });

  it("returns null, never a made-up forecast, on every failure", async () => {
    const failures = [
      async () => {
        throw new Error("network");
      },
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response,
      async () => okResponse({}),
      async () => okResponse({ daily: { time: ["2026-05-11"] } }),
      // A forecast with no usable day.
      async () => okResponse({ daily: { time: ["2026-05-11"], temperature_2m_max: [null] } }),
    ];

    for (const impl of failures) {
      vi.stubGlobal("fetch", vi.fn(impl));
      expect(await fetchForecastHighs(NAGPUR)).toBeNull();
    }
  });
});

describe("heatAlertFor", () => {
  it("starts each level exactly at its threshold", () => {
    expect(heatAlertFor(39.9)).toBe("none");
    expect(heatAlertFor(40)).toBe("watch");
    expect(heatAlertFor(44.9)).toBe("watch");
    expect(heatAlertFor(45)).toBe("heat-wave");
    expect(heatAlertFor(46.9)).toBe("heat-wave");
    expect(heatAlertFor(47)).toBe("severe");
  });

  it("uses the published thresholds, so the bar's explanation matches the rule", () => {
    expect(HEAT_ALERT_THRESHOLDS_C).toEqual({ watch: 40, heatWave: 45, severe: 47 });
  });
});

describe("heatOutlook", () => {
  it("takes its level from the hottest day and names the first day that crosses the line", () => {
    const outlook = heatOutlook(daily.time.map((date, i) => ({ date, maxC: daily.temperature_2m_max[i] })));
    expect(outlook).toEqual({
      level: "heat-wave",
      peak: { date: "2026-05-13", maxC: 45.9 },
      firstAlertDay: { date: "2026-05-11", maxC: 43.1 },
    });
  });

  it("reports no alert and no alert day when every high is under the watch line", () => {
    const outlook = heatOutlook([
      { date: "2026-10-12", maxC: 32.4 },
      { date: "2026-10-13", maxC: 33.0 },
    ]);
    expect(outlook).toMatchObject({ level: "none", firstAlertDay: null, peak: { date: "2026-10-13" } });
  });

  it("keeps the earliest day when two tie for hottest", () => {
    const outlook = heatOutlook([
      { date: "2026-05-11", maxC: 46 },
      { date: "2026-05-12", maxC: 46 },
    ]);
    expect(outlook!.peak.date).toBe("2026-05-11");
  });

  it("has nothing to say about an empty forecast", () => {
    expect(heatOutlook([])).toBeNull();
  });
});

describe("dayLabel", () => {
  it("names today and tomorrow, then the weekday", () => {
    // 11 May 2026 is a Monday.
    expect(dayLabel("2026-05-11", "2026-05-11")).toBe("Today");
    expect(dayLabel("2026-05-12", "2026-05-11")).toBe("Tomorrow");
    expect(dayLabel("2026-05-13", "2026-05-11")).toBe("Wednesday");
  });

  it("has a short form for a row of days", () => {
    expect(dayLabel("2026-05-11", "2026-05-11", "short")).toBe("Today");
    expect(dayLabel("2026-05-12", "2026-05-11", "short")).toBe("Tue");
  });

  it("counts across a month end", () => {
    expect(dayLabel("2026-06-01", "2026-05-31")).toBe("Tomorrow");
  });
});
