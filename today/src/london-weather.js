import { bodyUpTo } from "./body.js";
import { londonForecast, londonConditions } from "../public/about/weather-data.js";

export async function londonWeather(request, ctx) {
  try {
    const key = new Request(new URL("/api/about/weather", request.url));
    const cache = globalThis.caches?.default;
    const cached = await cache?.match(key).catch(() => null);
    if (cached) {
      const forecast = londonConditions(await cached.json());
      if (forecast) return forecast;
    }

    const signal = AbortSignal.timeout(5000);
    const response = await fetch(londonForecast, {
      headers: { Accept: "application/json", "User-Agent": "inflite.ai About" },
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const body = await bodyUpTo(response, 16 * 1024, { signal });
    const forecast = londonConditions(JSON.parse(body));
    if (forecast && cache && ctx?.waitUntil) ctx.waitUntil(cache.put(key, new Response(body, {
      headers: { "Cache-Control": "max-age=600", "Content-Type": "application/json" },
    })).catch(() => {}));
    return forecast;
  } catch {
    return null;
  }
}
