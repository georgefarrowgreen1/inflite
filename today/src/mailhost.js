// Mail in InFlite's window (Today First, spec §9.4): /mail/ is a small page of this site's that frames Mail at its own
// address (email.inflite.ai), so untrusted mail never shares an origin with Chat's key. For the site's admin (Apps shows
// its tile to no one else; Mail itself, in the frame, lets no one else in).
//   mailPage(request, env) → the host page: Back to Apps, Open Mail on Its Own, and the frame
//   /mail      → 301 to /mail/
//   /mail/     → the page, built here (never from the assets, which a Worker answer doesn't go through: its headers are
//                its own, below); the frame's address is set by its script, today/public/mailhost.js, which reads
//                Mail's and the sign-in page's addresses from the page (data-mail, data-auth) and a code coming back from
//                signing in from this page's own #signin= (an address's # never reaches a server)
//   /mail/host.css → the page's look (its rules let in no style but this site's own files)
// Anything else under /mail/ is not found; only GET and HEAD.

// (an app's address as wrangler.toml gives it: a scheme, a host, perhaps a port, and nothing else)
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;
const originOf = (v) => (typeof v === "string" && ORIGIN.test(v) ? v.toLowerCase() : null);
const attr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// (as today/src/index.js's own answers: never kept, never sniffed, never framed, never read by another site)
const SAFE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
};
const said = (status, words, extra = {}) => new Response(words, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...SAFE, ...extra } });

// The page's own rules: its own scripts and styles only, Mail's address the one thing it frames, framed by nothing
// itself; and as a page of the hub, never indexed, never kept but checked again each time
export function pageHeaders(mail) {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'self'; script-src 'self'; style-src 'self'; frame-src ${mail}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex",
    "Cache-Control": "no-cache, private",
  };
}

const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 4.5 7.5 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const OUT = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// The host page. The frame has no address of its own here: its script gives it Mail's (with the code coming back from
// signing in, if there's one), so Mail is loaded once
export function hostPage(mail, auth) {
  return `<!doctype html>
<html lang="en-GB" data-mail="${attr(mail)}" data-auth="${attr(auth)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#dde3fb" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#1b2860" media="(prefers-color-scheme: dark)">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="InFlite">
  <meta name="format-detection" content="telephone=no">
  <title>Mail</title>
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icon-180.png">
  <script src="/theme.js"></script>
  <link rel="stylesheet" href="/mail/host.css">
  <script src="/mailhost.js"></script>
</head>
<body>
  <header class="mh-bar">
    <button type="button" class="mh-back" aria-label="Back to Apps">${CHEVRON}<span>Apps</span></button>
    <h1 class="mh-t">Mail</h1>
    <a class="mh-own" href="${attr(mail)}/" target="_blank" rel="noopener">Open Mail on Its Own${OUT}</a>
  </header>
  <iframe class="mh-frame" name="ifl-mail" title="Mail" allow="clipboard-write; web-share"></iframe>
</body>
</html>
`;
}

