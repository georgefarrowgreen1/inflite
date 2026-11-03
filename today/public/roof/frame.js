// InFlite's frame (One roof, spec §3.2, §3.4, §3.7, §3.15, D2–D3, D6, D14, D19–D22): the one page every screen of the
// framework lives in. Statically imported by Today's app.js, which makes it once it knows you're signed in.
//
// createFrame(opts) → F. opts (from app.js):
//   { root: #in, header: #hd, views: #views, tabs: #tabs,
//     session: () => ({ view, hub, roof, links }),   // hub, roof: booleans (D14: roof = j.roof === true); links: IFL's
//     lost: signedOutNow, checkSession: () => Promise<boolean signedIn>, hubAgain: () => Promise<void> (D14 re-ask),
//     save: () => ({ y, … }) (D21's reload writes ifl-here:today from it), onMe: (button) => openMenu (D24),
//     me: () => Node (your photo), today: ScreenSpec, apps: ScreenSpec, you: ScreenSpec }
//   ScreenSpec = { el, title(), crumb(), line(), acts: [{ icon, label, run }] (or a function giving them),
//                  onShow(route), onHide() }
//
// F (§3.2):
//   F.screen(id, spec)                     a built-in screen "today" | "apps" | "you" (again: replaced, header redrawn)
//   F.nav.go(path, { replace, zoomFrom, from, kind })   in-page if router.owns(path) (not while F.stale into an app:
//                                          then location.assign, D21), else IFL.hub.go(path) (the crumb) + location.assign
//   F.nav.back()                           the Back rule, §3.4
//   F.nav.section(app, id, { arg })        replaceState to router.format({ app, section: id, arg }); header follows
//   F.nav.prev() → Route | null            the route of the entry before this one, as this page pushed it (§3.6)
//   F.route                                the current Route
//   F.header, F.tabs, F.sheet, F.toast, F.search, F.send, F.ui
//   F.session                              { view, hub, roof, links, lost() → Promise<boolean> } (D3)
//   F.setRoof(bool)                        D14, from app.js when /api/hub answers differently
//   F.restamp()                            re-writes a missing history.state.ifl (RI1)
//   F.stale                                boolean, D21 (set by modules.js watchVersion)
//   F.fill(on)                             D20 (html.ifl-fill)
//   F.on(evt, fn) → off                    "route", "visible", "hidden", "theme", "signedout"
//   F.busy() → boolean                     a sheet open, or the shown module's busy()
//   F.refresh()                            the shown tab screen's header asked for again (its title, crumb, line, acts)
//   F.hubAgain() → Promise                 opts.hubAgain (modules.js asks before loading a module)
//   F.forModule(app) → fw                  §5.2, below
//   F.destroy()                            sign-out: unmount modules, close sheets, hide the frame, let go of listeners
//
// fw = F.forModule(app) (§5.2), what a module gets in mount(root, fw):
//   fw.contract = 1; fw.app; fw.screenEl (main#m-<app>)
//   fw.ui                                  ui.js's builders
//   fw.header.set({ title, compactTitle, pick, line, acts, badges })   merged into what it set before; shown only while
//     its screen shows (the frame fills back, crumb, sections and the section). pick: { label, run } | null;
//     acts: [{ icon, label, run }] (data-act = icon); badges: { [sectionId]: n }
//   fw.nav.go(path), fw.nav.back(), fw.nav.section(id, { arg }), fw.nav.href(key, arg) → router.format({ app, key, arg })
//   fw.sheet.open(spec) → Handle           sheet.js, accent = the app
//   fw.toast(text, opts)
//   fw.send({ words, packed, what }), fw.sendButton({ words, packed, what }) → Element
//   fw.search.provide(provider) → off      replaces the Places provider while mounted
//   fw.session = { user: { id, name }, lost() → Promise<boolean> }   true: signed out (confirmed); false: still in
//   fw.visible() → boolean; fw.on("visible" | "hidden" | "theme", fn) → off (let go of at unmount)
//   fw.theme() → "light" | "dark"; fw.motion() → "full" | "reduced"
//   fw.zoomTarget(el)                      the module's hero is in: the frame drops the card's clone
//   fw.fill(on)                            D20
//   fw.lazy(() => import(…)) → Promise; fw.stale() → boolean        D21: every dynamic import in a module goes here
//
// History state the frame writes: { ifl: { d: depth, k: key } }, kept with whatever else the entry holds. Scroll is
// kept per entry and per app section in memory; sessionStorage["ifl-roof-y"] = { p: formatted route, y } on pagehide.
import { REGISTRY, parse, format, owns, ownPath } from "./router.js";
import { createHeader } from "./header.js";
import { createTabs } from "./tabs.js";
import { createSheets } from "./sheet.js";
import { toast } from "./toast.js";
import * as ui from "./ui.js";
import { createSearch } from "./search.js";
import { createSend } from "./send.js";

