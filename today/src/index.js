// InFlite Today, at inflite.ai: its page and files come from today/public (the assets); only /api/* and /version run
// this Worker. It keeps nothing of its own: every /api/* request is checked here, then passed on with the account's
// cookie to account.inflite.ai/api/account/today/* (the georgefarrowgreen repo's functions/_todayapp.js), and its answer
// passed back. /version says which Today is deployed, for InFlite's updater (IFL.updates) and the account's About sheet.
// And InFlite as one window (Today First): Chats, Weather, Fitness and Markets as pages of this site (/chats/,
// /weather/, /fitness/, /markets/: the hub, today/src/hub.js), and Mail in a frame at /mail/ (today/src/mailhost.js);
// wrangler.toml sends those paths here before the assets.
import { ask, setCookies } from "./account.js";
import { isHubPath, hub } from "./hub.js";
import { mailPage } from "./mailhost.js";

// Today's API, each route as the account has it: its path there, how long it's waited for, and whether the account's
// Set-Cookie comes back with it (signing in, its renewal, signing out: never anywhere else)
const ROUTES = {
  "GET /api/session": { path: "today/me", timeout: 8000, cookies: true, view: true },
  "POST /api/auth/handback": { path: "today/handback", timeout: 8000, cookies: true, view: true },
  "POST /api/logout": { path: "today/signout", timeout: 8000, cookies: true },
  "GET /api/today": { path: "today/cards", timeout: 12000 },
  "PUT /api/prefs": { path: "today/prefs", timeout: 8000 },
  "GET /api/morning": { path: "today/morning", timeout: 12000 },
  "PUT /api/morning": { path: "today/morning", timeout: 12000 },
  "POST /api/morning/try": { path: "today/morning/try", timeout: 15000 },
  "GET /api/push/key": { path: "today/push-key", timeout: 8000 },
  "POST /api/push": { path: "today/push", timeout: 8000 },
  "POST /api/push/move": { path: "today/push-move", timeout: 8000 },
  "DELETE /api/push": { path: "today/push", timeout: 8000 },
  "POST /api/account-link": { path: "today/account-link", timeout: 8000 },
  "GET /api/avatar": { path: "today/avatar", timeout: 8000, image: true },
  // (Today First's: acts and their Undo, the rules they're done by, notifications and devices, from You)
  "POST /api/act": { path: "today/act", timeout: 8000 },
  "POST /api/act/undo": { path: "today/act/undo", timeout: 8000 },
  // (today's session rested or moved to tomorrow from Today's Fitness card, in Fitness's own plan)
  "POST /api/plan": { path: "today/plan", timeout: 8000 },
  "GET /api/rules": { path: "today/rules", timeout: 8000 },
  "PUT /api/rules": { path: "today/rules", timeout: 8000 },
  "GET /api/notify": { path: "today/notify", timeout: 8000 },
  "PATCH /api/notify": { path: "today/notify", timeout: 8000 },
  "POST /api/device": { path: "today/device", timeout: 8000 },
  "DELETE /api/device": { path: "today/device", timeout: 8000 },
  "GET /api/devices": { path: "today/devices", timeout: 8000 },
  "DELETE /api/devices": { path: "today/devices", timeout: 8000 },
};
const PATHS = new Set(Object.keys(ROUTES).map((k) => k.split(" ")[1]));
// (the only parts of an address passed on: never a push endpoint, which goes only in a body, as an address ends up in logs)
const QUERY = ["only", "with", "device", "id", "v"];
const MAX_BODY = 64 * 1024;

const SAID = {
  notToday: "That request didn’t come from Today.",
  header: "Missing request header",
  down: "Couldn’t reach your InFlite account. Try again in a moment.",
  wrong: "Something went wrong. Try again.",
};

// what every answer of the API carries: never kept, never sniffed as anything but what it says, never framed, never
// read by another site
const SAFE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...SAFE } });
const refuse = (status, error) => json({ error }, status);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/version" && request.method === "GET") return version(env, request);
    const hubbed = isHubPath(url.pathname), mail = url.pathname === "/mail" || url.pathname.startsWith("/mail/");
    if (!hubbed && !mail && !url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      if (hubbed) return await hub(request, env, ctx);
      if (mail) return await mailPage(request, env);
      if (url.pathname === "/api/bugs") return await bugReport(request, env);
      if (url.pathname === "/api/status-banner") return await statusBanner(request, env, url);
      return await api(request, env, url);
    } catch (err) {
      console.error(err);
      // (words only: never what went wrong inside)
      return refuse(500, SAID.wrong);
    }
  },
};

