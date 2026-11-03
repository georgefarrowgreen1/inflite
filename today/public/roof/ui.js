// InFlite's components (One roof, spec §3.13): builders that return elements, never HTML strings with data in them.
// Every string from data goes in through textContent; no style attribute and no inline handler, ever (the page's CSP
// refuses both; roofui.test scans for them): a figure a drawing needs is el.style.setProperty("--x", v) or a data-*
// read by CSS. Each builder takes plain data and returns an Element whose root carries its ifl-* class; the CSS is in
// roof.css. The names and the order of their arguments are fixed (B0); options may only be added.
//
//   el(tag, attrs?, ...children) → Element
//       attrs: { class, text (textContent), data: { k: v } → data-k, aria: { k: v } → aria-k, on: { evt: fn }
//       (addEventListener), any other key → setAttribute (never "style", never on*) }; children: Node | string (a text
//       node) | array | null/false (skipped). (html is never taken: there is no way to pass markup in.)
//   esc(s) → string, HTML-escaped (& < > " ').
//   icon(name, { app, size }) → an app's icon (img, 16/24/32/40/64 px) when app, else the shared glyph `name` (aria-hidden)
//   card({ kind: "hero"|"list"|null, tappable, href, run, label, title, body, app }) → .ifl-card
//   list(rows, { label }) → .ifl-list (with an .ifl-label above when label: then a wrapper div)
//   row({ lead: Node | { icon } | { app } | { avatar, photo } | { time }, title, sub, value, trail: "chevron"|"switch"|Node,
//        href, run, label, act, checked, onChange }) → .ifl-row (an <a> with href, a <button> with run, else a <div>)
//   label(text) → .ifl-label
//   chip(text, { kind: "tag"|"action", tone, href, run, label, app }) → .ifl-chip
//   stats([[label, value, sub?, tone?], …]) → dl.ifl-stats
//   btn(text, { primary, small, destructive, icon, href, run, label, act }) → .ifl-btn
//   iconBtn(icon, { label, run, filled, act }) → button.ifl-icon-btn (aria-label = label)
//   seg([[value, label], …], current, onChange(value), { label }) → div.ifl-seg-sm[role=radiogroup] of
//        button[role=radio][data-value][aria-checked]; the element has .set(value)
//   sw(checked, onChange(bool), { label }) → label.ifl-switch around input[type=checkbox][role=switch]
//   field({ type, value, placeholder, label, onInput(value), onEnter(value) }) → .ifl-field with its <input> (.input)
//   tile({ app, name, line, href, mini: Node|null, chips: [{ text, href }] }) → a.ifl-tile[data-app] (a div with chips)
//   mini(m) → Element for a Mini: { kind: "num-bars", num, bars, label } | { kind: "pct-spark", pct, spark? } | { kind: "num", num, label }
//   avatar(name, { photo }) → .ifl-avatar.av-c1…8
//   badge(n, { label }) → .ifl-badge
//   empty({ title, body, acts }) → .ifl-empty;  error({ title, body, acts: [{ label, act, run, primary }] }) → .ifl-error
//   skeleton(kind: "hero"|"card"|"rows"|"tile", n?) → .ifl-skeleton (aria-hidden)

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const D = () => globalThis.document;
const IFL = () => globalThis.IFL;
const GLYPH_OF = { settings: "gear", places: "locate", chevron: "chev", close: "x" };

export function el(tag, attrs, ...kids) {
  const n = D().createElement(tag);
  if (attrs && (typeof attrs !== "object" || attrs.nodeType || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "data") for (const [d, x] of Object.entries(v)) { if (x != null) n.dataset[d] = x; }
    else if (k === "aria") for (const [a, x] of Object.entries(v)) { if (x != null) n.setAttribute(`aria-${a}`, x); }
    else if (k === "on") for (const [e, f] of Object.entries(v)) n.addEventListener(e, f);
    else if (k === "style" || k === "html" || /^on/i.test(k)) throw new Error(`ui.el: ${k} is never set`);
    else n.setAttribute(k, v === true ? "" : v);
  }
  add(n, kids);
  return n;
}
const add = (n, kids) => {
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k.nodeType ? k : String(k));
  return n;
};

export function icon(name, { app, size = 24 } = {}) {
  if (app) {
    const i = el("img", { class: `ifl-appic s${size}`, alt: "", width: size, height: size, data: { app } });
    try { i.src = IFL()?.iconUrl(app) || ""; } catch (_) {}
    return i;
  }
  const s = el("span", { class: "ifl-glyph", "aria-hidden": "true", data: { icon: name } });
  const g = IFL()?.glyph?.(GLYPH_OF[name] || name);
  if (g && !/<svg[^>]*>\s*<\/svg>/.test(g)) s.innerHTML = g;
  return s;
}

