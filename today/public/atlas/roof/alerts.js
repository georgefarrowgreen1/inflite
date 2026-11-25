import { atlasRunReference } from "../../roof/router.js";

const interval = 30000;
const attention = new Set(["waiting", "failed", "incomplete", "uncertain"]);
const digest = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, "0")).join("");

export function createAtlasAlerts(F, { send = globalThis.fetch, visible = () => document.visibilityState === "visible" } = {}) {
  const owner = F.session?.view?.user?.id;
  const allowed = () => !!owner && !F.signal.aborted && F.session?.view?.user?.id === owner && F.session.view.apps?.mail === true && F.session.apps?.atlas === true;
  const seen = new Set();
  let enabled = true, marker, request, timer, toast;

  function pause() {
    clearTimeout(timer);
    request?.abort();
    request = null;
    toast?.close();
    toast = null;
  }

  async function refresh() {
    if (!enabled || !allowed() || !visible()) return pause();
    if (request) return;
    clearTimeout(timer);
    const controller = request = new AbortController();
    const current = () => request === controller && allowed() && visible();
    try {
      const expected = marker ||= (await digest("atlas-owner:" + owner)).slice(0, 32);
      if (!current()) return;
      const response = await send("/atlas/api/alerts", { credentials: "same-origin", cache: "no-store", headers: { "X-Atlas-Owner": expected }, signal: AbortSignal.any([controller.signal, F.signal, AbortSignal.timeout(12000)]) });
      if (!current()) return;
      if ([401, 403, 409].includes(response.status)) { toast?.close(); return; }
      if (!response.ok || response.headers.get("X-Atlas-Owner") !== expected) return;
      const { alerts } = await response.json();
      if (!current() || !Array.isArray(alerts)) return;
      const storageKey = "inflite-atlas-alerts:" + expected;
      try {
        for (const id of JSON.parse(localStorage.getItem(storageKey) || "[]").slice(-120)) if (/^[a-f0-9]{32}$/.test(id)) seen.add(id);
      } catch {}
      for (const alert of alerts.slice(0, 20)) {
        const reference = atlasRunReference(alert?.reference);
        const ready = alert?.status === "completed";
        if (!reference || !Number.isSafeInteger(alert.revision) || alert.revision < 1 || !ready && !attention.has(alert.status)) continue;
        const id = (await digest(expected + ":" + reference + ":" + alert.revision + ":" + (ready ? "ready" : "attention"))).slice(0, 32);
        if (!current()) return;
        if (seen.has(id)) continue;
        seen.add(id);
        if (seen.size > 120) seen.delete(seen.values().next().value);
        try { localStorage.setItem(storageKey, JSON.stringify([...seen])); } catch {}
        const title = typeof alert.title === "string" ? alert.title.trim().slice(0, 96) : "";
        toast = F.toast((ready ? "Atlas is ready for review" : "Atlas needs your attention") + (title ? " · " + title : ""), {
          app: "atlas", action: { label: "Open run", run: () => allowed() && F.nav.go("/atlas/#tasks=" + reference, { from: "notification" }) },
        });
        break;
      }
    } catch {
      // A transient request failure will be retried while InFlite is visible.
    } finally {
      if (request === controller) {
        request = null;
        if (enabled && allowed() && visible()) timer = setTimeout(refresh, interval);
      }
    }
  }

  const offs = [F.on("visible", refresh), F.on("hidden", pause), F.on("apps", refresh)];
  function destroy() {
    enabled = false;
    pause();
    for (const off of offs) off();
    seen.clear();
    F.signal.removeEventListener("abort", destroy);
  }
  F.signal.addEventListener("abort", destroy, { once: true });
  void refresh();
  return { destroy, refresh };
}