export const CONTRACT = 1;
const TABN = { today: "Today", apps: "Apps", you: "You" };
const TODAY = { kind: "tab", tab: "today", arg: null };
const T = (f, d) => { try { return f(); } catch (_) { return d; } };
const ss = (k, v) => T(() => sessionStorage.setItem(k, v));
const val = (x) => (typeof x === "function" ? x() : x);

export function createFrame(opts = {}) {
  const H = history, L = location, doc = document, html = doc.documentElement;
  const offs = [], subs = {}, screens = {}, mods = {};
  const on = (t, ev, fn, o) => { if (!t) return; t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
  const emit = (ev, x) => { for (const f of [...(subs[ev] || [])]) try { f(x); } catch (e) { console.error(e); } };
  const sess = () => ({ view: null, hub: false, roof: false, links: {}, ...(opts.session?.() || {}) });
  const roofOn = () => { const s = sess(); return !!(s.hub && s.roof); };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const newKey = () => Math.random().toString(36).slice(2, 10);
  const ys = new Map(), backTo = new Map();
  let depth = 0, key = "", routes = [], stale = false, gone = false, shown = null, lastRoof = roofOn(), placesOff = null;

  const put = (p, push, s) => T(() => H[push ? "pushState" : "replaceState"]({ ...s, ifl: { d: depth, k: key } }, "", p));
  const stamp = () => put(L.href, 0, typeof H.state == "object" && H.state);
  const st0 = H.state?.ifl;
  if (st0 && Number.isInteger(st0.d)) { depth = st0.d; key = String(st0.k || newKey()); } else { key = newKey(); stamp(); }
  H.scrollRestoration = "manual";
  const curDepth = () => (Number.isInteger(H.state?.ifl?.d) ? H.state.ifl.d : depth);
  const here = () => parse(L.href, { roof: roofOn() }) || TODAY;

  // ---- the session, and lost() (D3): asks once, shared for 30 s; signs out only on a confirmed "signed out"
  let lostP = null, lostAt = 0;
  const lost = () => lostP && Date.now() - lostAt < 30e3 ? lostP
    : (lostAt = Date.now(), lostP = Promise.resolve().then(() => opts.checkSession?.()).catch(() => true).then((inn) => inn === false && (T(() => opts.lost?.()), true)));

  // D21: the page reloaded at its route, where you were kept the way the shared updater keeps it
  const reloadStale = () => {
    ss("ifl-here:today", JSON.stringify({ at: T(() => opts.save?.()) ?? null, t: Date.now() }));
    L.reload();
  };

  const F = {
    route: null,
    ui, toast,
    get session() { return { ...sess(), lost }; },
    get stale() { return stale; },
    set stale(v) { stale = !!v; },
    on(ev, fn) { (subs[ev] ||= []).push(fn); return () => { subs[ev] = (subs[ev] || []).filter((f) => f !== fn); }; },
    hubAgain: () => Promise.resolve(opts.hubAgain?.()).catch(() => {}),
    busy: () => !!F.sheet.top() || !!(shownMod()?.instance?.busy?.()),
    restamp() { if (!H.state?.ifl) stamp(); },
    fill(v) { html.classList.toggle("ifl-fill", !!v); F.header.compact?.(); },
    screen(id, spec = {}) {
      const was = screens[id];
      const el = spec.el || doc.getElementById(id);
      if (el) { el.classList.add("ifl-screen"); el.dataset.app = "inflite"; }
      screens[id] = { el, spec };
      if (shown?.id === id) {
        if (!was?.el && el) render(F.route, { kind: null, again: true });
        else F.header.set(tabHead(spec, F.route));
      } else if (el && shown) { el.hidden = true; el.inert = true; }
    },
    refresh() { const s = shown && screens[shown.id]; if (s) F.header.set(tabHead(s.spec, F.route)); },
    setRoof(v) {
      v = !!v;
      if (v === lastRoof) return;
      lastRoof = v;
      if (v) return places();
      const inApp = shown?.id.startsWith("m:");
      for (const a of Object.keys(mods)) unmount(a);
      placesOff?.(); placesOff = null;
      if (inApp) {
        ss("ifl-roof-bounce", "1");
        put(L.pathname + L.hash);
        L.reload();
      }
    },
    forModule: (app) => modOf(app).fw,
    destroy() {
      if (gone) return;
      for (const a of Object.keys(mods)) unmount(a);
      F.sheet.closeAll();
      placesOff?.();
      for (const f of offs.splice(0)) f();
      F.header.destroy?.(); F.tabs.destroy?.();
      gone = true;
      html.classList.remove("ifl-fill");
      html.dataset.app = "inflite";
      delete html.dataset.route; delete html.dataset.vt;
      if (opts.root) opts.root.hidden = true;
      emit("signedout");
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
      const r = parse(p, { roof: roofOn() });
      if (!r) return L.assign(globalThis.IFL?.hub?.go ? globalThis.IFL.hub.go(p) : p);
      if (r.kind === "app" && stale && shown?.id !== "m:" + r.app) return L.assign(p);
      const cur = shown?.route;
      const zoom = o.zoomFrom && r.kind === "app" && !reduced() ? o.zoomFrom : null;
      const kind = o.kind || (zoom ? "zoom" : r.kind === "tab" && cur?.kind === "tab" ? "tab" : "push");
      leaveEntry();
      F.restamp();
      if (!o.replace) { depth++; key = newKey(); routes.length = depth; }
      put(p, !o.replace);
      routes[depth] = r;
      render(r, { kind, zoomFrom: zoom, hint: o.zoomFrom ? hintOf(o.zoomFrom, u) : null, y: o.replace && shown?.id === idOf(r) ? scrollY : 0 });
    },
    back() {
      const top = F.sheet.top();
      if (top) return top.close();
      if (shownMod()?.instance?.back?.()) return;
      if (curDepth() > 0) return H.back();
      F.nav.go("/#apps", { replace: true, kind: "pop" });
    },
    section(app, id, { arg = null } = {}) {
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
      const y = ys.get(`${key}:${id}`) || 0;
      F.route = r; shown.route = r;
      html.dataset.route = format(r);
      transition("section", () => {
        html.classList.remove("ifl-fill");
        F.header.set(appHead(r));
        m.root.setAttribute("aria-labelledby", `ifl-sec-${id}`);
        scrollTo(0, y);
        const sh = () => F.route === r && m.instance?.show(r, null);
        Promise.resolve(m.instance ? sh() : m.loading?.then(sh)).then(() => { if (F.route === r && y) scrollTo(0, y); }, (e) => console.error(e));
        return m.el;
      });
      emit("route", r);
    },
    prev: () => routes[curDepth() - 1] || null,
  };

  const idOf = (r) => (r.kind === "app" ? "m:" + r.app : r.tab);
  const shownMod = () => (shown?.id.startsWith("m:") ? mods[shown.id.slice(2)] : null);
  const labelOf = (r) => (r?.kind === "app" ? REGISTRY[r.app]?.name : TABN[r?.tab]) || null;
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
    const to = d > 0 ? labelOf(routes[d - 1]) : "Apps";
    return {
      ...h, back: { label: to ? `Back to ${to}` : "Back" }, crumb: { text: R.name, app: r.app }, title: h.title ?? R.name,
      sections: R.sections, section: r.section, onSection: (id) => F.nav.section(r.app, id),
    };
  }
  // what the tapped card says, for the module's first paint (§2.3): { sky, temp, place }
  const hintOf = (card, u) => ({
    sky: /(?:^|\s)wx-sk-([\w-]+)/.exec(card.className)?.[1] || null,
    temp: card.querySelector(".wx-now .t")?.textContent.trim() || null,
    place: u.searchParams.get("name") || card.querySelector(".tc-meta")?.textContent.split(" · ")[0].trim() || null,
  });

  // ---- showing a route
  function render(r, o = {}) {
    r ||= TODAY;
    const id = idOf(r), prev = shown, same = prev?.id === id;
    if (r.kind === "app" && stale && prev && !same) return reloadStale();
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
      F.tabs.set(r.kind === "app" ? "apps" : r.tab);
      const el = r.kind === "app" ? showApp(r, o) : showTab(r);
      const y = pop ? ys.get(r.kind === "app" ? `${k}:${r.section}` : k) ?? ys.get(k) ?? 0 : o.y || 0;
      if (!o.first) scrollTo(0, y);
      if (!o.first && !same) {
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
      m.loading = import("./modules.js").then((M) => M.loadModule(r.app, F)).then(({ instance }) => { m.instance = instance; }, (e) => { console.error(e); }).finally(() => { m.loading = null; });
    }
    Promise.resolve(m.loading).then(() => {
      if (F.route !== r || !m.instance) return dropClone(m);
      return Promise.resolve(m.instance.show(r, o.hint || null)).then(() => {
        dropClone(m);
        if (F.route !== r) return;
        if (o.y && Math.abs(scrollY - o.y) > 2) scrollTo(0, o.y);
        tidy(r);
      });
    }).catch((e) => { console.error(e); dropClone(m); });
    return m.el;
  }
  // D6: once a deep link is shown, the address is the section's own (no query, no sheet key)
  function tidy(r) {
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
    if (!kind || o.ua) { change(); return; }
    const k = reduced() ? "fade" : kind;
    if (typeof doc.startViewTransition === "function" && doc.visibilityState === "visible") {
      html.dataset.vt = k;
      const z = k === "zoom" ? o.zoomFrom : null;
      z?.classList.add("ifl-vt-zoom");
      let t;
      try { t = doc.startViewTransition(() => { z?.classList.remove("ifl-vt-zoom"); change(); }); } catch (_) { z?.classList.remove("ifl-vt-zoom"); delete html.dataset.vt; change(); return; }
      for (const p of ["ready", "updateCallbackDone"]) t[p]?.catch?.(() => {});
      t.finished.catch(() => {}).finally(() => { if (html.dataset.vt === k) delete html.dataset.vt; z?.classList.remove("ifl-vt-zoom"); doc.querySelector(".ifl-zoom-slot .ifl-vt-zoom")?.classList.remove("ifl-vt-zoom"); });
      return;
    }
    const el = change();
    if (!el || k === "zoom") return;
    const c = `ifl-enter-${k}`;
    el.classList.add(c);
    const done = () => el.classList.remove(c);
    el.addEventListener("animationend", done, { once: true });
    setTimeout(done, 600);
  }

  // ---- modules' screens, and what each module gets
  function modOf(app) {
    if (mods[app]) return mods[app];
    const el = ui.el("main", { id: `m-${app}`, class: "view ifl-screen", data: { app }, hidden: true });
    el.inert = true;
    const root = ui.el("div", { class: `m-${app}`, role: "tabpanel" });
    el.append(root);
    opts.views?.append(el);
    const m = (mods[app] = { app, el, root, instance: null, loading: null, header: {}, offs: [], provs: [], slot: null });
    m.fw = makeFw(m);
    return m;
  }
  function unmount(app) {
    const m = mods[app];
    if (!m) return;
    try { m.instance?.unmount?.(); } catch (e) { console.error(e); }
    for (const f of m.offs.splice(0)) f();
    for (const f of m.provs.splice(0)) f();
    m.el.remove();
    delete mods[app];
  }
  function makeFw(m) {
    const app = m.app, mine = () => shown?.id === "m:" + app;
    return {
      contract: CONTRACT, app, screenEl: m.el, ui,
      header: { set(spec = {}) { m.header = { ...m.header, ...spec }; if (mine()) F.header.set(appHead(F.route)); } },
      nav: {
        go: (path) => F.nav.go(path, { from: app }), back: () => F.nav.back(),
        section: (id, o) => F.nav.section(app, id, o), href: (k, arg = null) => format({ app, key: k, arg }),
      },
      sheet: { open: (spec) => F.sheet.open({ app, ...spec }) },
      toast: (text, o) => toast(text, { ...o, app }),
      send: (spec) => F.send.send(spec),
      sendButton: (spec) => F.send.button(spec),
      search: {
        provide(p) {
          placesOff?.(); placesOff = null;
          const off = F.search.provide(p);
          const drop = () => { off(); m.provs = m.provs.filter((f) => f !== drop); if (!Object.values(mods).some((x) => x.provs.length)) places(); };
          m.provs.push(drop);
          return drop;
        },
      },
      session: { get user() { const u = sess().view?.user || {}; return { id: u.id ?? null, name: u.name ?? null }; }, lost },
      visible: () => doc.visibilityState === "visible",
      on(ev, fn) { const off = F.on(ev, fn); m.offs.push(off); return off; },
      theme: () => themeNow(),
      motion: () => (reduced() ? "reduced" : "full"),
      zoomTarget: () => dropClone(m),
      fill(v) { if (mine()) F.fill(v); },
      lazy(fn) {
        if (stale) { reloadStale(); return new Promise(() => {}); }
        try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); }
      },
      stale: () => stale,
    };
  }
  const themeNow = () => /^(light|dark)$/.test(html.dataset.theme) ? html.dataset.theme : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  // the Places search provider, while hub and roof are on and no module has its own (§3.10)
  function places() {
    if (gone || placesOff || !roofOn() || Object.values(mods).some((m) => m.provs.length)) return;
    placesOff = () => {};
    import("./connectors.js").then((c) => {
      if (gone || !roofOn() || Object.values(mods).some((m) => m.provs.length)) { placesOff = null; return; }
      placesOff = c.placesProvider(F);
    }, () => { placesOff = null; });
  }

  // ---- the pieces
  F.header = createHeader(opts.header, F, { me: opts.me, onMe: opts.onMe });
  F.tabs = createTabs(opts.tabs, F);
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
    const p = u.pathname + u.search + u.hash, r = parse(p, { roof: roofOn() });
    if (!r) return;
    e.preventDefault();
    const card = r.kind === "app" ? a.closest(".tcard") : null;
    F.nav.go(p, { zoomFrom: card });
  });
  on(globalThis, "popstate", (e) => {
    if (gone) return;
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
    if (!d || d.ifl !== "route" || !ownPath(d.url)) return;
    T(() => e.ports?.[0]?.postMessage({ ifl: "routed" }));
    F.nav.go(d.url, { from: "notification" });
  });
  let hiddenAt = 0;
  on(doc, "visibilitychange", () => {
    if (doc.visibilityState === "hidden") { hiddenAt = Date.now(); return emit("hidden"); }
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (stale && away >= 60e3 && !F.sheet.top()) return reloadStale();
    emit("visible");
  });
  on(globalThis, "pagehide", () => {
    ss("ifl-roof-y", JSON.stringify({ p: format(F.route), y: Math.round(scrollY) }));
  });
  on(globalThis, "pageshow", (e) => { if (e.persisted) emit("visible"); });
  const mq = matchMedia("(prefers-color-scheme: dark)"), themed = () => emit("theme", themeNow());
  on(mq, "change", themed);
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
  const tryY = () => { scrollTo(0, y0); ys.set(key, y0); if (!gone && Math.abs(scrollY - y0) > 2 && ++n < 90) requestAnimationFrame(tryY); };
  if (kept?.p === format(F.route) && y0 > 0) requestAnimationFrame(tryY);
  (globalThis.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => places());
  return F;
}
