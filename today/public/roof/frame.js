// InFlite framework: frame and module api. Full public contract: docs/framework-contract.md.
import { REGISTRY, parse, format, owns, ownPath } from "./router.js";
import { createHeader } from "./header.js";
import { createTabs } from "./tabs.js";
import { createSheets } from "./sheet.js";
import { toast } from "./toast.js";
import * as ui from "./ui.js";
import { createSearch } from "./search.js";
import { createSend } from "./send.js";

export const CONTRACT = 1;
// The shell's request factory also works before the signed-in frame is mounted.
export { createRequestCoordinator, isRequestCancelled } from "./requests.js";
const TABN = { today: "Today", apps: "Apps", you: "You" };
const labelOf = (r) => (r?.kind === "app" ? REGISTRY[r.app]?.name : TABN[r?.tab]) || null;
const TODAY = { kind: "tab", tab: "today", arg: null };
const T = (f, d) => { try { return f(); } catch (_) { return d; } };
const ss = (k, v) => T(() => sessionStorage.setItem(k, v));
const val = (x) => (typeof x === "function" ? x() : x);
// (the kinds a module may ask fw.nav.go for; "pop" is the frame's own Back)
const KINDS = ["push", "tab", "zoom", "section"];
const released = () => new DOMException("This screen was let go of", "AbortError");

