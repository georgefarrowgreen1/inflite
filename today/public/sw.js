// InFlite's root service worker (scope /, spec §11.4): this phone's one push subscription for InFlite, every app's
// notifications shown here and tapped open in the one window, the Home Screen icon's badge, Chat's delivered tick, and a
// copy of Today's own files for when there's no network (below). Today still always loads fresh: never any of your day
// kept here (the page keeps its own copy, per account, and forgets it when you sign out). Chats and the apps beside it
// (/chats/, /fitness/, …) have workers of their own, for their own files only: none of them holds a subscription. Weather is
// a module of Today's page now (One roof, spec §8.2, D10): its page at /weather/ is Today's, and its module's files are
// kept here when the page asks, so it opens offline too.

// ---- Today's own files, kept for when there's no network ----
// Always from the network while there is one, each kept as it comes; only with no answer at all (or Today's host
// failing) from what was kept last. So Today opens on a train, with the copy of your day the page kept. Only these
// files: never the API, nor any page or file of Chats' or the apps'.
const SHELL = "today-app-3";
const FILES = ["/", "/app.js", "/cards.js", "/day.js", "/apps.js", "/you.js", "/wxicons.js", "/app.css", "/day.css", "/theme.js", "/fade.js", "/mailhost.js", "/manifest.webmanifest", "/icon.svg", "/inflite.svg", "/icon-180.png", "/icon-192.png", "/apps/chat.svg", "/apps/weather.svg", "/apps/fitness.svg", "/apps/markets.svg",
  "/roof/frame.js", "/roof/router.js", "/roof/header.js", "/roof/tabs.js", "/roof/sheet.js", "/roof/toast.js", "/roof/ui.js", "/roof/search.js", "/roof/send.js", "/roof/modules.js", "/roof/connectors.js", "/roof/roof.css"];
self.addEventListener("install", (e) => {
  self.skipWaiting();
  // (each kept as it comes, so one that isn't there doesn't keep the rest out; not waited on long: a worker that takes
  // over late holds the updater up)
  e.waitUntil(Promise.race([caches.open(SHELL).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => {})))).catch(() => {}), new Promise((ok) => setTimeout(ok, 8000))]));
});
// (the updater every app shares, about to load a new version: Today's files are fetched afresh by the page itself, past
// the browser's copy, through here and kept as they come, so there's nothing more for this worker to do: IFL.updates.
// A page of the hub opened, or back in sight: the badge counted again, IFL.hub)
self.addEventListener("message", (e) => {
  if (e.data?.ifl === "renew") e.ports[0]?.postMessage({ ifl: "renewed" });
  else if (e.data?.ifl === "badge") e.waitUntil?.(badge());
  else if (e.data?.ifl === "keep" && e.source && sameOrigin(e.source.url)) e.waitUntil?.(keep(e.data));
});
self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("today-app-") && k !== SHELL) await caches.delete(k);
      await self.clients.claim();
    })()
  )
);
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin || u.pathname.startsWith("/api/")) return;
  if (r.mode === "navigate") {
    // (Today's one page, at /; the same page at /weather/, from the network, else the copy of / (never kept as /: what
    // the hub sends for /weather/ may be Weather's milestone-1 page, with the roof off); any other address is the 404
    // page, or a page of the hub's, from the network)
    if (u.pathname === "/" || u.pathname === "/index.html") e.respondWith(fresh(e, "/"));
    else if (ROOF_DOCS.includes(u.pathname)) e.respondWith(roofDoc(e));
    return;
  }
  if (FILES.includes(u.pathname) && !u.search) e.respondWith(fresh(e, u.pathname));
  else if (moduleFile(u)) e.respondWith(fromModule(e, u));
});
async function fresh(e, key) {
  const kept = () => caches.open(SHELL).then((c) => c.match(key)).catch(() => null);
  let res;
  try {
    res = await fetch(e.request);
  } catch (err) {
    const k = await kept();
    if (k) return k;
    throw err;
  }
  if (res.ok && res.type === "basic") {
    const copy = res.clone();
    const keep = caches.open(SHELL).then((c) => c.put(key, copy)).catch(() => {});
    // (waited for where the browser lets a fetch's event be, this late; where it won't, it's kept all the same)
    try {
      e.waitUntil(keep);
    } catch {}
  } else if (res.status >= 500) return (await kept()) || res;
  return res;
}

