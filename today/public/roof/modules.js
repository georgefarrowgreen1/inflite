// Loading the apps that are modules (One roof, spec §3.12, D2, D14, D15, D21). Loaded lazily by the frame (the first
// app opened, or the idle preload).
// loadModule(app, F) → Promise<{ m, instance }>: asks /api/hub again through app.js first (F.hubAgain, D14) and refuses
//   unless F.session.hub && F.session.roof; import(REGISTRY[app].entry) within 12 s; m.CONTRACT === 1; each of
//   REGISTRY[app].css linked and awaited (5 s at most); IFL.built(app, m.BUILD, m.NEWS) once; instance = await
//   m.mount(root, F.forModule(app)); then watchVersion and keepOffline. On a failure the screen shows ui.error: Try Again
//   (data-act=retry: the entry asked for again, ?retry=<n>) and Open <App> on Its Own (data-act=own: the app's own
//   address, same path, query and hash); after a second failure, Reload (data-act=reload), which is the real recovery
//   (a failed dependency stays failed in the document's module map).
// loadConnector(app) → Promise<Connector>: import(REGISTRY[app].connector) → its `connector` export.
// preload(app): loadConnector(app), then a <link rel=modulepreload> per connector.files entry ending .js.
// watchVersion(app, build, F): asks /<app>/version as the page becomes visible (at most every 10 minutes); a build
//   other than this one sets F.stale (D21).
// keepOffline(app, build, files): { ifl: "keep", app, build, files } (absolute same-origin paths) to the root worker,
//   once per build per page.
import { REGISTRY } from "./router.js";

const tries = {}, built = {}, kept = {}, watching = new WeakMap();
const wait = (ms, what) => new Promise((_, no) => setTimeout(() => no(new Error(`${what} took too long`)), ms));
const abs = (p) => new URL(p, location.origin).pathname;

function css(href) {
  let l = document.querySelector(`link[rel=stylesheet][href="${href}"]`);
  if (l?.dataset.loaded) return Promise.resolve();
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
    if (!s.hub || !s.roof) throw new Error("the hub or the roof is off");
    const m = await Promise.race([import(n ? `${R.entry}?retry=${n}` : R.entry), wait(12e3, "the module")]);
    if (m?.CONTRACT !== 1 || typeof m.mount !== "function") throw new Error(`${app}: contract ${m?.CONTRACT} isn't 1`);
    await Promise.all(R.css.map(css));
    if (!built[app]) { built[app] = 1; try { globalThis.IFL?.built?.(app, m.BUILD, m.NEWS); } catch (_) {} }
    root.replaceChildren();
    const instance = await m.mount(root, fw);
    if (!instance || typeof instance.show !== "function") throw new Error(`${app}: mount gave no instance`);
    tries[app] = 0;
    watchVersion(app, m.BUILD, F);
    loadConnector(app).then((c) => keepOffline(app, m.BUILD, c.files || []), () => {});
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
    const base = links[app] || `${location.protocol}//${app}.${location.host.replace(/^next\./, "")}`;
    location.assign(base.replace(/\/$/, "") + location.pathname.replace(new RegExp(`^${R.path.slice(0, -1)}`), "") + location.search + location.hash);
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

export function preload(app) {
  return loadConnector(app).then((c) => {
    for (const f of c.files || []) {
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
  const k = `${app}:${build}`;
  const c = navigator.serviceWorker?.controller;
  if (kept[k] || !c) return;
  kept[k] = 1;
  try { c.postMessage({ ifl: "keep", app, build, files: [...new Set(files.map(abs))] }); } catch (_) {}
}
