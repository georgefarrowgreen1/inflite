// Mail's service worker: for notifications, and a copy of Mail's own files for when there's no network (below). Mail
// still always loads fresh: never any mail kept here.

// ---- Mail's own files, kept for when there's no network ----
// Always from the network while there is one (as Mail had them before this), each kept as it comes; only with no answer
// at all (or Mail's host failing) from what was kept last. So Mail opens on a train or a plane, says it's offline, and
// tries again by itself as the connection comes back, rather than the phone's "can't open the page". Only these files:
// never the API.
const SHELL = "mail-app-1";
const FILES = ["/", "/app.js", "/app.css", "/theme.js", "/manifest.webmanifest", "/icon.svg", "/inflite.svg", "/icon-180.png", "/icon-192.png"];
self.addEventListener("install", (e) => {
  self.skipWaiting();
  // (not waited on long: a worker that takes over late holds the updater up)
  e.waitUntil(Promise.race([caches.open(SHELL).then((c) => c.addAll(FILES)).catch(() => {}), new Promise((ok) => setTimeout(ok, 8000))]));
});
// (the updater every app shares, about to load a new version: Mail's files are fetched afresh by the page itself, past
// the browser's copy, through here and kept as they come, so there's nothing more for this worker to do: IFL.updates)
self.addEventListener("message", (e) => { if (e.data?.ifl === "renew") e.ports[0]?.postMessage({ ifl: "renewed" }); });
self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("mail-app-") && k !== SHELL) await caches.delete(k);
      await self.clients.claim();
    })()
  )
);
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin || u.pathname.startsWith("/api/")) return;
  // (any page of Mail's is its one page)
  const key = r.mode === "navigate" ? "/" : FILES.includes(u.pathname) && !u.search ? u.pathname : null;
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
    // (waited for where the browser lets a fetch's event be, this late; where it won't, it's kept all the same, and the
    // page still comes: never a page that fails to load for want of a copy)
    try {
      e.waitUntil(keep);
    } catch {}
  } else if (res.status >= 500) return (await kept()) || res;
  return res;
}

// The browser renewed this device's subscription: the new one kept in its place, so notices carry on without Mail
// being opened first
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
      await post("/api/push/subscribe", sub.toJSON());
      if (e.oldSubscription?.endpoint && e.oldSubscription.endpoint !== sub.endpoint) await post("/api/push/unsubscribe", { endpoint: e.oldSubscription.endpoint });
    })().catch(() => {})
  );
});

// Whether this device is still signed in to Mail's account (Mail's own sign-in check: /api/session), as a notice comes:
// false once it's been signed out, here or from elsewhere (a lost phone signed out from another), or someone else is
// signed in; null when it can't be told (no answer, or none within a few seconds: a notice that's slow to show counts
// as one never shown, and the phone stops notices for a site that keeps doing that), as a notice is never held back for that
async function stillSignedIn() {
  const ask = (async () => {
    const r = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) return null;
    const { access } = await r.json();
    return ["ok", "reauth", "passkey"].includes(access) ? true : access ? false : null;
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
  // (signed out: nothing of the mail said, notices stopped here (the push service then tells Mail this device has gone,
  // and Mail forgets it), and this last one says why)
  if ((await stillSignedIn()) === false) {
    await self.navigator.clearAppBadge?.().catch(() => {});
    await self.registration.pushManager.getSubscription().then((s) => s?.unsubscribe()).catch(() => {});
    return self.registration.showNotification("Mail", { body: "Signed out on this device, so notifications have stopped here.", tag: "signed-out", icon: "/icon-192.png", data: { url: "/" } });
  }
  const badge =
    typeof d.badge === "number" && self.navigator.setAppBadge
      ? (d.badge ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => {})
      : null;
  const thread = new URLSearchParams((d.url || "").split("#")[1] || "").get("thread");
  return Promise.all([
    self.registration.showNotification(d.title || "Mail", {
      body: d.body || "",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: d.url || "/", thread },
      // (where the system offers buttons on a notice: deal with it from there)
      actions: thread
        ? [
            { action: "reply", title: "Reply" },
            { action: "done", title: "Done" },
            { action: "later", title: "Later Today" },
          ]
        : [],
    }),
    badge,
  ]);
}

// A button on a notice: Done or Later, done here, with Mail left closed; Reply opens Mail at the reply
async function act(thread, body) {
  const r = await fetch(`/api/threads/${encodeURIComponent(thread)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Inflite": "1" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  const c = await fetch("/api/counts", { credentials: "same-origin" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const n = c?.inbox?.unread;
  if (typeof n === "number" && self.navigator.setAppBadge) await (n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()).catch(() => {});
}

// (Later Today: three hours on, on the half hour)
const laterToday = () => Math.ceil((Date.now() + 3 * 3600000) / 1800000) * 1800000;

// A notification tapped: Mail, open on its conversation (the open window if there is one)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const { thread } = e.notification.data || {};
  if (thread && (e.action === "done" || e.action === "later")) {
    e.waitUntil(
      act(thread, e.action === "done" ? { action: "done" } : { action: "snooze", until: laterToday() }).catch(() =>
        // (couldn't, say signed out: open Mail on it instead)
        openMail(new URL(e.notification.data.url, self.location.origin).href)
      )
    );
    return;
  }
  let url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  // (only ever Mail's own pages)
  if (!url.startsWith(self.location.origin + "/")) url = self.location.origin + "/";
  if (e.action === "reply") url += "&reply=1";
  e.waitUntil(openMail(url));
});

async function openMail(url) {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
  if (win) {
    await win.focus();
    win.postMessage({ open: url });
    return;
  }
  await self.clients.openWindow(url);
}
