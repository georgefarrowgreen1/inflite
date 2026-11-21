import { bodyUpTo } from "./body.js";

const londonForecast = "https://api.open-meteo.com/v1/forecast?" + new URLSearchParams({
  latitude: "51.5072",
  longitude: "-0.1276",
  current: "temperature_2m,weather_code,is_day,wind_speed_10m,wind_gusts_10m",
  hourly: "temperature_2m",
  daily: "temperature_2m_max,temperature_2m_min",
  wind_speed_unit: "kmh",
  timeformat: "unixtime",
  timezone: "Europe/London",
  forecast_days: "2",
});

export async function londonWeather() {
  try {
    const signal = AbortSignal.timeout(5000);
    const response = await fetch(londonForecast, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal,
      cf: { cacheEverything: true, cacheTtlByStatus: { "200": 600, "201-599": 0 } },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const body = await bodyUpTo(response, 16 * 1024, { signal });
    const { current, hourly, daily } = JSON.parse(body);
    const time = current?.time;
    const temperature = current?.temperature_2m;
    const code = current?.weather_code;
    const age = Date.now() / 1000 - time;
    if (!Number.isFinite(time) || age < -900 || age > 2700 ||
        !Number.isFinite(temperature) || !Number.isInteger(code) || ![0, 1].includes(current.is_day)) return null;

    const now = Math.max(time, Date.now() / 1000);
    const today = daily?.time?.findLastIndex(at => at <= now);
    const upcoming = [];
    for (const [index, at] of (hourly?.time || []).entries()) {
      const value = hourly.temperature_2m?.[index];
      if (Number.isFinite(at) && at > now && Number.isFinite(value)) upcoming.push({ time: at, temperature: value });
      if (upcoming.length === 2) break;
    }
    return {
      temperature,
      code,
      day: current.is_day === 1,
      windy: current.wind_speed_10m >= 30 || current.wind_gusts_10m >= 45,
      high: daily?.temperature_2m_max?.[today] ?? null,
      low: daily?.temperature_2m_min?.[today] ?? null,
      upcoming,
    };
  } catch {
    return null;
  }
}