// The page's look: a bar across the top under the status bar (Back to Apps; Mail; Open Mail on Its Own), the frame
// filling the rest down to the Home indicator, in Today's colours, light or dark as Today is (theme.js's data-theme, else
// the device). And the hub's cross-fade between pages, asked for here as menu.css asks it of the apps' pages, so going
// from Apps to Mail and back fades as every page of the hub does
export const HOST_CSS = `@view-transition { navigation: auto; }
:root { color-scheme: light dark; --mh-bg: #dde3fb; --mh-ink: #11131c; --mh-ink-2: rgba(60, 60, 67, 0.62); --mh-tint: #0f7f6e; --mh-panel: rgba(255, 255, 255, 0.9);
  --mh-line: rgba(60, 60, 67, 0.14); --mh-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --mh-bg: #1b2860; --mh-ink: #f4f5fa; --mh-ink-2: rgba(235, 235, 245, 0.62); --mh-tint: #5fe0c9; --mh-panel: rgba(56, 58, 74, 0.72); --mh-line: rgba(235, 235, 245, 0.12); }
}
:root[data-theme="dark"] { color-scheme: dark; --mh-bg: #1b2860; --mh-ink: #f4f5fa; --mh-ink-2: rgba(235, 235, 245, 0.62); --mh-tint: #5fe0c9; --mh-panel: rgba(56, 58, 74, 0.72); --mh-line: rgba(235, 235, 245, 0.12); }
:root[data-theme="light"] { color-scheme: light; }
html { height: 100%; touch-action: pan-x pan-y; -webkit-text-size-adjust: 100%; }
*, *::before, *::after { box-sizing: border-box; }
body { display: flex; flex-direction: column; height: 100%; margin: 0; overflow: hidden; background: var(--mh-bg); color: var(--mh-ink); font: 16px/1.25 var(--mh-font); -webkit-font-smoothing: antialiased; }
.mh-bar { flex: none; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px; min-height: 52px;
  padding: calc(env(safe-area-inset-top, 0px) + 4px) max(12px, env(safe-area-inset-right, 0px)) 4px max(12px, env(safe-area-inset-left, 0px)); }
.mh-back, .mh-own { display: inline-flex; align-items: center; gap: 2px; min-height: 44px; margin: 0; border: 0; border-radius: 999px; font: 600 16px/1 var(--mh-font);
  color: var(--mh-tint); cursor: pointer; text-decoration: none; -webkit-tap-highlight-color: transparent; transition: transform 0.2s; }
.mh-back { justify-self: start; padding: 0 14px 0 8px; background: var(--mh-panel); box-shadow: 0 0 0 0.5px var(--mh-line), 0 6px 14px -8px rgba(20, 30, 70, 0.35); }
.mh-own { justify-self: end; gap: 5px; padding: 0 4px; font-size: 15px; text-align: right; }
.mh-back svg { width: 20px; height: 20px; }
.mh-own svg { flex: none; width: 17px; height: 17px; }
.mh-back:active, .mh-own:active { transform: scale(0.94); }
.mh-back:focus-visible, .mh-own:focus-visible { outline: 2px solid var(--mh-tint); outline-offset: 2px; }
.mh-t { margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -0.2px; }
.mh-frame { display: block; flex: 1 1 auto; width: 100%; min-height: 0; margin: 0 0 env(safe-area-inset-bottom, 0px); border: 0; background: transparent; color-scheme: normal; }
@media (max-width: 359px) { .mh-t { display: none; } .mh-bar { grid-template-columns: auto minmax(0, 1fr); } .mh-own { font-size: 14px; } }
@media (prefers-reduced-motion: reduce) { .mh-back, .mh-own { transition: none; } }
`;
// (a short fingerprint of the look, for If-None-Match: it changes only with a deploy)
const TAG = `"mh-${[...HOST_CSS].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(36)}"`;

export async function mailPage(request, env) {
  const url = new URL(request.url), method = request.method;
  const known = url.pathname === "/mail" || url.pathname === "/mail/" || url.pathname === "/mail/host.css";
  if (!known) return said(404, "Not found.");
  if (method !== "GET" && method !== "HEAD") return said(405, "Mail’s page doesn’t do that.", { Allow: "GET, HEAD" });
  if (url.pathname === "/mail") return new Response(null, { status: 301, headers: { Location: "/mail/" + url.search, ...SAFE } });
  if (url.pathname === "/mail/host.css") {
    const headers = { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-cache", ETag: TAG, "X-Content-Type-Options": "nosniff" };
    if ((request.headers.get("If-None-Match") || "").split(/\s*,\s*/).includes(TAG)) return new Response(null, { status: 304, headers });
    return new Response(method === "HEAD" ? null : HOST_CSS, { headers });
  }
  const mail = originOf(env.MAIL_ORIGIN), auth = originOf(env.AUTH_ORIGIN);
  if (!mail || !auth) return said(503, "Mail isn’t ready here yet.");
  return new Response(method === "HEAD" ? null : hostPage(mail, auth), { headers: pageHeaders(mail) });
}
