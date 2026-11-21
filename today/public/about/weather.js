const london = { timeZone: "Europe/London" };
const date = new Intl.DateTimeFormat("en-GB", { ...london, weekday: "long", day: "numeric", month: "long" });
const clock = new Intl.DateTimeFormat("en-GB", { ...london, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const degrees = value => Math.round(value) + "°";

// Open-Meteo's WMO weather codes. Wind is a separate layer so it can also
// be shown during rain, snow or sunshine.
const conditions = new Map([
  [0, ["clear", "Sunny", "Clear skies"]],
  [1, ["partly", "Mostly sunny", "Mostly clear"]],
  [2, ["partly", "Partly cloudy"]],
  [3, ["cloud", "Overcast"]],
  [45, ["cloud", "Fog"]], [48, ["cloud", "Freezing fog"]],
  [51, ["rain", "Light drizzle"]], [53, ["rain", "Drizzle"]], [55, ["rain", "Heavy drizzle"]],
  [56, ["rain", "Freezing drizzle"]], [57, ["rain", "Freezing drizzle"]],
  [61, ["rain", "Light rain"]], [63, ["rain", "Rain"]], [65, ["rain", "Heavy rain"]],
  [66, ["rain", "Freezing rain"]], [67, ["rain", "Freezing rain"]],
  [71, ["snow", "Light snow"]], [73, ["snow", "Snow"]], [75, ["snow", "Heavy snow"]],
  [77, ["snow", "Snow grains"]],
  [80, ["rain", "Light showers"]], [81, ["rain", "Rain showers"]], [82, ["rain", "Heavy showers"]],
  [85, ["snow", "Snow showers"]], [86, ["snow", "Heavy snow showers"]],
  [95, ["rain", "Thunderstorms"]], [96, ["rain", "Thunderstorms with hail"]], [99, ["rain", "Thunderstorms with hail"]],
]);

const preview = document.querySelector(".product-preview");
const template = document.querySelector("#preview-weather-sky");
const cards = Array.from(preview.querySelectorAll(".preview-weather-card"), card => {
  const sky = template.content.firstElementChild.cloneNode(true);
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
  const [sky, dayLabel, nightLabel] = condition || [];
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
    if (condition) card.sky.dataset.sky = sky;
    else delete card.sky.dataset.sky;
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
async function refreshWeather() {
  if (document.hidden || inFlight || Date.now() - requestedAt < refreshEvery) return;
  inFlight = true;
  requestedAt = Date.now();
  showLondonTime();
  try {
    const response = await fetch("/api/about/weather", {
      credentials: "omit", signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error("Weather request failed");
    const weather = await response.json();
    if (!Number.isFinite(weather?.temperature) || !Array.isArray(weather.upcoming)) throw new Error("Invalid forecast");
    renderWeather(weather);
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
