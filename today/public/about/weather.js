import { weatherIcon, glyph } from "../wxicons.js";
import { londonForecast, londonConditions } from "./weather-data.js";

const london = { timeZone: "Europe/London" };
const date = new Intl.DateTimeFormat("en-GB", { ...london, weekday: "long", day: "numeric", month: "long" });
const clock = new Intl.DateTimeFormat("en-GB", { ...london, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const degrees = value => Math.round(value) + "°";

// Open-Meteo's WMO weather codes. Wind is a separate layer so it can also
// be shown during rain, snow or sunshine.
const conditions = new Map([
  [0, ["sun", "Sunny", "moon", "Clear skies"]],
  [1, ["mostly-sun", "Mostly sunny", "mostly-moon", "Mostly clear"]],
  [2, ["partly-sun", "Partly cloudy", "partly-moon"]],
  [3, ["cloud", "Overcast"]],
  [45, ["fog", "Fog"]], [48, ["fog", "Freezing fog"]],
  [51, ["drizzle", "Light drizzle"]], [53, ["drizzle", "Drizzle"]], [55, ["drizzle", "Heavy drizzle"]],
  [56, ["sleet", "Freezing drizzle"]], [57, ["sleet", "Freezing drizzle"]],
  [61, ["rain", "Light rain"]], [63, ["rain", "Rain"]], [65, ["heavy-rain", "Heavy rain"]],
  [66, ["sleet", "Freezing rain"]], [67, ["sleet", "Freezing rain"]],
  [71, ["snow", "Light snow"]], [73, ["snow", "Snow"]], [75, ["snow", "Heavy snow"]],
  [77, ["snow", "Snow grains"]],
  [80, ["showers-sun", "Light showers", "showers-moon"]], [81, ["showers-sun", "Rain showers", "showers-moon"]],
  [82, ["showers-sun", "Heavy showers", "showers-moon"]],
  [85, ["snow", "Snow showers"]], [86, ["snow", "Heavy snow showers"]],
  [95, ["storm", "Thunderstorms"]], [96, ["storm", "Thunderstorms with hail"]], [99, ["storm", "Thunderstorms with hail"]],
]);

const preview = document.querySelector(".product-preview");
const windArtwork = glyph("wind", 26, "preview-weather-wind");
const cards = Array.from(preview.querySelectorAll(".preview-weather-card"), card => {
  const sky = document.createElement("span");
  sky.className = "preview-weather-sky";
  sky.setAttribute("aria-hidden", "true");
  card.append(sky);
  return {
    sky,
    icon: card.querySelector(".preview-feature-icon"),
    temperature: card.querySelector("[data-weather-temperature]"),
    condition: card.querySelector("[data-weather-condition]"),
    range: card.querySelector("[data-weather-range]"),
  };
});
const hours = preview.querySelector("[data-weather-hours]");
const story = document.querySelector("[data-story-weather]");

function showLondonTime() {
  const now = Date.now();
  for (const label of preview.querySelectorAll("[data-london-date]")) label.textContent = " · " + date.format(now);
  const hour = Number(clock.format(now).slice(0, 2));
  preview.querySelector("[data-london-greeting]").textContent =
    hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
}

function renderWeather(weather, status = "Weather unavailable") {
  const condition = weather && conditions.get(weather.code);
  const [dayIcon, dayLabel, nightIcon, nightLabel] = condition || [];
  const icon = weather?.day === false ? nightIcon || dayIcon : dayIcon;
  const description = condition ? (weather.day ? dayLabel : nightLabel || dayLabel) : weather ? "Current weather" : status;
  const label = description + (weather?.windy ? " · Windy" : "");
  const temperature = weather ? degrees(weather.temperature) : "";
  const hasRange = Number.isFinite(weather?.high) && Number.isFinite(weather?.low);
  const range = hasRange ? `High ${degrees(weather.high)} · Low ${degrees(weather.low)}` : "";
  for (const card of cards) {
    card.temperature.textContent = temperature;
    card.temperature.hidden = !weather;
    card.condition.textContent = label;
    card.range.textContent = range;
    card.range.hidden = !hasRange;
    card.icon.hidden = !!condition;
    if (icon && card.sky.dataset.sky !== icon) {
      card.sky.innerHTML = weatherIcon(icon, 112) + windArtwork;
      card.sky.dataset.sky = icon;
    } else if (!icon) {
      delete card.sky.dataset.sky;
    }
    card.sky.toggleAttribute("data-night", weather?.day === false);
    card.sky.toggleAttribute("data-windy", !!weather?.windy);
  }
  hours.hidden = !weather;
  hours.firstElementChild.querySelector("dd").textContent = temperature;
  Array.from(hours.children).slice(1).forEach((row, index) => {
    const point = weather?.upcoming[index];
    row.hidden = !point;
    if (!point) return;
    row.querySelector("dt").textContent = clock.format(point.time * 1000);
    row.querySelector("dd").textContent = degrees(point.temperature);
  });
  story.textContent = weather ? `${temperature} · ${description}` : status;
}

const refreshEvery = 10 * 60 * 1000;
let requestedAt = 0;
let inFlight = false;
async function readForecast() {
  const request = { credentials: "omit", referrerPolicy: "no-referrer" };
  try {
    const response = await fetch("/api/about/weather", { ...request, signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      const weather = await response.json();
      if (Number.isFinite(weather?.temperature) && Array.isArray(weather.upcoming)) return weather;
    }
  } catch {}
  // The Weather app already uses Open-Meteo directly. Use the same fixed
  // London query if the edge endpoint cannot connect to it.
  const response = await fetch(londonForecast, { ...request, signal: AbortSignal.timeout(5000) });
  return response.ok ? londonConditions(await response.json()) : null;
}

async function refreshWeather() {
  if (document.hidden || inFlight || Date.now() - requestedAt < refreshEvery) return;
  inFlight = true;
  requestedAt = Date.now();
  showLondonTime();
  try {
    renderWeather(await readForecast());
  } catch {
    renderWeather(null);
  } finally {
    inFlight = false;
  }
}

if ("IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => {
    preview.toggleAttribute("data-weather-in-view", entry.isIntersecting);
  }).observe(preview);
} else {
  preview.dataset.weatherInView = "";
}
renderWeather(null, "Checking London weather…");
refreshWeather();
setInterval(refreshWeather, refreshEvery);
document.addEventListener("visibilitychange", refreshWeather);
window.addEventListener("online", () => {
  requestedAt = 0;
  refreshWeather();
});
