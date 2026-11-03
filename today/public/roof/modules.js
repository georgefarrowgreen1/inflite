// Loading the apps that are modules (One roof, spec §3.12, D2, D14, D15, D21). Loaded lazily by the frame (the first
// app opened, or the idle preload).
// loadModule(app, F) → Promise<{ m, instance }>: asks /api/hub again through app.js first (F.hubAgain, D14) and refuses
//   unless F.session.apps[app] (each app's flag, ANDed with hub; s24 §2); import(REGISTRY[app].entry) within 12 s; m.CONTRACT === 1; each of
//   REGISTRY[app].css linked and awaited (5 s at most; at once if already in); instance = await
//   m.mount(root, F.forModule(app)); IFL.built(R.id || app, m.BUILD, m.NEWS) once it's in (Chats: "chat", its data id); then watchVersion and keepOffline. On a failure the screen shows ui.error: Try Again
//   (data-act=retry: the entry asked for again, ?retry=<n>) and Open <App> on Its Own (data-act=own: the app's own
//   address, links[R.link || app], same path, query and hash); after a second failure, Reload (data-act=reload), which is the real recovery
//   (a failed dependency stays failed in the document's module map).
// loadConnector(app) → Promise<Connector>: import(REGISTRY[app].connector) → its `connector` export.
// preload(app): loadConnector(app), then a <link rel=modulepreload> per connector.preload entry (else connector.files)
//   ending .js (stage 3, S3-C1: Chats preloads only its entry and connector, as its graph's asked for under stamped URLs).
// watchVersion(app, build, F): asks /<app>/version as the page becomes visible (at most every 10 minutes); a build
//   other than this one sets F.stale (D21).
// loadService(app, F) → Promise<Service> (stage 3, S3-C3): import(REGISTRY[app].service), then its startService({ path,
//   ui: F.forModule(app), onStale }) (onStale: F.stale = true). Only the frame calls it, once per app (F.service).
// keepOffline(app, build, files): { ifl: "keep", app, build, files } (absolute same-origin paths) to the root worker,
//   once per build and list per page: connector.files after mount; files ∪ connector.lazy again only on the Home Screen,
//   at idle, 10 s or more after the first show (C4, s24 §8). preload reads files only.
import { REGISTRY } from "./router.js";

const tries = {}, built = {}, kept = {}, watching = new WeakMap();
const wait = (ms, what) => new Promise((_, no) => setTimeout(() => no(new Error(`${what} took too long`)), ms));
const abs = (p) => new URL(p, location.origin).pathname;

function css(href) {
  let l = document.querySelector(`link[rel=stylesheet][href="${href}"]`);
  if (l?.dataset.loaded || l?.sheet) return Promise.resolve();
  if (!l) { l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.append(l); }
  return Promise.race([new Promise((ok) => { l.addEventListener("load", () => { l.dataset.loaded = "1"; ok(); }, { once: true }); l.addEventListener("error", ok, { once: true }); }), new Promise((ok) => setTimeout(ok, 5000))]);
}

export async function loadModule(app, F) {
  const R = REGISTRY[app];
  if (!R) throw new Error(`no module ${app}`);
  const fw = F.forModule(app), root = fw.screenEl.querySelector(`.m-${app}`);
  const n = tries[app] = (tries[app] || 0);
  try {
    await Promise.race([F.hubAgain?.(), new Promise((ok) => setTimeout(ok, 2000))]);
    const s = F.session;
    if (!s.apps?.[app]) throw new Error(`the hub or the roof is off (${app}'s switch)`);
    const m = await Promise.race([import(n ? `${R.entry}?retry=${n}` : R.entry), wait(12e3, "the module")]);
    if (m?.CONTRACT !== 1 || typeof m.mount !== "function") throw new Error(`${app}: contract ${m?.CONTRACT} isn't 1`);
    await Promise.all(R.css.map(css));
    root.replaceChildren();
    const instance = await m.mount(root, fw);
    if (!instance || typeof instance.show !== "function") throw new Error(`${app}: mount gave no instance`);
    if (!built[app]) { built[app] = 1; try { globalThis.IFL?.built?.(R.id || app, m.BUILD, m.NEWS); } catch (_) {} }
    tries[app] = 0;
    watchVersion(app, m.BUILD, F);
    loadConnector(app).then((c) => {
      keepOffline(app, m.BUILD, c.files || []);
      const lazy = Array.isArray(c.lazy) ? c.lazy : [];
      const home = () => { try { return navigator.standalone === true || matchMedia("(display-mode: standalone)").matches; } catch (_) { return false; } };
      if (lazy.length && home()) setTimeout(() => (globalThis.requestIdleCallback || ((f) => f()))(() => keepOffline(app, m.BUILD, [...(c.files || []), ...lazy])), 10e3);
    }, () => {});
    return { m, instance };
  } catch (e) {
    tries[app] = n + 1;
    failed(app, F, root, n + 1);
    throw e;
  }
}

function failed(app, F, root, n) {
  const R = REGISTRY[app], ui = F.ui, links = F.session.links || {};
  const own = () => {
    const ln = R.link || app, base = links[ln] || `${location.protocol}//${ln}.${location.host.replace(/^next\./, "")}`;
    location.assign(base.replace(/\/$/, "") + location.pathname.slice(R.path.length - 1) + location.search + location.hash);
  };
  const again = n > 1
    ? { label: "Reload", act: "reload", primary: true, run: () => location.reload() }
    : { label: "Try Again", act: "retry", primary: true, run: () => F.nav.go(location.pathname + location.search + location.hash, { replace: true }) };
  root.replaceChildren(ui.error({ title: `${R.name} didn’t open`, body: `Try again, or open ${R.name} on its own.`, acts: [again, { label: `Open ${R.name} on Its Own`, act: "own", run: own }] }));
}

export async function loadConnector(app) {
  const R = REGISTRY[app];
  if (!R) throw new Error(`no module ${app}`);
  const m = await import(R.connector);
  return m.connector;
}

export async function loadService(app, F) {
  const R = REGISTRY[app];
  if (!R?.service) throw new Error(`no service for ${app}`);
  const m = await import(R.service);
  return m.startService({ path: R.path, ui: F.forModule(app), onStale: () => { F.stale = true; } });
}

export function preload(app) {
  return loadConnector(app).then((c) => {
    for (const f of c.preload || c.files || []) {
      if (!/\.js$/.test(f)) continue;
      const href = abs(f);
      if (document.querySelector(`link[rel=modulepreload][href="${href}"]`)) continue;
      const l = document.createElement("link");
      l.rel = "modulepreload"; l.href = href;
      document.head.append(l);
    }
    return c;
  }, () => null);
}

export function watchVersion(app, build, F) {
  const w = watching.get(F) || new Set();
  if (w.has(app)) return;
  w.add(app); watching.set(F, w);
  const R = REGISTRY[app];
  let at = 0;
  const ask = async () => {
    if (document.visibilityState !== "visible" || Date.now() - at < 10 * 60e3) return;
    at = Date.now();
    try {
      const r = await fetch(`${R.path}version`, { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) return;
      const j = await r.json();
      if (j?.build && String(j.build) !== String(build)) F.stale = true;
    } catch (_) {}
  };
  F.on("visible", ask);
}

export function keepOffline(app, build, files) {
  const k = `${app}:${build}:${files.length}`;
  const c = navigator.serviceWorker?.controller;
  if (kept[k] || !c) return;
  kept[k] = 1;
  try { c.postMessage({ ifl: "keep", app, build, files: [...new Set(files.map(abs))] }); } catch (_) {}
}