// a tappable root: <a href>, <button> for run, else the tag given
const tap = (o, tag, cls) => {
  const n = o.href ? el("a", { class: cls, href: o.href }) : o.run ? el("button", { class: cls, type: "button" }) : el(tag, { class: cls });
  if (o.run) n.addEventListener("click", (e) => o.run(e));
  if (o.label) n.setAttribute("aria-label", o.label);
  if (o.act) n.dataset.act = o.act;
  return n;
};

export function card({ kind = null, tappable = false, href, run, label, title, body, app } = {}) {
  const c = tap({ href, run, label }, "div", `ifl-card${kind ? " " + kind : ""}${tappable || href || run ? " tappable" : ""}`);
  if (app) c.dataset.app = app;
  if (title) c.append(el("h3", { class: "ifl-card-t", text: title }));
  return add(c, [body]);
}

export function label(text) { return el("h2", { class: "ifl-label", text }); }

export function list(rows, { label: l } = {}) {
  const box = el("div", { class: "ifl-list" }, rows);
  return l ? el("div", { class: "ifl-group" }, label(l), box) : box;
}

const lead = (x) => {
  if (!x) return null;
  if (x.nodeType) return el("span", { class: "ifl-lead" }, x);
  if (x.app) return el("span", { class: "ifl-lead app" }, icon(null, { app: x.app, size: 32 }));
  if (x.avatar != null) return el("span", { class: "ifl-lead av" }, avatar(x.avatar, { photo: x.photo }));
  if (x.time != null) return el("span", { class: "ifl-lead tm", text: x.time });
  if (x.icon) return el("span", { class: `ifl-lead ic${x.tone ? " " + x.tone : ""}` }, icon(x.icon));
  return null;
};

export function row(o = {}) {
  const r = tap(o, o.trail === "switch" ? "label" : "div", "ifl-row");
  const tx = el("span", { class: "ifl-tx" }, el("b", { text: o.title }), o.sub != null && o.sub !== "" ? el("small", { text: o.sub }) : null);
  let trail = null;
  if (o.trail === "chevron") trail = icon("chev");
  else if (o.trail === "switch") {
    const s = sw(!!o.checked, o.onChange || (() => {}), { label: o.title });
    trail = s;
  } else if (o.trail?.nodeType) trail = o.trail;
  return add(r, [lead(o.lead), tx, o.value != null && o.value !== "" ? el("span", { class: "ifl-val", text: o.value }) : null, trail ? el("span", { class: "ifl-trail" }, trail) : null]);
}

export function chip(text, { kind = "tag", tone, href, run, label: l, app } = {}) {
  const c = kind === "action" || href || run ? tap({ href, run, label: l }, "span", "ifl-chip action") : el("span", { class: "ifl-chip", "aria-label": l });
  if (tone) c.dataset.tone = tone;
  return add(c, [app ? icon(null, { app, size: 16 }) : null, el("span", { text })]);
}

export function stats(items = []) {
  const dl = el("dl", { class: "ifl-stats" });
  for (const [l, v, sub, tone] of items) dl.append(el("div", { class: "ifl-stat", data: { tone } }, el("dt", { text: l }), el("dd", { text: v }), sub ? el("small", { text: sub }) : null));
  return dl;
}

export function btn(text, { primary, small, destructive, icon: ic, href, run, label: l, act } = {}) {
  const b = tap({ href, run, label: l, act }, "button", `ifl-btn${primary ? " primary" : ""}${small ? " small" : ""}${destructive ? " destructive" : ""}`);
  if (b.tagName === "BUTTON") b.type = "button";
  return add(b, [ic ? icon(ic) : null, el("span", { text })]);
}

export function iconBtn(ic, { label: l, run, filled, act } = {}) {
  const b = tap({ run, label: l, act }, "button", `ifl-icon-btn${filled ? " filled" : ""}`);
  if (b.tagName === "BUTTON") b.type = "button";
  if (l) b.title = l;
  return add(b, [icon(ic)]);
}

export function seg(options, current, onChange, { label: l } = {}) {
  const g = el("div", { class: "ifl-seg-sm", role: "radiogroup", "aria-label": l });
  const bs = options.map(([v, t]) => el("button", { type: "button", role: "radio", data: { value: v }, text: t }));
  g.set = (v) => { for (const b of bs) { const on = b.dataset.value === String(v); b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; } };
  for (const b of bs) b.addEventListener("click", () => { g.set(b.dataset.value); onChange?.(b.dataset.value); });
  g.addEventListener("keydown", (e) => {
    const i = bs.indexOf(D().activeElement), d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (i < 0 || !d) return;
    e.preventDefault();
    const b = bs[(i + d + bs.length) % bs.length];
    b.focus(); b.click();
  });
  add(g, bs);
  g.set(current);
  return g;
}

