// The account's appearance, Light or Dark as chosen (app.js keeps it in this browser), set as the page is read, before
// it's first drawn, and the browser's bar with it, as the other apps do. (Automatic needs nothing: the stylesheet
// follows the device.) And neither the way in nor your day is shown until app.js knows which it is (html.boot), so
// one never flashes before the other; whatever happens, both may show after 4 seconds.
try {
  const t = localStorage.getItem("today:appearance");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", t === "dark" ? "#1b2860" : "#dde3fb");
  }
} catch (_) {}
document.documentElement.classList.add("boot");
setTimeout(() => document.documentElement.classList.remove("boot"), 4000);
