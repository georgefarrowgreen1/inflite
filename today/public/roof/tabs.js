// InFlite's tab bar (One roof, spec §3.6, D18): one persistent nav#tabs.ifl-tabs.has-pill, the same markup as the shared
// block's IFL.hub.tabs (a.ifl-tab[data-tab] with its glyphs; degraded, Chats is Chat's own address), so menu.css styles it
// as on every hub page, plus a sliding pill (.ifl-tab-pill, aria-hidden) in menu.css's tab colour; roof.css turns off the
// static pill under it.
// createTabs(nav, F) → Tabs = { el, set(current), refresh(), destroy(), away(on), badge(tab, n) }
//   current: "today" | "apps" | "you" | "chats"; on a tab screen its tab has aria-current="page"; in an app (current
//   "apps" with F.route an app route) Apps has aria-current="true" (the page is the app's). An app that's a tab screen
//   (REGISTRY tab: Chats, while F.session.apps.chats) gives its own tab as current, in every route of it.
//   Taps: your own tab on a tab screen (Chats: on its list) → to the top; Apps from inside an app → back, when the entry
//   before is Apps, else a push of /#apps with a pop transition; any other of Today, Apps, You, and Chats while it's in
//   this page → F.nav.go (a tab). Chats otherwise navigates.
//   away(on): the bar out of the way (.away), as a chat's composer is up (stage 3, S3-C4); badge(tab, n): a count on that
//   tab (.ifl-tab-badge; a number only, none for 0). While Chats is in this page, the bar takes InFlite's indigo (.chats,
//   roof.css; S3-D16).
import { REGISTRY } from "./router.js";
import { el } from "./ui.js";

