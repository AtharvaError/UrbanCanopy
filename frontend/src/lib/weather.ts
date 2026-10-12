/**
 * Single source of truth for real-time air temperature from OpenWeatherMap API for Nagpur.
 *
 * Implements 5-minute (300,000 ms) caching, request timeout, graceful failure handling
 * with stale fallback (preserving last good reading, never fabricating numbers),
 * and shared temperature formatting.
 */

export const NAGPUR_WEATHER_QUERY = "Nagpur,IN";
export const WEATHER_REFRESH_INTERVAL_MS = 300_000; // 5 minutes
export const WEATHER_TIMEOUT_MS = 5_000; // 5 seconds

export interface WeatherData {
  temp: number;
  feels_like: number;
  fetchedAt: number; // timestamp in milliseconds
  city: string;
  stale?: boolean;
}

export interface WeatherApiResponse {
  ok: boolean;
  data: WeatherData | null;
  error?: string;
  stale?: boolean;
}

/** OpenWeatherMap raw response subset */
export interface OpenWeatherRawResponse {
  name?: string;
  dt?: number;
  main?: {
    temp?: number;
    feels_like?: number;
    temp_min?: number;
    temp_max?: number;
    humidity?: number;
  };
  weather?: Array<{
    main?: string;
    description?: string;
    icon?: string;
  }>;
}

/**
 * Shared formatter for units and rounding so temperature is rendered
 * identically everywhere across the application (e.g. "32.4°C").
 */
export function formatTemperature(c: number): string {
  return `${c.toFixed(1)}°C`;
}

/**
 * Shared formatter for "last updated HH:MM".
 */
export function formatLastUpdated(timestamp: number): string {
  if (!timestamp || Number.isNaN(timestamp)) return "";
  const d = new Date(timestamp);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Low-level function to fetch live weather for Nagpur from OpenWeatherMap API.
 * Never hardcodes or logs the secret API key.
 */
export async function fetchLiveWeatherFromOpenWeather(options?: {
  apiKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<WeatherData> {
  const key = options?.apiKey || process.env.OPENWEATHER_API_KEY;
  if (!key) {
    throw new Error("OPENWEATHER_API_KEY is not defined in environment");
  }

  const timeoutMs = options?.timeoutMs ?? WEATHER_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    url.searchParams.set("q", NAGPUR_WEATHER_QUERY);
    url.searchParams.set("units", "metric");
    url.searchParams.set("appid", key);

    const signal = options?.signal
      ? AbortSignal.any
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal
      : controller.signal;

    const res = await fetch(url.toString(), { signal });

    if (!res.ok) {
      throw new Error(`OpenWeatherMap returned status ${res.status}`);
    }

    const data = (await res.json()) as OpenWeatherRawResponse;
    const temp = data.main?.temp;
    const feels_like = data.main?.feels_like;

    if (typeof temp !== "number" || typeof feels_like !== "number") {
      throw new Error("Invalid temperature data received from OpenWeatherMap");
    }

    return {
      temp,
      feels_like,
      fetchedAt: Date.now(),
      city: data.name || "Nagpur",
      stale: false,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Server-side singleton cache structure.
 */
class WeatherCacheManager {
  private cached: WeatherData | null = null;
  private pendingFetch: Promise<WeatherData> | null = null;
  private retryDelayMs = 15_000; // Backoff retry delay on failure (15s)
  private nextAllowedFetchTime = 0;

  public getCached(): WeatherData | null {
    return this.cached;
  }

  public resetCache(): void {
    this.cached = null;
    this.pendingFetch = null;
    this.nextAllowedFetchTime = 0;
  }

  /**
   * Retrieves weather data with 5-minute cache.
   * If cache is fresh (< 300,000ms), returns cached immediately without API call.
   * On failure, preserves the last good value and flags it as stale.
   */
  public async getWeather(options?: {
    apiKey?: string;
    forceRefresh?: boolean;
    now?: number;
  }): Promise<WeatherData> {
    const now = options?.now ?? Date.now();

    // Return cached if fresh
    if (
      !options?.forceRefresh &&
      this.cached &&
      now - this.cached.fetchedAt < WEATHER_REFRESH_INTERVAL_MS
    ) {
      return this.cached;
    }

    // Respect retry backoff if recent failure
    if (now < this.nextAllowedFetchTime && this.cached) {
      return { ...this.cached, stale: true };
    }

    // Deduplicate in-flight requests
    if (this.pendingFetch) {
      return this.pendingFetch;
    }

    this.pendingFetch = (async () => {
      try {
        const fresh = await fetchLiveWeatherFromOpenWeather({ apiKey: options?.apiKey });
        this.cached = fresh;
        this.nextAllowedFetchTime = 0;
        return fresh;
      } catch (err) {
        // Schedule retry with backoff (15s, up to 60s)
        this.nextAllowedFetchTime = now + this.retryDelayMs;

        // If we have a previously cached good value, preserve it as stale
        if (this.cached) {
          return {
            ...this.cached,
            stale: true,
          };
        }

        // Never invent a fake number
        throw err;
      } finally {
        this.pendingFetch = null;
      }
    })();

    return this.pendingFetch;
  }
}

export const serverWeatherCache = new WeatherCacheManager();

/**
 * Backward-compatible helper that delegates to serverWeatherCache.
 * Returns { temperatureC, observedAt } on success or null on any failure.
 * Never returns a fabricated number.
 */
export async function fetchCityTemp(
  _city?: unknown,
  options?: { apiKey?: string }
): Promise<{ temperatureC: number; observedAt: string } | null> {
  try {
    const data = await serverWeatherCache.getWeather(options);
    return {
      temperatureC: data.temp,
      observedAt: new Date(data.fetchedAt).toISOString(),
    };
  } catch {
    return null;
  }
}
