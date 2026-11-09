// InFlite framework: loading, recovery and offline files. Full public contract: docs/framework-contract.md.
import { REGISTRY } from "./router.js";

const tries = {}, built = {}, kept = {}, watching = new WeakMap(), styles = new Map(), failedStyles = new WeakSet(), disposed = new WeakSet();
const released = () => new DOMException("This screen was released", "AbortError");
const check = (signal) => { if (signal?.aborted) throw released(); };
// Dynamic imports cannot be stopped, but their callers can stop waiting. Their eventual result is still handled.
function until(work, ms, what, signal, optional = false) {
  return new Promise((ok, no) => {
    let done = false, timer;
    const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); fn(value); };
    const abort = () => finish(no, released());
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    if (ms && !done) timer = setTimeout(() => finish(optional ? ok : no, optional ? undefined : new Error(`${what} took too long`)), ms);
    Promise.resolve(work).then((x) => finish(ok, x), (e) => finish(no, e));
  });
}
function dispose(instance) {
  if (!instance || (typeof instance !== "object" && typeof instance !== "function") || disposed.has(instance)) return;
  disposed.add(instance);
  try { instance.unmount?.()?.catch?.((e) => console.error(e)); } catch (e) { console.error(e); }
}
const abs = (p) => new URL(p, location.origin).pathname;

function css(href) {
  if (styles.has(href)) return styles.get(href);
  const links = [...document.querySelectorAll(`link[rel=stylesheet][href="${href}"]`)];
  if (links.some((l) => l.dataset.loaded || l.sheet)) return Promise.resolve();
  let l = links.find((l) => !failedStyles.has(l));
  const owned = !l;
  if (owned) { l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; }
  const p = new Promise((ok, no) => {
    const finish = (error) => {
      clearTimeout(timer); l.removeEventListener("load", loaded); l.removeEventListener("error", failed);
      if (error) { failedStyles.add(l); if (owned) l.remove(); styles.delete(href); no(error); }
      else { l.dataset.loaded = "1"; ok(); }
    };
    const loaded = () => finish(), failed = () => finish(new Error(`Stylesheet did not load: ${href}`));
    const timer = setTimeout(() => finish(new Error(`Stylesheet took too long: ${href}`)), 5000);
    l.addEventListener("load", loaded); l.addEventListener("error", failed);
    if (owned) document.head.append(l);
  });
  styles.set(href, p);
  return p;
}

export async function loadModule(app, F) {
  const R = REGISTRY[app];
  if (!R) throw new Error(`no module ${app}`);
  const fw = F.forModule(app), root = fw.screenEl.querySelector(`.m-${app}`);
  const n = tries[app] = (tries[app] || 0);
  let instance = null;
  try {
    check(fw.signal);
    await until(F.hubAgain?.(), 2000, "the hub", fw.signal, true);
    check(fw.signal);
    const s = F.session;
    if (!s.apps?.[app]) throw new Error(`the hub or the roof is off (${app}'s switch)`);
    const m = await until(import(n ? `${R.entry}?retry=${n}` : R.entry), 12e3, "the module", fw.signal);
    check(fw.signal);
    if (m?.CONTRACT !== 1 || typeof m.mount !== "function") throw new Error(`${app}: contract ${m?.CONTRACT} isn't 1`);
    await until(Promise.all(R.css.map(css)), 0, "the stylesheets", fw.signal);
    check(fw.signal);
    root.replaceChildren();
    const mounting = Promise.resolve(m.mount(root, fw)).then((value) => {
      if (fw.signal?.aborted) { dispose(value); throw released(); }
      return value;
    });
    instance = await until(mounting, 0, "the mount", fw.signal);
    check(fw.signal);
    if (!instance || typeof instance.show !== "function") throw new Error(`${app}: mount gave no instance`);
    if (!built[app]) { built[app] = 1; try { globalThis.IFL?.built?.(R.id || app, m.BUILD, m.NEWS); } catch (_) {} }
    tries[app] = 0;
    watchVersion(app, m.BUILD, F, { signal: fw.signal });
    loadConnector(app).then((c) => {
      if (fw.signal?.aborted) return;
      keepOffline(app, m.BUILD, c.files || [], { signal: fw.signal });
      const lazy = Array.isArray(c.lazy) ? c.lazy : [];
      const home = () => { try { return navigator.standalone === true || matchMedia("(display-mode: standalone)").matches; } catch (_) { return false; } };
      if (lazy.length && home()) {
        const cancel = () => clearTimeout(timer);
        const timer = setTimeout(() => {
          fw.signal?.removeEventListener("abort", cancel);
          (globalThis.requestIdleCallback || ((f) => f()))(() => { if (!fw.signal?.aborted) keepOffline(app, m.BUILD, [...(c.files || []), ...lazy], { signal: fw.signal }); });
        }, 10e3);
        fw.signal?.addEventListener("abort", cancel, { once: true });
      }
    }, () => {});
    return { m, instance };
  } catch (e) {
    dispose(instance);
    if (fw.signal?.aborted || e?.name === "AbortError") throw released();
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

export async function loadService(app, F, { signal = F.signal } = {}) {
  const R = REGISTRY[app];
  if (!R?.service) throw new Error(`no service for ${app}`);
  check(signal);
  const ui = F.forModule(app), m = await until(import(R.service), 0, "the service", signal);
  check(signal); check(ui.signal);
  // Startup owns its abort handling; the frame also releases an eventual result after termination.
  return m.startService({ path: R.path, ui, signal, onStale: () => { if (!signal?.aborted && !ui.signal?.aborted) F.stale = true; } });
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

export function watchVersion(app, build, F, { signal = F.signal } = {}) {
  if (signal?.aborted) return;
  const w = watching.get(F) || new Map();
  w.get(app)?.(); watching.set(F, w);
  const R = REGISTRY[app];
  let at = 0;
  const ask = async () => {
    if (signal?.aborted || document.visibilityState !== "visible" || Date.now() - at < 10 * 60e3) return;
    at = Date.now();
    try {
      const r = await fetch(`${R.path}version`, { cache: "no-store", credentials: "same-origin", signal });
      if (!r.ok) return;
      const j = await r.json();
      if (!signal?.aborted && j?.build && String(j.build) !== String(build)) F.stale = true;
    } catch (_) {}
  };
  const off = F.on("visible", ask), drop = () => { off(); signal?.removeEventListener("abort", drop); if (w.get(app) === drop) w.delete(app); };
  w.set(app, drop); signal?.addEventListener("abort", drop, { once: true });
}

export function keepOffline(app, build, files, { signal } = {}) {
  const k = `${app}:${build}:${files.length}`, sw = navigator.serviceWorker;
  if (signal?.aborted || kept[k] || !sw?.getRegistration) return;
  kept[k] = 1;
  // (to the root worker itself, by its registration, never to whatever controls this page: that may be an app's old
  // worker still (Chat's at /chats/, retired, yet this document's until it's left), and the ask would go nowhere and the
  // module not open offline. No root worker active yet (the site's first visit): asked again at the next mount)
  sw.getRegistration("/").then((r) => { if (signal?.aborted) { delete kept[k]; return; } r.active.postMessage({ ifl: "keep", app, build, files: [...new Set(files.map(abs))] }); }).catch(() => { delete kept[k]; });
}
