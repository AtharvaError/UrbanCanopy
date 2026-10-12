import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchLiveWeatherFromOpenWeather,
  serverWeatherCache,
  formatTemperature,
  formatLastUpdated,
  NAGPUR_WEATHER_QUERY,
  fetchCityTemp,
} from "./weather";

const mockOpenWeatherResponse = (overrides?: {
  temp?: number;
  feels_like?: number;
  name?: string;
}) => ({
  coord: { lon: 79.0882, lat: 21.1458 },
  weather: [{ id: 800, main: "Clear", description: "clear sky", icon: "01d" }],
  base: "stations",
  main: {
    temp: overrides?.temp ?? 32.4,
    feels_like: overrides?.feels_like ?? 34.1,
    temp_min: 30.0,
    temp_max: 35.0,
    pressure: 1012,
    humidity: 45,
  },
  visibility: 10000,
  dt: 1726000000,
  name: overrides?.name ?? "Nagpur",
});

const okResponse = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
  }) as unknown as Response;

describe("OpenWeatherMap Live Weather Service", () => {
  const TEST_API_KEY = "test_openweather_key_12345";

  beforeEach(() => {
    vi.stubEnv("OPENWEATHER_API_KEY", TEST_API_KEY);
    serverWeatherCache.resetCache();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    serverWeatherCache.resetCache();
  });

  describe("fetchLiveWeatherFromOpenWeather", () => {
    it("successfully fetches and parses Nagpur weather data from OpenWeatherMap", async () => {
      const fetchMock = vi.fn(async () => okResponse(mockOpenWeatherResponse()));
      vi.stubGlobal("fetch", fetchMock);

      const result = await fetchLiveWeatherFromOpenWeather({ apiKey: TEST_API_KEY });

      expect(result).toEqual({
        temp: 32.4,
        feels_like: 34.1,
        fetchedAt: expect.any(Number),
        city: "Nagpur",
        stale: false,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callArgs = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const calledUrl = new URL(String(callArgs[0]));
      expect(calledUrl.origin + calledUrl.pathname).toBe(
        "https://api.openweathermap.org/data/2.5/weather"
      );
      expect(calledUrl.searchParams.get("q")).toBe(NAGPUR_WEATHER_QUERY);
      expect(calledUrl.searchParams.get("units")).toBe("metric");
      expect(calledUrl.searchParams.get("appid")).toBe(TEST_API_KEY);
    });

    it("accepts a temperature reading of exactly zero without discarding it", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => okResponse(mockOpenWeatherResponse({ temp: 0, feels_like: -1.2 })))
      );

      const result = await fetchLiveWeatherFromOpenWeather({ apiKey: TEST_API_KEY });
      expect(result.temp).toBe(0);
      expect(result.feels_like).toBe(-1.2);
    });

    it("throws when OPENWEATHER_API_KEY is not defined in environment or options", async () => {
      vi.unstubAllEnvs();
      delete process.env.OPENWEATHER_API_KEY;

      await expect(fetchLiveWeatherFromOpenWeather({ apiKey: "" })).rejects.toThrow(
        "OPENWEATHER_API_KEY is not defined in environment"
      );
    });

    it("throws on non-200 HTTP response and never returns a fake number", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: async () => ({ message: "Invalid API key" }),
        }) as unknown as Response)
      );

      await expect(
        fetchLiveWeatherFromOpenWeather({ apiKey: TEST_API_KEY })
      ).rejects.toThrow("OpenWeatherMap returned status 401");
    });

    it("throws on network error without fabricating a default value", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new TypeError("Failed to fetch");
        })
      );

      await expect(
        fetchLiveWeatherFromOpenWeather({ apiKey: TEST_API_KEY })
      ).rejects.toThrow("Failed to fetch");
    });

    it("throws on malformed response body missing temperature", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => okResponse({ name: "Nagpur", main: {} }))
      );

      await expect(
        fetchLiveWeatherFromOpenWeather({ apiKey: TEST_API_KEY })
      ).rejects.toThrow("Invalid temperature data received from OpenWeatherMap");
    });

    it("passes an abort signal for request timeout", async () => {
      const fetchMock = vi.fn(async () => okResponse(mockOpenWeatherResponse()));
      vi.stubGlobal("fetch", fetchMock);

      await fetchLiveWeatherFromOpenWeather({ apiKey: TEST_API_KEY });

      const callArgs = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const requestInit = callArgs[1];
      expect(requestInit.signal).toBeDefined();
    });
  });

  describe("serverWeatherCache and 5-minute refresh", () => {
    it("returns cached data on repeated calls within the 5-minute window", async () => {
      const fetchMock = vi.fn(async () => okResponse(mockOpenWeatherResponse({ temp: 31.0 })));
      vi.stubGlobal("fetch", fetchMock);

      const first = await serverWeatherCache.getWeather({ apiKey: TEST_API_KEY });
      expect(first.temp).toBe(31.0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const second = await serverWeatherCache.getWeather({ apiKey: TEST_API_KEY });
      expect(second.temp).toBe(31.0);
      expect(fetchMock).toHaveBeenCalledTimes(1); // Cached, no second API call
    });

    it("refreshes the value after 5 minutes (300,000 ms) using fake timers", async () => {
      vi.useFakeTimers();
      const baseTime = 1_700_000_000_000;
      vi.setSystemTime(baseTime);

      let callCount = 0;
      const fetchMock = vi.fn(async () => {
        callCount++;
        return okResponse(mockOpenWeatherResponse({ temp: 30 + callCount }));
      });
      vi.stubGlobal("fetch", fetchMock);

      // 1. Initial call at T = 0
      const initial = await serverWeatherCache.getWeather({ apiKey: TEST_API_KEY });
      expect(initial.temp).toBe(31);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 2. Call after 2 minutes (120,000 ms): still fresh, should NOT call API
      vi.advanceTimersByTime(120_000);
      const after2Min = await serverWeatherCache.getWeather({ apiKey: TEST_API_KEY });
      expect(after2Min.temp).toBe(31);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 3. Call right before 5 minutes (299,000 ms): still cached
      vi.advanceTimersByTime(179_000); // Total elapsed: 299,000 ms
      const before5Min = await serverWeatherCache.getWeather({ apiKey: TEST_API_KEY });
      expect(before5Min.temp).toBe(31);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 4. Advance past the 5-minute (300,000 ms) threshold: cache expires!
      vi.advanceTimersByTime(2_000); // Total elapsed: 301,000 ms
      const after5Min = await serverWeatherCache.getWeather({ apiKey: TEST_API_KEY });
      expect(after5Min.temp).toBe(32);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("on failure after initial success, preserves the last good value with stale indicator", async () => {
      let shouldFail = false;
      const fetchMock = vi.fn(async () => {
        if (shouldFail) {
          throw new Error("Temporary network timeout");
        }
        return okResponse(mockOpenWeatherResponse({ temp: 33.5 }));
      });
      vi.stubGlobal("fetch", fetchMock);

      // Initial successful fetch
      const initial = await serverWeatherCache.getWeather({ apiKey: TEST_API_KEY });
      expect(initial.temp).toBe(33.5);
      expect(initial.stale).toBe(false);

      // Simulate cache expiration and subsequent failure
      shouldFail = true;
      const cached = serverWeatherCache.getCached();
      expect(cached).not.toBeNull();

      // Calling with forceRefresh when network fails
      const fallback = await serverWeatherCache.getWeather({
        apiKey: TEST_API_KEY,
        forceRefresh: true,
      });

      // Preserves last good reading, marked stale
      expect(fallback.temp).toBe(33.5);
      expect(fallback.stale).toBe(true);
    });

    it("never returns a fake default number on error when no cached value exists", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("Service down");
        })
      );

      await expect(serverWeatherCache.getWeather({ apiKey: TEST_API_KEY })).rejects.toThrow(
        "Service down"
      );
      expect(serverWeatherCache.getCached()).toBeNull();
    });

    it("deduplicates concurrent in-flight requests", async () => {
      const fetchMock = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return okResponse(mockOpenWeatherResponse({ temp: 28.5 }));
      });
      vi.stubGlobal("fetch", fetchMock);

      const [res1, res2] = await Promise.all([
        serverWeatherCache.getWeather({ apiKey: TEST_API_KEY }),
        serverWeatherCache.getWeather({ apiKey: TEST_API_KEY }),
      ]);

      expect(res1.temp).toBe(28.5);
      expect(res2.temp).toBe(28.5);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("formatTemperature shared formatter", () => {
    it("formats numbers to 1 decimal place with °C", () => {
      expect(formatTemperature(32.4)).toBe("32.4°C");
      expect(formatTemperature(32.48)).toBe("32.5°C");
      expect(formatTemperature(0)).toBe("0.0°C");
      expect(formatTemperature(-3.2)).toBe("-3.2°C");
      expect(formatTemperature(40)).toBe("40.0°C");
    });
  });

  describe("formatLastUpdated shared formatter", () => {
    it("formats timestamps to HH:MM", () => {
      const date = new Date("2026-09-03T14:25:00Z");
      const formatted = formatLastUpdated(date.getTime());
      expect(formatted).toMatch(/^\d{2}:\d{2}$/);
    });

    it("returns empty string on invalid timestamp", () => {
      expect(formatLastUpdated(0)).toBe("");
      expect(formatLastUpdated(NaN)).toBe("");
    });
  });

  describe("fetchCityTemp backward-compatibility adapter", () => {
    it("returns temperatureC and observedAt on success", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => okResponse(mockOpenWeatherResponse({ temp: 29.8 }))));
      const result = await fetchCityTemp({}, { apiKey: TEST_API_KEY });
      expect(result).not.toBeNull();
      expect(result?.temperatureC).toBe(29.8);
      expect(result?.observedAt).toBeDefined();
    });

    it("returns null on failure, never a fabricated number", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("Network down");
        })
      );
      const result = await fetchCityTemp({}, { apiKey: TEST_API_KEY });
      expect(result).toBeNull();
    });
  });
});
