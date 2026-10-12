import { NextResponse } from "next/server";
import { serverWeatherCache, type WeatherApiResponse } from "@/lib/weather";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<WeatherApiResponse>> {
  try {
    const data = await serverWeatherCache.getWeather();
    return NextResponse.json(
      {
        ok: true,
        data,
        stale: data.stale ?? false,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Weather service error";
    return NextResponse.json(
      {
        ok: false,
        data: null,
        error: errorMessage,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
}
