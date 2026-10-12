/**
 * Issue #41.
 *
 * fetchCityTemp has one invariant that matters more than everything else in the
 * file: on any failure it returns null, never a number. The widget's whole
 * justification is showing a real live reading next to the map's satellite
 * proxy, and UCIP's product rule is that numbers are real or absent. A
 * well-meaning "fall back to 30C so the widget isn't empty" would quietly turn
 * the one live figure on the page into a fabrication, so these tests are written
 * to fail loudly if anyone ever adds one.
 *
 * (The issue refers to this as fetchMumbaiTemp; it was renamed to fetchCityTemp
 * by issue #17 when the hardcoded Mumbai coordinates were moved into city.ts.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  dayLabel,
  fetchCityTemp,
  fetchCityWeather,
  HEAT_ALERT_THRESHOLDS_C,
  heatAlertFor,
  heatOutlook,
  OUTLOOK_DAYS,
} from "./weather";
import { MUMBAI, NAGPUR } from "./city";

const okResponse = (body: unknown) =>
  ({ ok: true, json: async () => body }) as unknown as Response;

beforeEach(() => {
  // The failure paths log to console.error by design; keep the test output clean.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fetchCityTemp success path", () => {
  it("parses the temperature and observation time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse({ current: { temperature_2m: 31.4, time: "2026-09-03T09:00" } }))
    );

    const result = await fetchCityTemp(MUMBAI);
    expect(result).toEqual({ temperatureC: 31.4, observedAt: "2026-09-03T09:00" });
  });

  it("accepts a reading of exactly zero", async () => {
    // 0 is falsy. A truthiness check instead of a typeof check would discard a
    // legitimate reading here.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse({ current: { temperature_2m: 0, time: "2026-01-01T06:00" } }))
    );

    const result = await fetchCityTemp(MUMBAI);
    expect(result).not.toBeNull();
    expect(result!.temperatureC).toBe(0);
  });

  it("tolerates a missing timestamp without discarding the reading", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse({ current: { temperature_2m: 29 } })));

    const result = await fetchCityTemp(MUMBAI);
    expect(result).toEqual({ temperatureC: 29, observedAt: "" });
  });

  it("queries the coordinates of the city it is given, not a hardcoded location", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      okResponse({ current: { temperature_2m: 20, time: "2026-09-03T09:00" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCityTemp({
      slug: "pune",
      name: "Pune",
      center: [18.5204, 73.8567],
      zoom: 11,
      bbox: [73.7, 18.4, 74.0, 18.65],
      lat: 18.5204,
      lon: 73.8567,
      timezone: "Asia/Kolkata",
      cellSizeM: 1000,
      cellLabel: "1 km",
    });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("latitude")).toBe("18.5204");
    expect(url.searchParams.get("longitude")).toBe("73.8567");
    expect(url.searchParams.get("current")).toBe("temperature_2m");
  });
});

describe("fetchCityTemp failure paths all return null", () => {
  it("returns null on a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    expect(await fetchCityTemp(MUMBAI)).toBeNull();
  });

  it("returns null on an abort/timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        throw err;
      })
    );
    expect(await fetchCityTemp(MUMBAI)).toBeNull();
  });

  it("returns null on a non-OK HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response)
    );
    expect(await fetchCityTemp(MUMBAI)).toBeNull();
  });

  it("returns null on a malformed body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse({})));
    expect(await fetchCityTemp(MUMBAI)).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => okResponse({ current: {} })));
    expect(await fetchCityTemp(MUMBAI)).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => okResponse({ current: { temperature_2m: null } })));
    expect(await fetchCityTemp(MUMBAI)).toBeNull();
  });

  it("returns null when the temperature is a string rather than a number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse({ current: { temperature_2m: "31.4", time: "x" } }))
    );
    expect(await fetchCityTemp(MUMBAI)).toBeNull();
  });

  it("returns null when the response body is not JSON at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => {
              throw new SyntaxError("Unexpected token < in JSON");
            },
          }) as unknown as Response
      )
    );
    expect(await fetchCityTemp(MUMBAI)).toBeNull();
  });

  it("never returns a fabricated fallback number on any failure", async () => {
    // The regression this whole suite exists to prevent. If someone adds a
    // default temperature on the error path, every case below starts returning
    // an object and this fails.
    const failures = [
      async () => {
        throw new Error("network");
      },
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response,
      async () => okResponse({}),
      async () => okResponse({ current: { temperature_2m: undefined } }),
    ];

    for (const impl of failures) {
      vi.stubGlobal("fetch", vi.fn(impl));
      expect(await fetchCityTemp(MUMBAI)).toBeNull();
    }
  });
});

describe("fetchCityTemp request shape", () => {
  it("passes an abort signal so the request cannot hang forever", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      okResponse({ current: { temperature_2m: 30, time: "2026-09-03T09:00" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCityTemp(MUMBAI);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

const fullBody = {
  current: { temperature_2m: 41.2, apparent_temperature: 44.8, relative_humidity_2m: 18, time: "2026-05-11T14:00" },
  daily: {
    time: ["2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14"],
    temperature_2m_max: [43.1, 44.6, 45.9, 44.0],
  },
};

describe("fetchCityWeather", () => {
  it("parses current conditions and the forecast highs, today first", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse(fullBody)));

    expect(await fetchCityWeather(NAGPUR)).toEqual({
      temperatureC: 41.2,
      observedAt: "2026-05-11T14:00",
      feelsLikeC: 44.8,
      humidityPct: 18,
      days: [
        { date: "2026-05-11", maxC: 43.1 },
        { date: "2026-05-12", maxC: 44.6 },
        { date: "2026-05-13", maxC: 45.9 },
        { date: "2026-05-14", maxC: 44.0 },
      ],
    });
  });

  it("asks for the city it is given, in that city's timezone", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => okResponse(fullBody));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCityWeather(NAGPUR);

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("latitude")).toBe(String(NAGPUR.lat));
    expect(url.searchParams.get("longitude")).toBe(String(NAGPUR.lon));
    expect(url.searchParams.get("timezone")).toBe(NAGPUR.timezone);
    expect(url.searchParams.get("daily")).toBe("temperature_2m_max");
    expect(url.searchParams.get("forecast_days")).toBe(String(OUTLOOK_DAYS));
  });

  it("keeps the reading when the optional extras are missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse({ current: { temperature_2m: 30 }, daily: fullBody.daily }))
    );

    const result = await fetchCityWeather(NAGPUR);
    expect(result).toMatchObject({ temperatureC: 30, feelsLikeC: null, humidityPct: null });
  });

  it("drops a forecast day with no usable high instead of filling it in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        okResponse({
          current: fullBody.current,
          daily: { time: ["2026-05-11", "2026-05-12", "2026-05-13"], temperature_2m_max: [43.1, null, 45.9] },
        })
      )
    );

    const result = await fetchCityWeather(NAGPUR);
    expect(result!.days).toEqual([
      { date: "2026-05-11", maxC: 43.1 },
      { date: "2026-05-13", maxC: 45.9 },
    ]);
  });

  it("returns null, never a made-up outlook, on every failure", async () => {
    const failures = [
      async () => {
        throw new Error("network");
      },
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response,
      async () => okResponse({}),
      // No current temperature.
      async () => okResponse({ current: {}, daily: fullBody.daily }),
      // No forecast at all.
      async () => okResponse({ current: fullBody.current }),
      // A forecast with no usable day.
      async () => okResponse({ current: fullBody.current, daily: { time: ["2026-05-11"], temperature_2m_max: [null] } }),
    ];

    for (const impl of failures) {
      vi.stubGlobal("fetch", vi.fn(impl));
      expect(await fetchCityWeather(NAGPUR)).toBeNull();
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
    const outlook = heatOutlook(fullBody.daily.time.map((date, i) => ({ date, maxC: fullBody.daily.temperature_2m_max[i] })));
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
