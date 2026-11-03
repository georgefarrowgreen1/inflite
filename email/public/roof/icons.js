// Mail's own icons under the roof (One roof stage 4, s4/spec §4.1, BI12): built by createElementNS from constant path
// data (no innerHTML), ≤ 2 KB; the framework's ui.icon has the rest. No glyph is added to InFlite's shared menu.
// B0-b's stub (STUB = true): icon(name) and NAMES are frozen; MM draws them.
//   icon(name) → SVGElement (aria-hidden, currentColor), name one of NAMES; an unknown name gives an empty svg.
export const STUB = true;
export const NAMES = ["done", "reply", "reply-all", "forward", "flag", "trash", "attachment", "more", "later"];
export function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.dataset.icon = NAMES.includes(name) ? name : "";
  return svg;
}
