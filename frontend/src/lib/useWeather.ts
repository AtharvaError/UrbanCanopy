"use client";

import { useSyncExternalStore } from "react";
import {
  WEATHER_REFRESH_INTERVAL_MS,
  formatTemperature,
  formatLastUpdated,
  type WeatherData,
  type WeatherApiResponse,
} from "./weather";

export interface WeatherStoreState {
  data: WeatherData | null;
  status: "idle" | "loading" | "ok" | "error";
  error: string | null;
  isStale: boolean;
}

class WeatherStore {
  private state: WeatherStoreState = {
    data: null,
    status: "idle",
    error: null,
    isStale: false,
  };
  private listeners = new Set<() => void>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isFetching = false;
  private retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    // When the first subscriber mounts, activate timer and fetch initial data
    if (this.listeners.size === 1) {
      this.startTimer();
      if (this.state.status === "idle") {
        this.fetchWeather();
      }
    }

    return () => {
      this.listeners.delete(listener);
      // Clean up timer when all subscribers unmount to prevent leaks
      if (this.listeners.size === 0) {
        this.stopTimer();
      }
    };
  };

  public getSnapshot = (): WeatherStoreState => {
    return this.state;
  };

  public getServerSnapshot = (): WeatherStoreState => {
    return this.state;
  };

  private setState(partial: Partial<WeatherStoreState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener());
  }

  public async fetchWeather(): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;

    if (!this.state.data) {
      this.setState({ status: "loading", error: null });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch("/api/weather", {
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Weather API returned ${res.status}`);
      }

      const json = (await res.json()) as WeatherApiResponse;
      if (!json.ok || !json.data) {
        throw new Error(json.error || "Failed to load weather data");
      }

      this.setState({
        data: json.data,
        status: "ok",
        error: null,
        isStale: Boolean(json.stale || json.data.stale),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      // On failure, keep the last good value, mark as stale, never fabricate numbers
      if (this.state.data) {
        this.setState({
          status: "ok",
          error: msg,
          isStale: true,
        });
      } else {
        this.setState({
          status: "error",
          error: msg,
          isStale: false,
        });
      }

      // Schedule retry with backoff (retry after 30s)
      if (this.retryTimeoutId) clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = setTimeout(() => {
        this.fetchWeather();
      }, 30_000);
    } finally {
      this.isFetching = false;
    }
  }

  public startTimer(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.fetchWeather();
    }, WEATHER_REFRESH_INTERVAL_MS);
  }

  public stopTimer(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
  }

  public reset(): void {
    this.stopTimer();
    this.state = {
      data: null,
      status: "idle",
      error: null,
      isStale: false,
    };
    this.isFetching = false;
  }
}

export const weatherStore = new WeatherStore();

/**
 * Shared React hook to access real-time weather.
 * Connected to a single singleton store and single 5-minute timer.
 */
export function useWeather() {
  const state = useSyncExternalStore(
    weatherStore.subscribe,
    weatherStore.getSnapshot,
    weatherStore.getServerSnapshot
  );

  return {
    weather: state.data,
    status: state.status,
    error: state.error,
    isStale: state.isStale,
    tempFormatted: state.data ? formatTemperature(state.data.temp) : null,
    feelsLikeFormatted: state.data ? formatTemperature(state.data.feels_like) : null,
    lastUpdatedFormatted: state.data ? formatLastUpdated(state.data.fetchedAt) : null,
    refresh: () => weatherStore.fetchWeather(),
  };
}