// ---- Weather's module (One roof, spec §8.2): its page at /weather/, and its files kept when the page asks ----
const ROOF_DOCS = ["/weather/", "/weather/index.html"];
async function roofDoc(e) {
  const kept = () => caches.open(SHELL).then((c) => c.match("/")).catch(() => null);
  let res;
  try {
    res = await fetch(e.request);
  } catch (err) {
    const k = await kept();
    if (k) return k;
    throw err;
  }
  return res.status >= 500 ? (await kept()) || res : res;
}
// The module's files, as the page names them ({ ifl: "keep", app, build, files }, modules.js keepOffline, once a build):
// for an app that is a module, a build as the apps number them, and at most 60 of that app's own files at plain paths
// (no query, no vendor/, never its worker or version). Kept all or nothing, in roof-<app>-<build>: each one fetched afresh
// and answered whole by this site, or that cache is let go and the one before kept; once it's whole, the app's other
// builds' are let go.
const KEEP_APPS = ["weather"], KEEP_MAX = 60;
const keeping = new Map();
function keepList(d) {
  if (!d || !KEEP_APPS.includes(d.app) || typeof d.build !== "string" || !/^\d+\.\d{2}$/.test(d.build) || !Array.isArray(d.files) || !d.files.length || d.files.length > KEEP_MAX) return null;
  const base = `/${d.app}/`, out = new Set();
  for (const f of d.files) {
    if (typeof f !== "string" || !f.startsWith(base) || !/^\/[\w./-]+$/.test(f) || /\/vendor\//.test(f) || f === base + "sw.js" || f === base + "version" || f.endsWith("/")) return null;
    let u;
    try { u = new URL(f, self.location.origin); } catch { return null; }
    if (u.origin !== self.location.origin || u.pathname !== f) return null;
    out.add(f);
  }
  return [...out];
}
function keep(d) {
  const files = keepList(d);
  if (!files) return Promise.resolve(false);
  const name = `roof-${d.app}-${d.build}`;
  if (keeping.has(name)) return keeping.get(name);
  const job = (async () => {
    try {
      const got = await Promise.all(files.map(async (f) => {
        const res = await fetch(f, { cache: "no-cache", credentials: "same-origin" });
        if (!res.ok || res.type !== "basic") throw new Error("not kept");
        return [f, res];
      }));
      const c = await caches.open(name);
      for (const [f, res] of got) await c.put(f, res);
    } catch {
      await caches.delete(name).catch(() => {});
      return false;
    }
    for (const k of await caches.keys()) if (k.startsWith(`roof-${d.app}-`) && k !== name) await caches.delete(k);
    return true;
  })().finally(() => keeping.delete(name));
  keeping.set(name, job);
  return job;
}
// (a file of Weather's at the hub, as the module loads it: from the network first, else the kept copy, where there's
// no answer or the hub's failing; a 404 (the roof off) is the hub's word and passed on)
const moduleFile = (u) => u.pathname.startsWith("/weather/") && !u.search && u.pathname !== "/weather/sw.js" && u.pathname !== "/weather/version" && !u.pathname.endsWith("/");
async function fromModule(e, u) {
  const kept = async () => {
    try {
      for (const k of await caches.keys()) if (k.startsWith("roof-weather-")) { const m = await (await caches.open(k)).match(u.pathname); if (m) return m; }
    } catch {}
    return null;
  };
  let res;
  try {
    res = await fetch(e.request);
  } catch (err) {
    const k = await kept();
    if (k) return k;
    throw err;
  }
  return res.status >= 500 ? (await kept()) || res : res;
}

// ---- notifications: every app's, here ----
// A push says which app it's from: { app, title, body, tag, url }. It's always shown (holding happens on the account,
// never by hiding one here, and a phone stops a site's pushes if they show nothing), tagged by its app (Chat's and
// Weather's tags never take each other's place), and never ends this phone's subscription: only signing out of InFlite
// does. One of Chat's: every window here told (Chat's engine on Today, Chats itself), and one pulse to Chat with this
// phone's sign-in (the one Chat keeps in IndexedDB), so the sender's tick says delivered. Then the icon's badge: how
// many are showing.
const APPS = ["chat", "weather", "fitness", "markets", "today"];
const NAME = { chat: "Chat", weather: "Weather", fitness: "Fitness", markets: "Markets", today: "Today" };
// (an older payload, with no app: Chat's by its address, else Today's)
const appOf = (d) => (APPS.includes(d.app) ? d.app : typeof d.url === "string" && d.url.includes("/pigeon/") ? "chat" : "today");
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = (e.data ? e.data.json() : {}) || {};
  } catch {
    d = { body: e.data?.text() };
  }
  if (typeof d !== "object") d = {};
  e.waitUntil(notify(d));
});
async function notify(d) {
  const app = appOf(d), url = openAt(app, d.url), tag = d.tag ? `${app}:${String(d.tag).slice(0, 120)}` : undefined;
  const jobs = [self.registration.showNotification(typeof d.title === "string" && d.title ? d.title : NAME[app], {
    body: typeof d.body === "string" ? d.body : "",
    tag,
    renotify: !!tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { app, url },
  })];
  if (app === "chat") jobs.push(chatCame(d));
  await Promise.all(jobs.map((j) => j.catch(() => {})));
  await badge();
}
// the Home Screen icon's badge: as many notifications as are showing. Counted as one comes, as one's tapped or cleared,
// and as a page of the hub opens or comes back in sight (one cleared while this worker wasn't running)
async function badge() {
  try {
    const n = (await self.registration.getNotifications()).length;
    if (self.navigator?.setAppBadge) await (n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge?.());
  } catch {}
}
// (Chat's: every window of this site's told, those no worker of this one's controls included (Chats has its own), then
// one pulse; anything going wrong is let be: an open Chat's own pulse does the same)
async function chatCame(d) {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true }).catch(() => []);
  for (const w of wins) if (sameOrigin(w.url)) w.postMessage({ inflight: "sync", tag: typeof d.tag === "string" ? d.tag : "" });
  const token = await tokenHere();
  if (token) await fetch("/api/pigeon/pulse", { method: "POST", credentials: "same-origin", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ since: Date.now() }) }).catch(() => {});
}
// the sign-in Chat keeps on this phone (pigeon/sw.js's own), or null when signed out
const tokenHere = () => new Promise((res) => {
  try {
    const r = indexedDB.open("inflight", 1);
    r.onupgradeneeded = () => { r.transaction.abort(); res(null); };   // (nothing kept here yet: not signed in)
    r.onerror = () => res(null);
    r.onsuccess = () => { try { const q = r.result.transaction("kv").objectStore("kv").get("session"); q.onsuccess = () => res(q.result?.token || null); q.onerror = () => res(null); } catch (_) { res(null); } };
  } catch (_) { res(null); }
});
const sameOrigin = (u) => { try { return new URL(u).origin === self.location.origin; } catch { return false; } };

