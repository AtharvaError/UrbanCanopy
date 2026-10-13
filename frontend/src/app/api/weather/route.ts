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
    // The reason stays in the server log. It can name a missing setting or the
    // provider's own error, neither of which a visitor needs to be told.
    console.error("[weather]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        ok: false,
        data: null,
        error: "Live weather is unavailable right now.",
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
