// InFlite's components (spec §3.13): builders that return elements, never HTML strings with data in them. B0's stub
// (STUB = true) with the final export names and their contract; FW writes the real ones (and their CSS in roof.css).
// Rules for the real ones: every string from data goes in through textContent (or esc() where a string is unavoidable);
// no style attribute and no inline handler, ever (the page's CSP refuses both; roofui.test scans for them): a figure a
// drawing needs is el.style.setProperty("--x", v) or a data-* read by CSS. Every builder takes plain data and returns
// an Element whose root carries its ifl-* class.
//
// The signatures every batch builds on (FW may add options, never rename or reorder these):
//   el(tag, attrs?, ...children) → Element
//       attrs: { class, text (textContent), html: never, data: { k: v } → data-k, aria: { k: v } → aria-k, on: { evt: fn }
//       (addEventListener), any other key → setAttribute (never "style", never on*) }; children: Node | string (a text
//       node) | array | null/false (skipped).
//   esc(s) → string, HTML-escaped (& < > " ').
//   icon(name, { app, size }) → Element: an app's icon when app (16/24/64 px), else the shared glyph `name` (aria-hidden).
//   card({ kind: "hero"|"list"|null, tappable, href, run, label, title, body: Node|Node[], app }) → .ifl-card
//   list(rows: Node[], { label }) → .ifl-list (with an .ifl-label above when label)
//   row({ lead: Node | { icon } | { app } | { avatar } | { time }, title, sub, value, trail: "chevron"|"switch"|Node,
//        href, run, label, act }) → .ifl-row (an <a> with href, a <button> with run, else a <div>; act → data-act)
//   label(text) → .ifl-label
//   chip(text, { kind: "tag"|"action", tone, href, run, label }) → .ifl-chip
//   stats([[label, value, sub?], …]) → dl.ifl-stats
//   btn(text, { primary, small, destructive, icon, href, run, label, act }) → .ifl-btn (act → data-act)
//   iconBtn(icon, { label, run, filled, act }) → button.ifl-icon-btn with aria-label = label
//   seg([[value, label], …], current, onChange(value), { label }) → div.ifl-seg-sm[role=radiogroup] of
//        button[role=radio][data-value][aria-checked]; the element has .set(value)
//   sw(checked, onChange(bool), { label }) → label.ifl-switch around input[type=checkbox][role=switch]
//   field({ type, value, placeholder, label, onInput(value), onEnter(value) }) → .ifl-field with its <input>
//   tile({ app, name, href, mini: Node|null, chips: [{ text, href }] }) → a.ifl-tile[data-app]
//   mini(m) → Element for a Mini (connectors.js): { kind: "num-bars", num, bars: [0..100 ×5], label }
//        | { kind: "pct-spark", pct, spark?: number[] } (a shape, never amounts) | { kind: "num", num, label }
//   avatar(name, { photo }) → .ifl-avatar.av-c1…8 (hashed from name; photo over the initial)
//   badge(n, { label }) → .ifl-badge (aria-label = label)
//   empty({ title, body, acts }) → .ifl-empty
//   error({ title, body, acts: [{ label, act, run, primary }] }) → .ifl-error with a button[data-act=<act>] per act
//   skeleton(kind: "hero"|"card"|"rows"|"tile", n?) → .ifl-skeleton (aria-hidden)
export const STUB = true;
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
export function el() { return null; }
export function icon() { return null; }
export function card() { return null; }
export function list() { return null; }
export function row() { return null; }
export function label() { return null; }
export function chip() { return null; }
export function stats() { return null; }
export function btn() { return null; }
export function iconBtn() { return null; }
export function seg() { return null; }
export function sw() { return null; }
export function field() { return null; }
export function tile() { return null; }
export function mini() { return null; }
export function avatar() { return null; }
export function badge() { return null; }
export function empty() { return null; }
export function error() { return null; }
export function skeleton() { return null; }
