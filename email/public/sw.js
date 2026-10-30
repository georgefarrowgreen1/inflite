// Mail's service worker: only for notifications (nothing is cached; Mail always loads fresh).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data?.text() };
  }
  const badge =
    typeof d.badge === "number" && self.navigator.setAppBadge
      ? (d.badge ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => {})
      : null;
  const thread = new URLSearchParams((d.url || "").split("#")[1] || "").get("thread");
  e.waitUntil(
    Promise.all([
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
    ])
  );
});

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