// A bug report, from the window the shared menu shows when something breaks here (Today, or a section of the hub): passed
// on to the account's address, where every app's are kept (the georgefarrowgreen repo's functions/_bugs.js). From this
// site's own pages only, a few kilobytes at most.
// (status.inflite.ai's banner for the app open here, as the shared menu asks for it: the account's address answers,
// the georgefarrowgreen repo's functions/_status.js; none where it can't be asked)
async function statusBanner(request, env, url) {
  if (request.method !== "GET") return refuse(405, "Today doesn’t do that.");
  const query = new URLSearchParams({ app: String(url.searchParams.get("app") || "hub").replace(/[^a-z]/g, "").slice(0, 20) || "hub" });
  const res = await ask(env, request, { path: "status-banner", query, timeout: 5000 });
  const ok = res && res.ok;
  return new Response(ok ? res.body : JSON.stringify({ banner: null }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SAFE } });
}

async function bugReport(request, env) {
  if (request.method !== "POST") return refuse(405, "Today doesn’t do that.");
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin") return refuse(403, SAID.notToday);
  const body = await request.text();
  if (body.length > 12000) return refuse(413, "That’s too much to send.");
  const res = await ask(env, request, { method: "POST", path: "bugs", body, timeout: 8000 });
  if (!res) return refuse(502, "The report couldn’t be sent just now.");
  return new Response(res.body, { status: res.status, headers: { "Content-Type": "application/json; charset=utf-8", ...SAFE } });
}

async function api(request, env, url) {
  const method = request.method, read = method === "GET" || method === "HEAD";

  // Same-site pages elsewhere on inflite.ai carry the account's cookie too, so only Today's own pages are answered: a
  // GET from its own page, or one typed or opened from the Home Screen (none); anything else only from its own page.
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && !(site === "same-origin" || (read && site === "none"))) return refuse(403, SAID.notToday);
  if (!read) {
    // (a custom header, which a browser won't send to another site without asking it first: CSRF protection, as Mail's)
    if (request.headers.get("X-Inflite") !== "1") return refuse(403, SAID.header);
    if (request.headers.get("Origin") !== url.origin) return refuse(403, SAID.notToday);
  }

  const route = ROUTES[`${method} ${url.pathname}`];
  if (!route) return PATHS.has(url.pathname) ? refuse(405, "Today doesn’t do that.") : refuse(404, "Not found.");

  let body = null;
  if (!read) {
    if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY) return refuse(413, "That’s too much to send.");
    body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_BODY) return refuse(413, "That’s too much to send.");
    if (!body) body = "{}";
  }
  const query = new URLSearchParams();
  for (const k of QUERY) for (const v of url.searchParams.getAll(k)) query.append(k, v);

  // (tests only: the moment of the day to work it out at, passed on where this Worker's TEST_AT says so, never in production)
  const at = env.TEST_AT === "1" ? request.headers.get("X-Today-At") : null;
  const headers = at && /^\d{13}$/.test(at) ? { "X-Today-At": at } : null;
  const res = await ask(env, request, { method, path: route.path, query, body, timeout: route.timeout, accept: route.image ? "image/*" : "application/json", headers });
  if (route.image) return picture(res);
  if (!res || (res.status >= 300 && res.status < 400)) return refuse(502, SAID.down);

  let data;
  try {
    data = JSON.parse(await res.text());
  } catch {
    // (not the account's answer at all: a host's error page, say)
    return refuse(502, SAID.down);
  }
  let out;
  if (res.status >= 400) {
    // (the account's own words for what's wrong, and which field, as they are; nothing else of its answer)
    out = json({ error: typeof data?.error === "string" ? data.error : SAID.wrong, ...(typeof data?.field === "string" ? { field: data.field } : {}) }, res.status);
  } else {
    if (route.view && data && typeof data === "object" && !Array.isArray(data)) data = { ...data, accountOrigin: env.ACCOUNT_ORIGIN };
    out = json(data, res.status);
  }
  if (route.cookies) for (const c of setCookies(res)) out.headers.append("Set-Cookie", c);
  return out;
}

// A picture (a friend's, or your own for the header), from the account with your sign-in, served from Today's own
// address: kept for good by the browser under its ?v= (when it last changed). Anything but a picture: none.
function picture(res) {
  const type = res?.headers.get("Content-Type") || "";
  if (!res?.ok || !/^image\//i.test(type)) return refuse(404, "No picture.");
  return new Response(res.body, {
    headers: { "Content-Type": type, ...SAFE, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}

// Which Today is deployed: the build number in its app.js (BUILD), read once per deployment of this Worker, so a page
// running older code (a copy kept by the phone, say) can tell it's behind
let buildKept = null;
async function appBuild(env, request) {
  const key = env.BUILD_ID || env.CF_VERSION_METADATA?.id || "dev";
  if (buildKept?.key === key) return buildKept.build;
  try {
    const r = await env.ASSETS.fetch(new Request(new URL("/app.js", request.url)));
    const m = r.ok && /const BUILD = "([\d.]+)"/.exec(await r.text());
    buildKept = { key, build: m ? m[1] : null };
    return buildKept.build;
  } catch {
    return null;
  }
}
async function version(env, request) {
  return json({ build: await appBuild(env, request), min: null });
}
