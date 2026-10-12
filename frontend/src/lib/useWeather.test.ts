import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { weatherStore } from "./useWeather";
import { WEATHER_REFRESH_INTERVAL_MS } from "./weather";

const okApiResponse = (data: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      data,
      stale: false,
    }),
  }) as unknown as Response;

describe("weatherStore", () => {
  beforeEach(() => {
    weatherStore.reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    weatherStore.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("triggers initial fetch on first subscriber and starts 5-minute timer", async () => {
    const fetchMock = vi.fn(async () =>
      okApiResponse({
        temp: 32.4,
        feels_like: 34.0,
        fetchedAt: 1726000000,
        city: "Nagpur",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const listener = vi.fn();
    const unsubscribe = weatherStore.subscribe(listener);

    // Allow promise tick to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchMock).toHaveBeenCalledWith("/api/weather", expect.any(Object));
    const snapshot = weatherStore.getSnapshot();
    expect(snapshot.data?.temp).toBe(32.4);
    expect(snapshot.status).toBe("ok");

    unsubscribe();
  });

  it("refreshes data every 5 minutes (300,000 ms) via interval timer", async () => {
    vi.useFakeTimers();

    let fetchCount = 0;
    const fetchMock = vi.fn(async () => {
      fetchCount++;
      return okApiResponse({
        temp: 30 + fetchCount,
        feels_like: 32 + fetchCount,
        fetchedAt: Date.now(),
        city: "Nagpur",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const unsubscribe = weatherStore.subscribe(() => {});

    // Initial fetch settles
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchCount).toBe(1);
    expect(weatherStore.getSnapshot().data?.temp).toBe(31);

    // Fast-forward 5 minutes (300,000 ms)
    await vi.advanceTimersByTimeAsync(WEATHER_REFRESH_INTERVAL_MS);
    expect(fetchCount).toBe(2);
    expect(weatherStore.getSnapshot().data?.temp).toBe(32);

    unsubscribe();
    vi.useRealTimers();
  });

  it("cleans up timer when all subscribers unsubscribe", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(async () =>
      okApiResponse({
        temp: 32.4,
        feels_like: 34.0,
        fetchedAt: Date.now(),
        city: "Nagpur",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const unsubscribe = weatherStore.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Unsubscribe cleans up timer
    unsubscribe();

    // Advancing 5 minutes should NOT trigger fetch anymore
    await vi.advanceTimersByTimeAsync(WEATHER_REFRESH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("preserves last good reading as stale on network error", async () => {
    let shouldFail = false;
    const fetchMock = vi.fn(async () => {
      if (shouldFail) {
        throw new Error("Network offline");
      }
      return okApiResponse({
        temp: 32.4,
        feels_like: 34.0,
        fetchedAt: Date.now(),
        city: "Nagpur",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const unsubscribe = weatherStore.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 10));

    expect(weatherStore.getSnapshot().data?.temp).toBe(32.4);
    expect(weatherStore.getSnapshot().isStale).toBe(false);

    // Fail subsequent fetch
    shouldFail = true;
    await weatherStore.fetchWeather();

    const snapshot = weatherStore.getSnapshot();
    expect(snapshot.data?.temp).toBe(32.4);
    expect(snapshot.isStale).toBe(true);

    unsubscribe();
  });
});
