// Mail's service worker: only for notifications (nothing is cached; Mail always loads fresh).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(d.title || "inflite Mail", {
        body: d.body || "",
        tag: d.tag || undefined,
        renotify: !!d.tag,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: d.url || "/" },
      }),
      badge,
    ])
  );
});

// A notification tapped: Mail, open on its conversation (the open window if there is one)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) {
        await win.focus();
        win.postMessage({ open: url });
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
