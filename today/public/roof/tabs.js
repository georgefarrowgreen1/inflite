// InFlite's tab bar (One roof, spec §3.6, D18): one persistent nav#tabs.ifl-tabs.has-pill, the same markup as the shared
// block's IFL.hub.tabs (a.ifl-tab[data-tab] with its glyphs; degraded, Chats is Chat's own address), so menu.css styles it
// as on every hub page, plus a sliding pill (.ifl-tab-pill, aria-hidden) in menu.css's tab colour; roof.css turns off the
// static pill under it.
// createTabs(nav, F) → Tabs = { el, set(current), refresh(), destroy(), away(on), badge(app, n) } (away, badge: stage 3,
//   S3-C4; B0's inert stubs, HOST's to fill)
//   current: "today" | "apps" | "you" | "chats"; on a tab screen its tab has aria-current="page"; in an app (current
//   "apps" with F.route an app route) Apps has aria-current="true" (the page is the app's).
//   Taps: your own tab on a tab screen → to the top; Apps from inside an app → back, when the entry before is Apps,
//   else a push of /#apps with a pop transition; any other of Today, Apps, You → F.nav.go (a push). Chats navigates.
const TAB_SCREENS = ["today", "apps", "you"];
export function createTabs(nav, F) {
  const IFL = globalThis.IFL;
  if (!nav || !IFL?.hub) return { el: nav || null, set() {}, refresh() {}, destroy() {}, away() {}, badge() {} };
  let current = null, built = null;
  const pill = document.createElement("span");
  pill.className = "ifl-tab-pill"; pill.setAttribute("aria-hidden", "true");
  function build() {
    const on = IFL.hub.on;
    if (on) IFL.hub.tabs(nav, current);
    else nav.replaceChildren();
    built = IFL.hub.degraded;
    nav.classList.add("ifl-tabs", "has-pill");
    nav.prepend(pill);
  }
  const inApp = () => F?.route?.kind === "app";
  function set(c) {
    current = c;
    if (built !== IFL.hub.degraded || !nav.querySelector(".ifl-tab")) build();
    for (const a of nav.querySelectorAll(".ifl-tab")) {
      if (a.dataset.tab !== c) a.removeAttribute("aria-current");
      else a.setAttribute("aria-current", c === "apps" && inApp() ? "true" : "page");
    }
    place();
  }
  function place() {
    const a = nav.querySelector(".ifl-tab[aria-current]");
    pill.hidden = !a;
    if (!a) return;
    pill.style.setProperty("--px", `${a.offsetLeft}px`);
    pill.style.setProperty("--pw", `${a.offsetWidth}px`);
  }
  function click(e) {
    const a = e.target.closest?.("a.ifl-tab");
    const k = a?.dataset.tab;
    if (!a || !TAB_SCREENS.includes(k) || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!F?.nav) return;
    e.preventDefault();
    const r = F.route;
    if (r?.kind === "tab" && r.tab === k && !r.arg) return scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    if (k === "apps" && r?.kind === "app") {
      const prev = F.nav.prev?.();
      if (prev?.kind === "tab" && prev.tab === "apps") return history.back();
      return F.nav.go("/#apps", { kind: "pop" });
    }
    F.nav.go(k === "today" ? "/" : `/#${k}`, { kind: "tab" });
  }
  nav.addEventListener("click", click);
  addEventListener("resize", place);
  document.fonts?.ready?.then(place, () => {});
  build();
  return { el: nav, set, away() {}, badge() {}, refresh: () => { build(); set(current); }, destroy() { nav.removeEventListener("click", click); removeEventListener("resize", place); } };
}
