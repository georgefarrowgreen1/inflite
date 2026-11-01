// Today's service worker: for the morning notification, and a copy of Today's own files for when there's no network
// (below). Today still always loads fresh: never any of your day kept here (the page keeps its own copy, per account,
// and forgets it when you sign out).

// ---- Today's own files, kept for when there's no network ----
// Always from the network while there is one, each kept as it comes; only with no answer at all (or Today's host
// failing) from what was kept last. So Today opens on a train, with the copy of your day the page kept. Only these
// files: never the API.
const SHELL = "today-app-1";
const FILES = ["/", "/app.js", "/cards.js", "/wxicons.js", "/app.css", "/theme.js", "/manifest.webmanifest", "/icon.svg", "/inflite.svg", "/icon-180.png", "/icon-192.png", "/apps/chat.svg", "/apps/weather.svg", "/apps/fitness.svg", "/apps/markets.svg"];
self.addEventListener("install", (e) => {
  self.skipWaiting();
  // (not waited on long: a worker that takes over late holds the updater up)
  e.waitUntil(Promise.race([caches.open(SHELL).then((c) => c.addAll(FILES)).catch(() => {}), new Promise((ok) => setTimeout(ok, 8000))]));
});
// (the updater every app shares, about to load a new version: Today's files are fetched afresh by the page itself, past
// the browser's copy, through here and kept as they come, so there's nothing more for this worker to do: IFL.updates)
self.addEventListener("message", (e) => { if (e.data?.ifl === "renew") e.ports[0]?.postMessage({ ifl: "renewed" }); });
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
  // (Today's one page, at /: any other address is the 404 page, from the network)
  const key = r.mode === "navigate" ? (u.pathname === "/" || u.pathname === "/index.html" ? "/" : null) : FILES.includes(u.pathname) && !u.search ? u.pathname : null;
  if (key) e.respondWith(fresh(e, key));
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

// The browser renewed this device's subscription: the new one kept in its place, so the morning carries on without
// Today being opened first
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
      // (the old one's place moved to the new, where the account has it; else the new one added)
      const was = e.oldSubscription?.endpoint;
      if (was && was !== sub.endpoint) {
        const moved = await post("/api/push/move", { sub: sub.toJSON(), was }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (moved?.moved) return;
      }
      await post("/api/push", { sub: sub.toJSON() });
    })().catch(() => {})
  );
});

// Whether this device is still signed in to the account (Today's own check: /api/session), as a notification comes:
// false once it's been signed out, here or from elsewhere; null when it can't be told (no answer, or none within a few
// seconds: a notification that's slow to show counts as one never shown, and the phone stops them for a site that keeps
// doing that), as a notification is never held back for that
async function stillSignedIn() {
  const ask = (async () => {
    const r = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) return null;
    const v = await r.json();
    return v?.signedIn === true ? true : v?.signedIn === false ? false : null;
  })().catch(() => null);
  return Promise.race([ask, new Promise((ok) => setTimeout(() => ok(null), 5000))]);
}

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data?.text() };
  }
  e.waitUntil(notify(d));
});

async function notify(d) {
  // (signed out: nothing of the day said, notifications stopped here (the push service then tells the account this
  // device has gone, and it forgets it), any open Today told to forget the day it kept, and this last one says why)
  if ((await stillSignedIn()) === false) {
    await self.registration.pushManager.getSubscription().then((s) => s?.unsubscribe()).catch(() => {});
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true }).catch(() => []);
    for (const w of wins) if (new URL(w.url).origin === self.location.origin) w.postMessage({ ifl: "signedout" });
    return self.registration.showNotification("Today", { body: "Signed out on this device, so notifications have stopped here.", tag: "signed-out", icon: "/icon-192.png", badge: "/icon-192.png", data: { url: "/" } });
  }
  return self.registration.showNotification(d.title || "Today", {
    body: d.body || "",
    tag: d.tag || undefined,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: d.url || "/" },
  });
}

// A notification tapped: Today, at what it's about (the open window if there is one); only ever Today's own pages
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let url;
  try {
    url = new URL(e.notification.data?.url || "/", self.location.origin);
  } catch {
    url = new URL("/", self.location.origin);
  }
  if (url.origin !== self.location.origin) url = new URL("/", self.location.origin);
  e.waitUntil(openToday(url.href));
});

async function openToday(url) {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
  if (win) {
    await win.focus();
    win.postMessage({ open: url });
    return;
  }
  await self.clients.openWindow(url);
}
