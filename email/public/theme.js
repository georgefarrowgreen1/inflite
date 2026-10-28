// The account's appearance, Light or Dark as chosen (app.js lookOf remembers it in this browser), set as the page is
// read, before it's first drawn, and the browser's bar with it, as the site's other apps do. (Automatic needs nothing:
// the stylesheet follows the device.)
try {
  const t = localStorage.getItem("mail:appearance");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", t === "dark" ? "#1b2860" : "#dde3fb");
  }
} catch (_) {}
