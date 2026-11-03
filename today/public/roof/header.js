// InFlite's header (spec §3.5): one persistent element in #hd, row 1 from the shared block's IFL.header(), plus the
// crumb, Back and row 2 (the section switcher). B0's stub; FW writes it.
// createHeader(host, F) → Header = { el, set(spec), destroy() }
//   spec = { back: { label } | null, crumb: { text, app? }, title, compactTitle?, pick: { label, run } | null, line,
//            acts: [{ icon, label, run }], sections: [[id, label]] | null, section, badges?: { [sectionId]: n } }
//   Hooks (roofhooks.mjs): #hd h1.ifh-name, .ifh-pick, .ifh-crumb, .ifh-line, .ifl-back, .ifh-me, [data-act=search];
//   each act is a button.ifh-act with data-act=<its icon> and aria-label=<its label> (Search always first, then ≤ 2);
//   switcher [role=tablist] of [role=tab][data-sec][aria-selected], a badge .ifl-sec-badge (accessible name
//   "Warnings, 2 in force"). set() patches, never re-renders per tap.
export const STUB = true;
export function createHeader(host, F) {
  return { el: host || null, set(spec) {}, destroy() {} };
}