const TAB_SCREENS = ["today", "apps", "you"];
export function createTabs(nav, F, { me: meOf } = {}) {
  const IFL = globalThis.IFL;
  if (!nav || !IFL?.hub) return { el: nav || null, set() {}, refresh() {}, destroy() {}, away() {}, badge() {} };
  let current = null, built = null;
  const counts = {}, chats = () => !!F?.session?.apps?.chats;
  const pill = document.createElement("span");
  pill.className = "ifl-tab-pill"; pill.setAttribute("aria-hidden", "true");
  function build() {
    const on = IFL.hub.on;
    if (on) IFL.hub.tabs(nav, current);
    else nav.replaceChildren();
    built = IFL.hub.degraded;
    nav.classList.add("ifl-tabs", "has-pill");
    nav.prepend(pill);
    railKey = null;
    if (on) rail();
  }
  // On a computer (from 1100 px, roof.css) the bar is a rail down the left: InFlite's name at its head, the four tabs
  // (each with its key, 1–4), the apps in this page under them (each a way into it), and you at its foot (to You). All
  // of it is in the bar at every width and shown only there (.ifl-rail-x): on a phone the bar is as it was.
  const RAIL_APPS = ["weather", "fitness", "markets", "mail"];
  let railKey = null;
  const mk = (tag, cls, text, attrs) => el(tag, { class: cls, text, ...attrs });
  // (Mail is the site admin's alone: listed only where the account's view says it's theirs, as Apps and You do)
  const yours = (a) => a !== "mail" || F?.session?.view?.apps?.mail === true;
  function rail() {
    const apps = RAIL_APPS.filter((a) => F?.session?.apps?.[a] && REGISTRY[a] && yours(a));
    const user = F?.session?.view?.user || {};
    const k = JSON.stringify([apps, user.name || "", !!IFL.hub.degraded]);
    if (k === railKey && nav.querySelector(".ifl-rail-brand")) return;
    railKey = k;
    for (const x of nav.querySelectorAll(".ifl-rail-x")) x.remove();
    const brand = mk("span", "ifl-rail-x ifl-rail-brand");
    const logo = mk("img", "ifl-rail-logo", null, { src: "/icon.svg", alt: "", width: 28, height: 28 });
    brand.append(logo, mk("span", "", "InFlite"));
    pill.after(brand);
    const keys = { today: "1", chats: "2", apps: "3", you: "4" };
    for (const a of nav.querySelectorAll(".ifl-tab")) {
      const n = keys[a.dataset.tab];
      if (n && !a.querySelector(".ifl-tab-k")) { const s = mk("kbd", "ifl-rail-x ifl-tab-k", n); s.setAttribute("aria-hidden", "true"); a.append(s); }
    }
    const extra = [];
    if (apps.length) extra.push(mk("span", "ifl-rail-x ifl-rail-h", "Your Apps"));
    for (const app of apps) {
      const R = REGISTRY[app], a = mk("a", "ifl-rail-x ifl-rail-app", null, { href: R.path, "data-app": app });
      const img = mk("img", "ifl-rail-ic", null, { src: `/apps/${app}.svg`, alt: "", width: 24, height: 24 });
      a.append(img, mk("span", "ifl-tab-l", R.name));
      extra.push(a);
    }
    const me = mk("a", "ifl-rail-x ifl-rail-me", null, { href: "/#you", "data-me": "1" });
    const ph = mk("span", "ifl-rail-ph");
    const node = (() => { try { return meOf?.(); } catch (_) { return null; } })();
    if (node) ph.append(node);
    else ph.textContent = (user.name || "?").trim().charAt(0).toUpperCase();
    const tx = mk("span", "ifl-rail-who");
    tx.append(mk("b", "", user.name || "You"), mk("small", "", "Your account"));
    me.append(ph, tx);
    extra.push(me);
    nav.append(...extra);
  }
  const inApp = () => F?.route?.kind === "app";
  function set(c) {
    current = c;
    if (built !== IFL.hub.degraded || !nav.querySelector(".ifl-tab")) build();
    else if (IFL.hub.on) rail();
    const app = inApp() ? F.route.app : null;
    for (const a of nav.querySelectorAll(".ifl-rail-app")) {
      if (a.dataset.app === app) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
    nav.classList.toggle("in-app", !!nav.querySelector(".ifl-rail-app[aria-current]"));
    nav.classList.toggle("chats", chats());
    for (const a of nav.querySelectorAll(".ifl-tab")) {
      if (a.dataset.tab !== c) a.removeAttribute("aria-current");
      else a.setAttribute("aria-current", c === "apps" && inApp() ? "true" : "page");
      const n = counts[a.dataset.tab];
      let b = a.querySelector(".ifl-tab-badge");
      if (!n) b?.remove();
      else (b ||= a.appendChild(Object.assign(document.createElement("span"), { className: "ifl-tab-badge" }))).textContent = n > 99 ? "99+" : String(n);
    }
    place();
  }
  // (on the rail the pill slides up and down, and sits on the app you're in rather than on Apps)
  const railNow = () => matchMedia("(min-width: 1100px)").matches;
  function place() {
    const a = (railNow() && nav.querySelector(".ifl-rail-app[aria-current]")) || nav.querySelector(".ifl-tab[aria-current]");
    pill.hidden = !a;
    if (!a) return;
    pill.style.setProperty("--px", `${a.offsetLeft}px`);
    pill.style.setProperty("--pw", `${a.offsetWidth}px`);
    pill.style.setProperty("--py", `${a.offsetTop}px`);
    pill.style.setProperty("--ph", `${a.offsetHeight}px`);
  }
  function click(e) {
    const r0 = e.target.closest?.("a.ifl-rail-app, a.ifl-rail-me");
    if (r0 && F?.nav && !(e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
      e.preventDefault();
      if (r0.dataset.me) return F.nav.go("/#you", { kind: "tab" });
      if (F.route?.kind === "app" && F.route.app === r0.dataset.app) return scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return F.nav.go(r0.getAttribute("href"), { kind: "tab" });
    }
    const a = e.target.closest?.("a.ifl-tab");
    const k = a?.dataset.tab;
    if (!a || !(TAB_SCREENS.includes(k) || (k === "chats" && chats())) || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!F?.nav) return;
    e.preventDefault();
    const r = F.route;
    if (k === "chats" ? current === k && r?.key === k : r?.kind === "tab" && r.tab === k && !r.arg) return scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    if (k === "apps" && r?.kind === "app" && current === "apps") {
      const prev = F.nav.prev?.();
      if (prev?.kind === "tab" && prev.tab === "apps") return history.back();
      return F.nav.go("/#apps", { kind: "pop" });
    }
    F.nav.go(k === "today" ? "/" : k === "chats" ? "/chats/" : `/#${k}`, { kind: "tab" });
  }
  nav.addEventListener("click", click);
  addEventListener("resize", place);
  // Keys, with a keyboard (a computer's, or one on a tablet): 1–4 the tabs (Today, Chats, Apps, You), "/" search. Not
  // while you're typing, a sheet's open, or with a modifier held.
  const TAB_KEYS = { 1: "today", 2: "chats", 3: "apps", 4: "you" };
  function key(e) {
    if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || nav.inert || !IFL.hub.on) return;
    const t = e.target;
    if (t?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false]), dialog")) return;
    if (F?.busy?.() || document.querySelector("dialog[open]")) return;
    if (e.key === "/" && F?.search?.open) { e.preventDefault(); F.search.open(); return; }
    const k = TAB_KEYS[e.key];
    if (!k || e.shiftKey) return;
    const a = nav.querySelector(`a.ifl-tab[data-tab="${k}"]`);
    if (a) { e.preventDefault(); a.click(); }
  }
  addEventListener("keydown", key);
  document.fonts?.ready?.then(place, () => {});
  build();
  const away = (v) => { nav.inert = nav.classList.toggle("away", !!v); };
  const badge = (t, n) => { if (!t) return; n = Math.max(0, Math.floor(Number(n)) || 0); if (counts[t] === n) return; counts[t] = n; set(current); };
  return { el: nav, set, away, badge, refresh: () => { build(); set(current); }, destroy() { nav.removeEventListener("click", click); removeEventListener("resize", place); removeEventListener("keydown", key); } };
}