export function sw(checked, onChange, { label: l } = {}) {
  const i = el("input", { type: "checkbox", role: "switch", class: "switch", "aria-label": l });
  i.checked = !!checked;
  i.addEventListener("change", () => onChange?.(i.checked));
  const w = el("span", { class: "ifl-switch" }, i);
  w.input = i;
  return w;
}

export function field({ type = "text", value = "", placeholder = "", label: l, onInput, onEnter } = {}) {
  const i = el("input", { type, placeholder, "aria-label": l, autocomplete: "off", spellcheck: "false" });
  i.value = value;
  if (onInput) i.addEventListener("input", () => onInput(i.value));
  if (onEnter) i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); onEnter(i.value); } });
  const f = el("label", { class: "ifl-field" }, type === "search" ? icon("search") : null, i);
  f.input = i;
  return f;
}

export function tile({ app, name, line, href, mini: m, chips = [] } = {}) {
  const head = el(href ? "a" : "div", { class: "ifl-tile-main", href }, icon(null, { app, size: 40 }), el("b", { text: name }), line ? el("small", { text: line }) : null, m || null);
  if (!chips.length && href) { head.className = "ifl-tile"; head.dataset.app = app; return head; }
  return el("div", { class: "ifl-tile", data: { app } }, head, chips.length ? el("span", { class: "ifl-tile-chips" }, chips.map((c) => chip(c.text, { kind: "action", href: c.href }))) : null);
}

export function mini(m) {
  if (!m || typeof m !== "object") return null;
  const box = el("span", { class: `ifl-mini ${m.kind || ""}` });
  if (m.num != null) box.append(el("b", { class: "num", text: m.num }));
  if (m.kind === "num-bars" && Array.isArray(m.bars)) {
    const bars = el("span", { class: "bars", "aria-hidden": "true" });
    for (const b of m.bars.slice(0, 8)) { const i = el("i"); const h = Math.max(0, Math.min(100, Number(b) || 0)); i.style.setProperty("--h", String(h / 100)); if (h >= 50) i.className = "w"; bars.append(i); }
    box.append(bars);
  }
  if (m.kind === "pct-spark") {
    const p = Number(m.pct);
    if (Number.isFinite(p)) { box.append(el("b", { class: "num", text: `${p > 0 ? "+" : ""}${p.toFixed(1)}%` })); box.dataset.tone = p >= 0 ? "pos" : "neg"; }
    if (Array.isArray(m.spark) && m.spark.length > 1) box.append(spark(m.spark));
  }
  if (m.label) box.append(el("small", { text: m.label }));
  return box;
}
// a shape only, never labelled with amounts
function spark(vals) {
  const v = vals.map(Number).filter(Number.isFinite), lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const NS = "http://www.w3.org/2000/svg", s = D().createElementNS(NS, "svg"), p = D().createElementNS(NS, "path");
  s.setAttribute("viewBox", "0 0 70 26"); s.setAttribute("class", "spark"); s.setAttribute("aria-hidden", "true");
  p.setAttribute("d", v.map((x, i) => `${i ? "L" : "M"}${(i * 70 / (v.length - 1)).toFixed(1)} ${(24 - (x - lo) / r * 22).toFixed(1)}`).join(" "));
  s.append(p);
  return s;
}

export function avatar(name, { photo } = {}) {
  const s = String(name ?? "?");
  let h = 0;
  for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0;
  const a = el("span", { class: `ifl-avatar av-c${(h % 8) + 1}`, "aria-hidden": "true", text: [...s.trim()][0]?.toUpperCase() || "?" });
  if (photo) a.append(el("img", { src: photo, alt: "" }));
  return a;
}

export function badge(n, { label: l } = {}) { return el("span", { class: "ifl-badge", "aria-label": l, text: String(n) }); }

const actsOf = (acts = []) => acts.length ? el("div", { class: "ifl-acts" }, acts.map((a) => btn(a.label, a))) : null;
export function empty({ title, body, acts } = {}) {
  return el("div", { class: "ifl-empty" }, title ? el("b", { text: title }) : null, body ? el("p", { text: body }) : null, actsOf(acts));
}
export function error({ title, body, acts } = {}) {
  return el("div", { class: "ifl-error", role: "alert" }, title ? el("b", { text: title }) : null, body ? el("p", { text: body }) : null, actsOf(acts));
}

export function skeleton(kind = "card", n = 3) {
  const s = el("div", { class: `ifl-skeleton ${kind}`, "aria-hidden": "true" });
  for (let i = 0; i < (kind === "hero" ? 1 : n); i++) s.append(el("i"));
  return s;
}