// Where a notification opens, by its app: the app in full, at what it's about (§11.4). Its own address's path, made the
// hub's (Chat's /pigeon/#open=<id> → /chats/#open=<id>; Weather's ./?lat=… → /weather/?lat=…; Fitness's ./ →
// /fitness/#today; Markets' ./#s=TSCO → /markets/#s=TSCO, ./ → /markets/#today; Today's / → /), never another site's
const BASES = { chat: "/chats/", weather: "/weather/", fitness: "/fitness/", markets: "/markets/", today: "/" };
const HOSTS = { chat: "chat", weather: "weather", fitness: "fitness", markets: "finance" };
function openAt(app, raw) {
  const base = BASES[app] || "/", at = new URL(base, self.location.origin);
  let u;
  try { u = new URL(typeof raw === "string" && raw ? raw : base, app === "chat" || app === "today" ? self.location.origin : at); } catch { u = at; }
  // (an app's own address: its path, here)
  if (u.origin !== self.location.origin) {
    const sub = /^([a-z]+)\./.exec(u.hostname)?.[1];
    if (!/^https?:$/.test(u.protocol) || !HOSTS[app] || sub !== HOSTS[app]) return wanted(app, at);
    u = new URL(base + u.pathname.replace(/^\/(pigeon\/)?/, "") + u.search + u.hash, self.location.origin);
  }
  let path = u.pathname;
  if (app === "chat") path = path.replace(/^\/pigeon(\/|$)/, "/chats/");
  // (a path that isn't the app's: the app, at its start)
  if (app === "today" ? path !== "/" && path !== "/index.html" : !path.startsWith(base)) return wanted(app, at);
  return wanted(app, new URL(path + u.search + u.hash, self.location.origin));
}
// (Fitness and Markets opened on a section: Today, where it says none)
function wanted(app, u) {
  if ((app === "fitness" || app === "markets") && !u.hash) u.hash = "#today";
  return u.pathname + u.search + u.hash;
}

