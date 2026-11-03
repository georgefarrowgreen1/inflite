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
const TAB_SCREENS = ["today", "apps", "you"];
export function createTabs(nav, F) {
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
  }
  const inApp = () => F?.route?.kind === "app";
  function set(c) {
    current = c;
    if (built !== IFL.hub.degraded || !nav.querySelector(".ifl-tab")) build();
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
  document.fonts?.ready?.then(place, () => {});
  build();
  const away = (v) => nav.classList.toggle("away", !!v);
  const badge = (t, n) => { if (!t) return; n = Math.max(0, Math.floor(Number(n)) || 0); if (counts[t] === n) return; counts[t] = n; set(current); };
  return { el: nav, set, away, badge, refresh: () => { build(); set(current); }, destroy() { nav.removeEventListener("click", click); removeEventListener("resize", place); } };
}
