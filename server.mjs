import "dotenv/config";
import http from "node:http";

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.EXPLABS_API_KEY;

if (!API_KEY) {
  console.warn("WARNING: EXPLABS_API_KEY is not defined in .env");
}

let serverWeatherCache = null;

async function getCachedLiveWeather() {
  const now = Date.now();
  if (serverWeatherCache && now - serverWeatherCache.fetchedAt < 300_000) {
    return serverWeatherCache;
  }
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    throw new Error("OPENWEATHER_API_KEY is not defined in environment");
  }

  try {
    const res = await fetch(
      "https://api.openweathermap.org/data/2.5/weather?q=Nagpur,IN&units=metric&appid=" + key,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) {
      throw new Error(`OpenWeatherMap returned status ${res.status}`);
    }
    const data = await res.json();
    serverWeatherCache = {
      temp: data.main.temp,
      feels_like: data.main.feels_like,
      fetchedAt: now,
      city: data.name || "Nagpur",
      stale: false,
    };
    return serverWeatherCache;
  } catch (err) {
    if (serverWeatherCache) {
      return { ...serverWeatherCache, stale: true };
    }
    throw err;
  }
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/weather") {
    try {
      const data = await getCachedLiveWeather();
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: true, data, stale: data.stale ?? false }));
    } catch (err) {
      res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: false, data: null, error: err.message || "Weather unavailable" }));
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/heat-explain") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const { localityName, hvi, rank, factors, recommendation } = payload;

        const systemPrompt = `You are an urban heat resilience advisor for the Urban Canopy (UCIP Nagpur) initiative. Provide a clear, insightful, and professional explanation of the heat risk for the given locality. Structure your answer with:
1. Vulnerability Overview: Explain what the HVI score and rank signify.
2. Contributing Drivers: Detail which specific factors (such as land surface temperature, green cover/NDVI, population density, slum settlements, hospital distance, or impervious surface) drive the risk up or down.
3. Recommended Interventions: Why the proposed mitigation actions help this specific locality.
Keep the tone informative, civic-oriented, and accessible to city planners and citizens alike.`;

        const userPrompt = `Locality: ${localityName || "Unknown"}
Heat Vulnerability Index (HVI): ${hvi ?? "N/A"}
City-wide Rank: ${rank ? `#${rank}` : "N/A"}
Contributing Factors: ${typeof factors === "object" ? JSON.stringify(factors, null, 2) : factors || "N/A"}
Recommendations: ${recommendation || "N/A"}

Please explain this locality's heat risk and intervention priorities based on the above data.`;

        const modelName = process.env.EXPLABS_MODEL || "deepseek-v4-flash";

        const apiResponse = await fetch(
          "https://api.experientiallabs.ai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${API_KEY}`,
            },
            body: JSON.stringify({
              model: modelName,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: 0.7,
            }),
          }
        );

        const data = await apiResponse.json();

        if (!apiResponse.ok) {
          console.error("Experiential Labs API error:", apiResponse.status, data);
          res.writeHead(apiResponse.status, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: data.error?.message || data.error || "Failed to generate AI explanation.",
            })
          );
          return;
        }

        const explanation =
          data.choices?.[0]?.message?.content || "No explanation generated.";

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ explanation }));
      } catch (err) {
        console.error("Server error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Internal server error" }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`UCIP Heat Risk Explainer backend running at http://localhost:${PORT}`);
});
