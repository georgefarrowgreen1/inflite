// InFlite's tab bar (spec §3.6): one persistent nav#tabs.ifl-tabs.has-pill, the same markup as IFL.hub.tabs plus a
// sliding pill in menu.css's tab colour. B0's stub; FW writes it.
// createTabs(nav, F) → Tabs = { el, set(current), destroy() }
//   current: "today" | "apps" | "you" (on an app screen, "apps": aria-current="true"; on a tab screen aria-current="page").
//   Hook: nav#tabs .ifl-tab[data-tab] (+ aria-current).
export const STUB = true;
export function createTabs(nav, F) {
  return { el: nav || null, set(current) {}, destroy() {} };
}