// A notification tapped: its place, in the window that's open (a page of this site's, top level: told where, and it goes
// there itself, IFL.hub's listener, which says it's heard), else, where that page has no ear for it (Today's 404 page,
// an older page) or there's none, that window sent there (one of this worker's) or a new one; only ever this site's
// pages. The badge counted again, one fewer. Cleared without a tap: counted again too
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  const app = APPS.includes(d.app) ? d.app : appOf(d);
  e.waitUntil(Promise.all([openIn(openAt(app, d.url)), badge()]));
});
self.addEventListener("notificationclose", (e) => e.waitUntil(badge()));
const HEARD = 1000;
async function openIn(path) {
  const wins = (await self.clients.matchAll({ type: "window", includeUncontrolled: true }).catch(() => [])).filter((w) => sameOrigin(w.url) && w.frameType !== "nested");
  const win = wins.find((w) => w.focused) || wins.find((w) => w.visibilityState === "visible") || wins[0];
  if (win) {
    try { await win.focus(); } catch {}
    // (a window of the framework (Today's page, at / or /weather/): told to route there in the page, One roof's
    // {ifl:"route"}; any other page of this site's: told to open it, as before)
    if (await told(win, path, FRAMEWORK.includes(pathOf(win.url)) ? "route" : "open")) return;
  }
  // (an app's page, where the hub can't serve it just now (before its key, or rolled back): Today, which sends it to the
  // app's own address, as it did before the hub)
  const url = new URL(path === "/" || path.startsWith("/#") || (await hubReady()) ? path : `/#go=${encodeURIComponent(path)}`, self.location.origin).href;
  if (win?.navigate) { try { if (await win.navigate(url)) return; } catch {} }
  await self.clients.openWindow(url);
}
const FRAMEWORK = ["/", "/index.html", "/weather/", "/weather/index.html"];
const pathOf = (u) => { try { return new URL(u).pathname; } catch { return ""; } };
// (the window told where: true once it says it's heard ({ifl:"opened"}, or {ifl:"routed"} for a route), within a second)
function told(win, url, kind = "open") {
  const heard = kind === "route" ? "routed" : "opened";
  return new Promise((ok) => {
    let ch = null;
    try { ch = new MessageChannel(); } catch {}
    if (!ch) { win.postMessage({ ifl: kind, url }); return ok(true); }
    const done = (v) => { clearTimeout(t); try { ch.port1.close(); } catch {} ok(v); };
    const t = setTimeout(() => done(false), HEARD);
    ch.port1.onmessage = (e) => { if (e.data?.ifl === heard) done(true); };
    try { win.postMessage({ ifl: kind, url }, [ch.port2]); } catch { done(false); }
  });
}
// (whether the hub's Worker can serve the apps' pages: its own word, GET /api/hub, as Today's page asks it (404 or 503:
// no); no word in two seconds, or none at all (no network), taken as yes, so the page itself is tried)
async function hubReady() {
  try {
    const r = await Promise.race([fetch("/api/hub", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } }), new Promise((ok) => setTimeout(() => ok(null), 2000))]);
    if (!r) return true;
    const j = r.ok ? await r.json().catch(() => null) : null;
    return typeof j?.ready === "boolean" ? j.ready : r.status !== 404 && r.status !== 503;
  } catch {
    return true;
  }
}

// The browser renewed this phone's subscription: the new one put in the old one's place, in every app's table that had
// it, so notifications carry on without InFlite being opened first (the account's device route; an older account side,
// Today's own as before)
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil(
    (async () => {
      const post = (path, body) =>
        fetch(path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Inflite": "1" }, body: JSON.stringify(body) });
      let sub = e.newSubscription;
      if (!sub) {
        const { key } = await (await fetch("/api/push/key", { credentials: "same-origin" })).json();
        const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4));
        sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
      }
      const was = e.oldSubscription?.endpoint;
      const body = { sub: sub.toJSON(), ...(was && was !== sub.endpoint ? { was } : {}) };
      const r = await post("/api/device", body).catch(() => null);
      if (r?.ok) return;
      if (r && r.status !== 404 && r.status !== 501) return;
      // (an account side from before the device route: Today's own move, else the new one added)
      if (body.was) {
        const moved = await post("/api/push/move", body).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (moved?.moved) return;
      }
      await post("/api/push", { sub: sub.toJSON() });
    })().catch(() => {})
  );
});