export function createFrame(opts = {}) {
  const H = history, L = location, doc = document, html = doc.documentElement;
  const offs = [], subs = {}, screens = {}, mods = {}, lifetime = new AbortController();
  const on = (t, ev, fn, o) => { if (!t) return; t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
  const emit = (ev, x) => { for (const f of [...(subs[ev] || [])]) try { f(x); } catch (e) { console.error(e); } };
  const sess0 = () => ({ view: null, hub: false, roof: false, links: {}, ...(opts.session?.() || {}) });
  // (each app's flag, ANDed with hub: a stage-1 host gives no apps, which is Weather's roof alone)
  const appsOf = (s) => { const o = {}; if (s.hub) for (const a of Object.keys(REGISTRY)) o[a] = !!(s.apps ? s.apps[a] : a === "weather" && s.roof); return o; };
  const sess = () => { const s = sess0(); return { ...s, apps: appsOf(s) }; };
  const isOn = (app) => !!sess().apps[app];
  // (stage 3, S3-C3: each app's service, one promise per app; B0's stub, HOST's to fill)
  const svcs = {};
  const releaseValue = (record) => {
    if (!record.value || record.released) return;
    record.released = true;
    for (const off of record.offs.splice(0)) T(() => off?.());
    T(() => record.value.release?.({ terminate: true }))?.catch?.((e) => console.error(e));
  };
  // (one let go of before it's made is never made; its state heard only while it's still this app's one)
  const svc = (app) => {
    if (svcs[app]) return svcs[app].promise;
    if (gone || !isOn(app) || !REGISTRY[app]?.service) return Promise.reject(new Error(`${app}: no service here`));
    const record = svcs[app] = { controller: new AbortController(), value: null, released: false, offs: [] };
    const live = () => !gone && svcs[app] === record && !record.controller.signal.aborted && isOn(app);
    record.promise = Promise.resolve(opts.retired).catch(() => {}).then(async () => {
      if (!live()) throw released();
      const M = await import("./modules.js");
      if (!live()) throw released();
      return M.loadService(app, F, { signal: record.controller.signal });
    })
      .then((s) => {
        record.value = s;
        if (!live()) { releaseValue(record); throw released(); }
        const st = (d) => { if (!live()) return; T(() => opts.serviceState?.(app, d?.state)); found(app, s, /^(ready|offline)$/.test(d?.state)); };
        // (its tab's count from the service's unread, on every screen, the module mounted or not: §2.5)
        const tab = REGISTRY[app].tab, un = (x) => { if (tab && x?.topic === "unread" && live()) F.tabs.badge(tab, x.data); };
        record.offs.push(s.on?.("state", st), s.on?.("*", un)); st(s); return s;
      }).catch((e) => { if (svcs[app] === record) delete svcs[app]; releaseValue(record); throw e; });
    return record.promise;
  };
  // (the frame's own search over a service (Chats' People and Messages, §2.4): while it's unlocked and signed in; gone as
  // it's locked, signed out or let go of)
  const finds = {};
  const found = (app, s, v) => {
    const f = finds[app];
    if (!v) { delete finds[app]; return f?.then((off) => off?.()); }
    if (f) return;
    const p = finds[app] = import("./connectors.js").then((c) => (finds[app] === p && !gone ? c.chatsProvider(F, s) : null)).catch(() => null);
  };
  const roofs = () => sess().apps;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let motion = 0, stopMotion = () => {};
  const cancelMotion = () => { stopMotion(); ++motion; stopMotion = () => {}; };
  const newKey = () => Math.random().toString(36).slice(2, 10);
  const ys = new Map(), backTo = new Map();
  let depth = 0, key = "", routes = [], stale = false, gone = false, shown = null, lastApps = sess().apps, lazyAt = {}, fails = {};

  // (b: the name of the entry before, so a reload there still says where Back goes, C6: kept by a replace)
  const put = (p, push, s) => T(() => H[push ? "pushState" : "replaceState"]({ ...s, ifl: { d: depth, k: key, b: labelOf(routes[depth - 1]) || (!push && H.state?.ifl?.k === key && H.state.ifl.b) || null } }, "", p));
  const stamp = () => put(L.href, 0, typeof H.state == "object" && H.state);
  const st0 = H.state?.ifl;
  if (st0 && Number.isInteger(st0.d)) { depth = st0.d; key = String(st0.k || newKey()); } else { key = newKey(); stamp(); }
  H.scrollRestoration = "manual";
  const curDepth = () => (Number.isInteger(H.state?.ifl?.d) ? H.state.ifl.d : depth);
  const here = () => parse(L.href, { roof: roofs() }) || TODAY;

  // ---- the session, and lost() (D3): asks once, shared for 30 s; signs out only on a confirmed "signed out"
  let lostP = null, lostAt = 0;
  const lost = () => gone ? Promise.resolve(false) : lostP && Date.now() - lostAt < 30e3 ? lostP
    : (lostAt = Date.now(), lostP = Promise.resolve().then(() => !gone && opts.checkSession?.()).catch(() => true).then((inn) => !gone && inn === false && (T(() => opts.lost?.()), true)));

  // D21: the page reloaded at its route, where you were kept the way the shared updater keeps it
  const reloadStale = () => {
    if (gone) return;
    ss("ifl-here:today", JSON.stringify({ at: T(() => opts.save?.()) ?? null, t: Date.now() }));
    L.reload();
  };
  // (a reload this page starts itself, once nothing is unsaved (C7): checked each second while busy() (F.busy), for up
  // to `ms`; then at each next hidden, flushed first. One at a time: a new one drops the last one's timer and listener)
  let later = 0, hid = null;
  const unlater = () => { clearInterval(later); hid?.(); hid = null; };
  const safely = (go, ms = 10e3, busy = F.busy) => {
    unlater();
    const t0 = Date.now(), tick = () => {
      if (gone) return unlater();
      if (!busy()) { unlater(); return go(); }
      if (Date.now() - t0 > ms) { unlater(); hid = F.on("hidden", () => { unlater(); F.flush().then(() => (busy() ? safely(go, ms, busy) : go())); }); }
    };
    later = setInterval(tick, 1000);
    tick();
  };
  // (a module switched off and not shown: its own flush() first where it has one, then unmounted, unless it's been
  // mounted again or shown meanwhile)
  const letGo = (a) => {
    const m = mods[a], f = T(() => m?.instance?.flush?.());
    if (!f?.then) return unmount(a);
    f.then(null, () => {}).then(() => { if (!gone && !isOn(a) && mods[a] === m && shown?.id !== "m:" + a) unmount(a); });
  };

  const F = {
    route: null,
    signal: lifetime.signal,
    ui, toast,
    get session() { return gone ? { view: null, hub: false, roof: false, apps: {}, links: {}, lost } : { ...sess(), lost }; },
    flush() {
      return Promise.all(Object.values(mods).map((m) => Promise.race([Promise.resolve().then(() => m.instance?.flush?.()).catch(() => null), new Promise((ok) => setTimeout(ok, 2000))])))
        .then((a) => ({ lost: a.reduce((n, x) => n + (Number(x?.lost) || 0), 0) }));
    },
    get stale() { return stale; },
    set stale(v) { if (!gone) stale = !!v; },
    on(ev, fn) { if (gone) return () => {}; (subs[ev] ||= []).push(fn); return () => { subs[ev] = (subs[ev] || []).filter((f) => f !== fn); }; },
    hubAgain: () => gone ? Promise.resolve() : Promise.resolve(opts.hubAgain?.()).catch(() => {}),
    busy: () => !!F.sheet.top() || !!(shownMod()?.instance?.busy?.()),
    restamp() { if (!gone && !H.state?.ifl) stamp(); },
    fill(v) { if (!gone) { html.classList.toggle("ifl-fill", !!v); F.header.compact?.(); } },
    screen(id, spec = {}) {
      if (gone) return;
      const was = screens[id];
      const el = spec.el || doc.getElementById(id);
      if (el) { el.classList.add("ifl-screen"); el.dataset.app = "inflite"; }
      screens[id] = { el, spec };
      if (shown?.id === id) {
        if (!was?.el && el) render(F.route, { kind: null, again: true });
        else F.header.set(tabHead(spec, F.route));
      } else if (el && shown) { el.hidden = true; el.inert = true; }
    },
    refresh() { const s = !gone && shown && screens[shown.id]; if (s) F.header.set(tabHead(s.spec, F.route)); },
    // (v is Weather's flag (stage 1's argument, alone from a host before stages 2–4), apps the new map, each ANDed with
    // hub; the host changes what session() says too. Apps turned off are let go of, the shown one with D14's bounce once
    // nothing is unsaved (s24 §7); apps turned on get their search provider)
    setRoof(v, apps) {
      if (gone) return;
      const s = sess(), now = apps && typeof apps === "object" ? appsOf({ ...s, apps }) : v === undefined ? s.apps : { ...lastApps, weather: !!(s.hub && v) }, was = lastApps;
      lastApps = now;
      const off = Object.keys(REGISTRY).filter((a) => was[a] && !now[a]);
      providers();
      if (!off.length) return;
      const a = shownMod()?.app;
      for (const x of off) if (x !== a) letGo(x);
      if (!off.includes(a)) return;
      // (nothing unsaved: at once, as stage 1 did; else what's unsaved saved first, and the bounce once it's done; left
      // for another screen meanwhile: let go of, no marker, no reload)
      const m = mods[a], here = () => !gone && mods[a] === m && shown?.id === "m:" + a, busy = () => here() && F.busy();
      const go = () => {
        if (gone || isOn(a)) return;
        if (!here()) return letGo(a);
        T(() => mods[a]?.instance?.flush?.());
        unmount(a); ss("ifl-roof-bounce", "1"); put(L.pathname + L.hash); L.reload();
      };
      if (!busy()) return go();
      F.flush().then(() => safely(go, 10e3, busy));
    },
    forModule: (app) => { if (gone) throw released(); return modOf(app).fw; },
    service: (app) => svc(app).then((s) => s.facade),
    releaseService(app, o) {
      const record = svcs[app];
      if (!record) return;
      if (!o?.terminate) return record.promise.then((s) => s.release?.(o), () => {});
      delete svcs[app]; record.controller.abort();
      found(app); releaseValue(record);
      if (!gone && REGISTRY[app]?.tab) F.tabs.badge(REGISTRY[app].tab, 0);
      return record.promise.then(() => {}, () => {});
    },
    destroy() {
      if (gone) return;
      gone = true; lifetime.abort();
      cancelMotion();
      for (const a of Object.keys(svcs)) F.releaseService(a, { terminate: true });
      unlater();
      for (const a of Object.keys(mods)) unmount(a);
      F.sheet.closeAll();
      for (const f of Object.values(provs)) f();
      for (const f of offs.splice(0)) f();
      F.header.destroy?.(); F.tabs.destroy?.();
      html.classList.remove("ifl-fill");
      html.dataset.app = "inflite";
      delete html.dataset.route; delete html.dataset.vt;
      if (opts.root) opts.root.hidden = true;
      emit("signedout");
      for (const ev of Object.keys(subs)) delete subs[ev];
    },
  };

  // ---- navigation
  F.nav = {
    go(path, o = {}) {
      if (gone) return;
      F.sheet.closeAll();
      const u = T(() => new URL(String(path), L.href));
      if (!u) return;
      if (u.origin !== L.origin) return /^https?:$/.test(u.protocol) && L.assign(u.href);
      const p = u.pathname + u.search + u.hash;
      const r = parse(p, { roof: roofs() });
      if (!r) return L.assign(globalThis.IFL?.hub?.go ? globalThis.IFL.hub.go(p) : p);
      if (r.kind === "app" && stale && shown?.id !== "m:" + r.app && !F.busy()) return L.assign(p);
      const cur = shown?.route;
      const zoom = o.zoomFrom && r.kind === "app" && !reduced() ? o.zoomFrom : null;
      const kind = o.kind || (zoom ? "zoom" : isTab(r) && isTab(cur) ? "tab" : "push");
      leaveEntry();
      F.restamp();
      if (!o.replace) { depth++; key = newKey(); routes.length = depth; }
      put(p, !o.replace);
      routes[depth] = r;
      render(r, { kind, zoomFrom: zoom, hint: o.zoomFrom && r.app === "weather" ? hintOf(o.zoomFrom, u) : null, y: o.replace && shown?.id === idOf(r) ? scrollY : 0 });
    },
    back() {
      if (gone) return;
      const top = F.sheet.top();
      if (top) return top.close();
      if (shownMod()?.instance?.back?.()) return;
      if (curDepth() > 0) return H.back();
      const t = F.route?.kind === "app" && REGISTRY[F.route.app].tab;
      if (!t || !tabRoot(F.route)) F.nav.go(t ? REGISTRY[F.route.app].path : "/#apps", { replace: true, kind: "pop" });
    },
    section(app, id, { arg = null } = {}) {
      if (gone) return;
      const m = mods[app], r0 = F.route, ids = REGISTRY[app]?.sections.map((s) => s[0]);
      if (!m || shown?.id !== "m:" + app || !ids.includes(id)) return;
      if (r0.section === id && !arg && r0.key === id) return;
      F.sheet.closeAll();
      ys.set(`${key}:${r0.section}`, scrollY);
      const p = format({ app, section: id, arg });
      const r = parse(p, { roof: true });
      put(p);
      routes[depth] = r;
      html.dataset.dir = ids.indexOf(id) < ids.indexOf(r0.section) ? "back" : "fwd";
      // (the header as it is now, kept: compact stays compact, full stays full, so a section switch never grows or shrinks it)
      const was = ys.get(`${key}:${id}`) || 0, y = scrollY > 28 ? Math.max(was, 29) : 0;
      F.route = r; shown.route = r;
      html.dataset.route = format(r);
      // (not animated: the app stays on screen as it is, only what changes in it changes, as a segmented control does)
      html.classList.remove("ifl-fill");
      F.header.set(appHead(r));
      m.root.setAttribute("aria-labelledby", `ifl-sec-${id}`);
      scrollTo(0, y);
      const sh = () => liveModule(m) && F.route === r && m.instance?.show(r, null);
      Promise.resolve(m.instance ? sh() : m.loading?.then(sh)).then(() => { if (F.route === r && y) scrollTo(0, y); }, (e) => console.error(e));
      emit("route", r);
    },
    prev: () => routes[curDepth() - 1] || null,
  };

  const idOf = (r) => (r.kind === "app" ? "m:" + r.app : r.tab);
  // (a change of a stay key in the same app, a reader opened or closed: a screen change for focus and scroll, C7)
  const stays = (r, p) => r.kind === "app" && p?.kind === "app" && !!REGISTRY[r.app].stay?.some((k) => k === r.key || k === p.key) && (r.key !== p.key || r.arg !== p.arg);
  const shownMod = () => (shown?.id.startsWith("m:") ? mods[shown.id.slice(2)] : null);
  // (stage 3, S3-C4, S3-C7: a route whose key is one of its app's stay keys (a chat, a thread); an app's root that's a tab
  // screen (REGISTRY tab: Chats), drawn as one; a tab screen, Today, Apps and You or such a root. A tab app's stay route
  // (a chat) gets no window scroll put back: it scrolls its own. Mail's thread keeps s24 C7's)
  const stayR = (r) => r?.kind === "app" && !!REGISTRY[r.app].stay?.includes(r.key);
  const tabRoot = (r) => r?.kind === "app" && !!REGISTRY[r.app].tab && !stayR(r);
  const isTab = (r) => r?.kind === "tab" || tabRoot(r);
  function leaveEntry() {
    ys.set(key, scrollY);
    if (F.route?.kind === "app") ys.set(`${key}:${F.route.section}`, scrollY);
    backTo.set(key, doc.activeElement);
  }
  function tabHead(spec = {}, r) {
    const crumb = val(spec.crumb);
    return { back: null, crumb: crumb ? { text: crumb } : null, title: val(spec.title) ?? TABN[r?.tab] ?? "", line: val(spec.line) ?? "", acts: val(spec.acts) || [], sections: null };
  }
  function appHead(r) {
    const R = REGISTRY[r.app], h = mods[r.app]?.header || {}, d = curDepth();
    const to = d > 0 ? labelOf(routes[d - 1]) || H.state?.ifl?.b : R.tab ? R.name : "Apps", t = tabRoot(r);
    return {
      ...h, back: t ? null : { label: h.back?.label || (to ? `Back to ${to}` : "Back") }, crumb: t ? null : { text: R.name, app: r.app }, title: h.title ?? R.name,
      sections: h.sections === false || h.sections === null ? null : R.sections, section: r.section, onSection: (id) => F.nav.section(r.app, id),
    };
  }
  // what the tapped card says, for the module's first paint (§2.3): { sky, temp, place }; Weather's cards only (S2-D17:
  // another module's hint is null, and it drops the clone with fw.zoomTarget once its hero is in)
  const hintOf = (card, u) => ({
    sky: /(?:^|\s)wx-sk-([\w-]+)/.exec(card.className)?.[1] || null,
    temp: card.querySelector(".wx-now .t")?.textContent.trim() || null,
    place: u.searchParams.get("name") || card.querySelector(".tc-meta")?.textContent.split(" · ")[0].trim() || null,
  });

  // ---- showing a route
  function render(r, o = {}) {
    r ||= TODAY;
    const id = idOf(r), prev = shown, same = prev?.id === id;
    if (r.kind === "app" && stale && prev && !same && !F.busy()) return reloadStale();
    const pop = o.kind === "pop", k = key;
    F.route = r;
    shown = { id, route: r };
    html.dataset.route = format(r);
    const change = () => {
      if (prev && !same) {
        if (prev.id.startsWith("m:")) mods[prev.id.slice(2)]?.instance?.hide?.();
        else screens[prev.id]?.spec.onHide?.();
      }
      for (const [k, s] of Object.entries(screens)) if (s.el && k !== id) { s.el.hidden = true; s.el.inert = true; }
      for (const [k, m] of Object.entries(mods)) if ("m:" + k !== id) { m.el.hidden = true; m.el.inert = true; }
      if (!same || r.kind !== "app" || prev.route.section !== r.section) html.classList.remove("ifl-fill");
      html.dataset.app = r.kind === "app" ? r.app : "inflite";
      F.tabs.set(r.kind === "app" ? REGISTRY[r.app].tab || "apps" : r.tab);
      if (!same) F.tabs.away?.(false);
      const y = stayR(r) && REGISTRY[r.app].tab ? 0 : pop ? ys.get(r.kind === "app" ? `${k}:${r.section}` : k) ?? ys.get(k) ?? 0 : o.y || 0;
      if (pop && stays(r, prev?.route)) o.popY = y;
      const el = r.kind === "app" ? showApp(r, o) : showTab(r);
      if (!o.first) scrollTo(0, y);
      if (!o.first && (!same || stays(r, prev.route))) {
        const f = pop ? backTo.get(k) : null;
        (f?.isConnected && !f.closest("[hidden]") ? f : doc.querySelector("#hd h1.ifh-name"))?.focus?.({ preventScroll: true });
      }
      return el;
    };
    transition(o.first || o.again ? null : o.kind, change, o);
    emit("route", r);
  }
  function showTab(r) {
    const s = screens[r.tab];
    F.header.set(tabHead(s?.spec, r));
    if (!s?.el) return null;
    s.el.hidden = false; s.el.inert = false;
    try { s.spec.onShow?.(r); } catch (e) { console.error(e); }
    return s.el;
  }
  function showApp(r, o) {
    const m = modOf(r.app);
    m.el.hidden = false; m.el.inert = false;
    m.root.setAttribute("aria-labelledby", `ifl-sec-${r.section}`);
    F.header.set(appHead(r));
    if (o.zoomFrom) clone(m, o.zoomFrom);
    if (!m.instance && !m.loading) {
      if (!m.root.firstChild) m.root.append(ui.skeleton("hero"), ui.skeleton("card", 3));
      m.loading = import("./modules.js").then((M) => {
        if (!liveModule(m)) throw released();
        return M.loadModule(r.app, F);
      }).then(({ instance, m: M }) => {
        if (!liveModule(m)) { T(() => instance.unmount?.()); return; }
        m.instance = instance; m.build = M?.BUILD;
      }, (e) => { if (liveModule(m) && e?.name !== "AbortError") console.error(e); }).finally(() => { m.loading = null; });
    }
    Promise.resolve(m.loading).then(() => {
      if (!liveModule(m) || F.route !== r || !m.instance) return dropClone(m);
      return Promise.resolve(m.instance.show(r, o.hint || null)).then(() => {
        dropClone(m);
        if (!liveModule(m) || F.route !== r) return;
        const y = o.y || o.popY;
        if (y && Math.abs(scrollY - y) > 2) scrollTo(0, y);
        tidy(r);
      });
    }).catch((e) => { console.error(e); dropClone(m); });
    return m.el;
  }
  // D6: once a deep link is shown, the address is the section's own (no query, no sheet key)
  function tidy(r) {
    if (REGISTRY[r.app]?.stay?.includes(r.key)) return;
    const p = format({ app: r.app, section: r.section });
    if (p === L.pathname + L.search + L.hash && r.key === r.section) return;
    put(p);
    const t = parse(p, { roof: true }) || r;
    F.route = t; shown.route = t; routes[depth] = t;
    html.dataset.route = p;
  }
  function clone(m, card) {
    dropClone(m);
    const c = card.cloneNode(true);
    for (const n of [c, ...c.querySelectorAll("[id]")]) n.removeAttribute("id");
    c.classList.add("ifl-vt-zoom");
    c.classList.remove("in");
    const slot = ui.el("div", { class: "ifl-zoom-slot", "aria-hidden": "true" }, c);
    slot.inert = true;
    m.el.prepend(slot);
    m.slot = slot;
  }
  function dropClone(m) { m.slot?.remove(); m.slot = null; }

  // ---- transitions (§3.7): a View Transition where there is one, its kind on html[data-vt]; else a CSS animation
  function transition(kind, change, o = {}) {
    // A newer route owns both the render and its cleanup. A skipped snapshot may
    // still call its update callback; it must never put an older page back on top.
    cancelMotion();
    if (!kind || o.ua || kind == "section") return void change();
    const k = reduced() ? "fade" : kind, mine = motion;
    let applied = false;
    const apply = () => { if (gone || mine !== motion || applied) return; applied = true; return change(); };
    if (typeof doc.startViewTransition === "function" && doc.visibilityState === "visible") {
      html.dataset.vt = k;
      const z = k === "zoom" ? o.zoomFrom : null;
      z?.classList.add("ifl-vt-zoom");
      let t, timer;
      const clean = () => {
        clearTimeout(timer);
        if (mine !== motion) return;
        z?.classList.remove("ifl-vt-zoom");
        delete html.dataset.vt;
        doc.querySelector(".ifl-zoom-slot .ifl-vt-zoom")?.classList.remove("ifl-vt-zoom");
        stopMotion = () => {};
      };
      try { t = doc.startViewTransition(() => { z?.classList.remove("ifl-vt-zoom"); return apply(); }); }
      catch (_) { clean(); apply(); return; }
      stopMotion = (finish) => { if (finish) apply(); try { t.skipTransition(); } catch (_) {} clean(); };
      timer = setTimeout(() => { if (mine === motion) stopMotion(true); }, 1500);
      for (const p of ["ready", "updateCallbackDone"]) t[p]?.catch?.(() => {});
      const finished = () => { apply(); clean(); };
      t.finished.then(finished, finished);
      return;
    }
    const el = apply();
    if (!el) return;
    const c = `ifl-enter-${k}`;
    el.classList.add(c);
    const done = (e) => { if (e && e.target !== el) return; clearTimeout(timer); el.classList.remove(c); el.removeEventListener("animationend", done); el.removeEventListener("animationcancel", done); if (mine === motion) stopMotion = () => {}; };
    const timer = setTimeout(() => done(), 700);
    stopMotion = () => done();
    el.addEventListener("animationend", done);
    el.addEventListener("animationcancel", done);
  }

  // ---- modules' screens, and what each module gets
  const liveModule = (m) => !gone && mods[m.app] === m && !m.controller.signal.aborted;
  function modOf(app) {
    if (mods[app]) return mods[app];
    const el = ui.el("main", { id: `m-${app}`, class: "view ifl-screen", data: { app }, hidden: true });
    el.inert = true;
    const root = ui.el("div", { class: `m-${app}`, role: "tabpanel" });
    el.append(root);
    opts.views?.append(el);
    const m = (mods[app] = { app, el, root, controller: new AbortController(), instance: null, loading: null, header: {}, offs: [], provs: [], slot: null });
    m.fw = makeFw(m);
    return m;
  }
  function unmount(app) {
    if (svcs[app]) F.releaseService(app, { terminate: true });
    const m = mods[app];
    if (!m) return;
    delete mods[app];
    m.controller.abort();
    try { m.instance?.unmount?.(); } catch (e) { console.error(e); }
    for (const f of m.offs.splice(0)) f();
    for (const f of m.provs.splice(0)) f();
    m.el.remove();
    providers();
  }
  function makeFw(m) {
    const app = m.app, live = () => liveModule(m), mine = () => live() && shown?.id === "m:" + app;
    const closedSheet = () => ({ el: ui.el("dialog"), body: ui.el("div"), closed: true, close() {}, now() {}, push: () => ui.el("div"), pop() {}, setBusy() {} });
    return {
      contract: CONTRACT, app, screenEl: m.el, signal: m.controller.signal, ui,
      header: { set(spec = {}) { if (!live()) return; m.header = { ...m.header, ...spec }; if (mine()) F.header.set(appHead(F.route)); } },
      nav: {
        go: (path, o) => live() && F.nav.go(path, { from: app, replace: !!o?.replace, kind: KINDS.includes(o?.kind) ? o.kind : null }), back: () => live() && F.nav.back(),
        section: (id, o) => live() && F.nav.section(app, id, o), href: (k, arg = null) => format({ app, key: k, arg }), depth: () => curDepth(),
      },
      sheet: { open: (spec) => live() ? F.sheet.open({ app, ...spec }) : closedSheet() },
      toast: (text, o) => { if (live()) return toast(text, { ...o, app }); },
      send: (spec) => live() ? F.send.send(spec) : Promise.resolve(false),
      sendButton: (spec) => ui.btn("Send", { icon: "send", act: "send", label: `Send ${spec.what || "this"} to a friend`, run: () => live() && F.send.send(typeof spec === "function" ? spec() : spec) }),
      search: {
        provide(p) {
          if (!live()) return () => {};
          provs[app]?.(); delete provs[app];
          const off = F.search.provide(p);
          const drop = () => { off(); m.provs = m.provs.filter((f) => f !== drop); providers(); };
          m.provs.push(drop);
          return drop;
        },
      },
      changed: () => { if (live()) T(() => opts.changed?.(app)); },
      session: { get user() { const u = live() ? sess().view?.user || {} : {}; return { id: u.id ?? null, name: u.name ?? null }; }, lost: () => live() ? lost() : Promise.resolve(false), hubAgain: () => live() ? F.hubAgain() : Promise.resolve() },
      visible: () => live() && doc.visibilityState === "visible",
      on(ev, fn) {
        if (!live()) return () => {};
        const off = F.on(ev === "push" ? "push:" + app : ev, (x) => { if (live()) fn(x); });
        const drop = () => { off(); m.offs = m.offs.filter((f) => f !== drop); };
        m.offs.push(drop); return drop;
      },
      theme: () => themeNow(),
      motion: () => (reduced() ? "reduced" : "full"),
      zoomTarget: () => dropClone(m),
      fill(v) { if (mine()) F.fill(v); },
      lazy(fn) {
        if (!live()) return Promise.reject(released());
        if (stale && !F.busy()) { reloadStale(); return new Promise(() => {}); }
        if (Date.now() - (lazyAt[app] || 0) > 60e3) { lazyAt[app] = Date.now(); version(m); }
        let p;
        try { p = Promise.resolve(fn(fails[app] ? `?retry=${fails[app]}` : "")); } catch (e) { p = Promise.reject(e); }
        return p.then((x) => { if (!live()) throw released(); return x; }, (e) => { if (!live()) throw released(); fails[app] = (fails[app] || 0) + 1; version(m, true); throw e; });
      },
      stale: () => stale,
      service: () => live() ? svc(app).then((s) => { if (!live()) throw released(); return s; }) : Promise.reject(released()),
      tabs: { away: (v) => { if (live()) F.tabs.away(!!v && mine()); }, badge: (n) => { if (live()) F.tabs.badge(REGISTRY[app].tab, n); } },
    };
  }
  const themeNow = () => /^(light|dark)$/.test(html.dataset.theme) ? html.dataset.theme : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  // /<app>/version, asked for fw.lazy (C7): a build other than the mounted one's makes the page stale; on a failed import,
  // that reload at the route once nothing is unsaved
  function version(m, failed) {
    if (!liveModule(m)) return;
    const b = m.build;
    fetch(`${REGISTRY[m.app].path}version`, { cache: "no-store", credentials: "same-origin", signal: m.controller.signal }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!liveModule(m)) return;
      if (!j?.build || b == null || String(j.build) === String(b)) return;
      stale = true;
      if (failed) safely(reloadStale, 1 / 0);
    }, () => {});
  }
  // the connectors' search providers: one for each app that's on and whose module (if mounted) has none of its own
  // (Weather's is Places, s24 §6)
  const provs = {};
  function providers() {
    if (gone) return;
    const on = sess().apps;
    for (const a of Object.keys(REGISTRY)) {
      const want = on[a] && !mods[a]?.provs.length;
      if (!want && provs[a]) { provs[a](); delete provs[a]; }
      else if (want && !provs[a]) {
        let off = null, dead = false;
        provs[a] = () => { dead = true; off?.(); };
        import("./connectors.js").then((c) => { if (!dead) off = c.connectorProvider(F, a); }, () => { if (provs[a] && !off) delete provs[a]; });
      }
    }
  }

  // ---- the pieces
  F.header = createHeader(opts.header, F, { me: opts.me, onMe: opts.onMe });
  F.tabs = createTabs(opts.tabs, F, { me: opts.me });
  F.sheet = createSheets(F);
  F.search = createSearch(F);
  F.send = createSend(F);
  for (const id of ["today", "apps", "you"]) if (opts[id]) F.screen(id, opts[id]);

  // ---- listeners
  // links: same-origin, ours, not modified, not a new window or a download, not a hash the host page keeps for itself
  on(doc, "click", (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.("a[href]");
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    const u = T(() => new URL(a.href, L.href));
    if (u?.origin !== L.origin) return;
    if ((u.pathname === "/" || u.pathname === "/index.html") && u.hash && !/^#(apps|you(=[\w-]*)?)?$/.test(u.hash)) return;
    const p = u.pathname + u.search + u.hash, r = parse(p, { roof: roofs() });
    if (!r) return;
    e.preventDefault();
    const card = r.kind === "app" ? a.closest(".tcard") : null;
    F.nav.go(p, { zoomFrom: card });
  });
  on(globalThis, "popstate", (e) => {
    if (gone) return;
    // (back or forward to a module that's been switched off since: Today drawn below, as stage 1 did; then, online, the
    // page as the server now has it (its hub page), once what's unsaved is saved (C7; none if something couldn't be)
    // and if still at that address)
    const any = parse(L.href, { roof: true });
    if (any?.kind === "app" && !isOn(any.app) && navigator.onLine !== false) {
      const at = L.href;
      F.flush().then((f) => !gone && !f.lost && L.href === at && safely(() => L.href === at && L.reload()));
    }
    F.sheet.closeAll();
    leaveEntry();
    const st = H.state?.ifl, was = depth;
    if (st && Number.isInteger(st.d)) { depth = st.d; key = String(st.k); }
    else { depth++; key = newKey(); stamp(); }
    const r = here();
    routes[depth] = r;
    render(r, { kind: depth < was ? "pop" : depth > was ? "push" : null, ua: !!e.hasUAVisualTransition });
  });
  // a notification tapped while this page is open (the root worker's { ifl: "route", url }, D10)
  on(navigator.serviceWorker, "message", (e) => {
    const d = e.data;
    if (d?.inflight === "sync") return emit("push:chats", { app: "chats", tag: typeof d.tag === "string" ? d.tag : null });
    if (!d || d.ifl !== "route" || !ownPath(d.url)) return;
    T(() => e.ports?.[0]?.postMessage({ ifl: "routed" }));
    F.nav.go(d.url, { from: "notification" });
  });
  let hiddenAt = 0;
  on(doc, "visibilitychange", () => {
    if (doc.visibilityState === "hidden") { stopMotion(true); hiddenAt = Date.now(); return emit("hidden"); }
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (stale && away >= 60e3 && !F.busy()) return reloadStale();
    emit("visible");
  });
  on(globalThis, "pagehide", () => {
    ss("ifl-roof-y", JSON.stringify({ p: format(F.route), y: Math.round(scrollY) }));
  });
  on(globalThis, "pageshow", (e) => { if (e.persisted) emit("visible"); });
  const mq = matchMedia("(prefers-color-scheme: dark)"), themed = () => emit("theme", themeNow());
  on(mq, "change", themed);
  on(matchMedia("(prefers-reduced-motion: reduce)"), "change", () => { if (reduced()) stopMotion(true); });
  if (globalThis.MutationObserver) {
    const mo = new MutationObserver(themed);
    mo.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    offs.push(() => mo.disconnect());
  }
  // edge-swipe Back, from the left 20 px, only on the Home Screen (D19)
  const standalone = () => T(() => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches, false);
  let sw0 = null;
  on(doc, "touchstart", (e) => {
    const t = e.touches[0];
    sw0 = e.touches.length === 1 && t.clientX <= 20 && standalone() && !e.target.closest?.("[data-no-edge], dialog") && (shownMod() || curDepth() > 0) ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  on(doc, "touchend", (e) => {
    const t = e.changedTouches[0], s = sw0;
    sw0 = null;
    if (s && t.clientX - s.x > 70 && Math.abs(t.clientY - s.y) < 60) F.nav.back();
  }, { passive: true });

  // ---- the first render (no transition, no focus move), and where you were across a round trip (D20)
  const r0 = here();
  routes[depth] = r0;
  render(r0, { first: true });
  // (after first paint, and again each frame for a while as the screen fills in)
  const kept = T(() => JSON.parse(sessionStorage.getItem("ifl-roof-y")), null), y0 = kept?.y;
  T(() => sessionStorage.removeItem("ifl-roof-y"));
  let n = 0;
  const keptKey = key;
  const tryY = () => { if (gone || F.route !== r0 || key !== keptKey) return; scrollTo(0, y0); ys.set(key, y0); if (Math.abs(scrollY - y0) > 2 && ++n < 90) requestAnimationFrame(tryY); };
  if (kept?.p === format(F.route) && y0 > 0) requestAnimationFrame(tryY);
  (globalThis.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => providers());
  return F;
}
