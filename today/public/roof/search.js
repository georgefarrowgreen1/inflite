// InFlite's search (One roof, spec §3.10, D16: on this device only). Static, so the sheet and its input are made and
// focused inside the tap's own handler (iOS raises the keyboard only then).
// createSearch(F) → Search = { open(), close(), provide(provider) → off }
//   provider = { id, group, order, search(q) → Entry[] | Promise<Entry[]> }
//   Entry = { title, sub, icon?: app, avatar?: name, href?: path, run?: fn, label? }
//   The sheet "Search everything" (data-sheet=search): input[type=search] (role=combobox, a listbox of [role=option]
//   rows grouped by provider, Enter opens the first), "Nothing for “…”" through textContent. Providers run on every
//   input (80 ms debounce); one slower than 300 ms is shown when it arrives; one that throws is left out. The empty field
//   shows the Apps provider's entries (every app and its sections). The query never leaves the page: no request, no
//   URL, no history.state, no storage, no log; nothing is remembered past the sheet.
// collect(providers, q, update(groups, settled), { slow }) → Promise: the merging, ordered by order then id, each group
//   at most 8 entries; update is called once the quick ones are in (or slow ms passed) and again as each late one arrives.
import { REGISTRY } from "./router.js";

const SLOW = 300, MAX = 8;
export function collect(providers, q, update, { slow = SLOW } = {}) {
  const ps = [...providers].sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || String(a.id).localeCompare(String(b.id)));
  const got = new Map();
  let shown = false, left = ps.length;
  const groups = () => ps.filter((p) => got.get(p)?.length).map((p) => ({ id: p.id, group: p.group, entries: got.get(p) }));
  const fire = () => { shown = true; update(groups(), left === 0); };
  const clean = (r) => (Array.isArray(r) ? r.filter((e) => e && typeof e.title === "string" && (e.href || typeof e.run === "function")).slice(0, MAX) : []);
  return new Promise((done) => {
    if (!ps.length) { fire(); return done(); }
    const t = setTimeout(() => { if (!shown) fire(); }, slow);
    for (const p of ps) {
      let r;
      try { r = p.search(q); } catch (_) { r = []; }
      Promise.resolve(r).then(clean, () => []).then((list) => {
        got.set(p, list);
        left--;
        if (left === 0) { clearTimeout(t); fire(); done(); }
        else if (shown) fire();
      });
    }
  });
}

// the Apps provider: every module (REGISTRY) and app (connectors.js STATIC) with its sections
function appsProvider() {
  let stat = null;
  const load = () => (stat ||= import("./connectors.js").then((c) => c.STATIC, () => ({})));
  const entries = (S) => {
    const out = [];
    for (const R of Object.values(REGISTRY)) {
      out.push({ title: R.name, sub: "Open", icon: R.app, href: R.path });
      R.sections.forEach(([id, l], i) => { if (i) out.push({ title: `${R.name} · ${l}`, sub: R.name, icon: R.app, href: `${R.path}#${id}` }); });
    }
    for (const c of Object.values(S || {})) {
      out.push({ title: c.name, sub: "Open", icon: c.icon || c.app, href: c.href });
      for (const [l, href] of c.links || []) out.push({ title: `${c.name} · ${l}`, sub: c.name, icon: c.icon || c.app, href });
    }
    return out;
  };
  return {
    id: "apps", group: "Apps", order: 10,
    search(q) {
      return load().then((S) => {
        const all = entries(S), s = q.trim().toLowerCase();
        return s ? all.filter((e) => e.title.toLowerCase().includes(s)).slice(0, MAX) : all.filter((e) => e.sub === "Open");
      });
    },
  };
}

let n = 0;
export function createSearch(F) {
  const provs = new Set([appsProvider()]);
  let h = null, t = 0, gen = 0;
  function open() {
    if (h) return h;
    const ui = F.ui, id = `ifl-sr-${++n}`;
    const input = ui.el("input", { type: "search", role: "combobox", placeholder: "Search", "aria-label": "Search everything", "aria-controls": id, "aria-expanded": "true", "aria-autocomplete": "list", autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "go" });
    const clear = ui.el("button", { class: "ifl-clear", type: "button", "aria-label": "Clear", hidden: true }, ui.icon("x"));
    const box = ui.el("div", { class: "ifl-field search" }, ui.icon("search"), input, clear);
    const list = ui.el("div", { class: "ifl-results", id, role: "listbox", "aria-label": "Results" });
    const say = ui.el("p", { class: "ifl-none", role: "status" });
    const draw = (groups, settled, q) => {
      if (groups.length) list.setAttribute("role", "listbox"); else list.removeAttribute("role");
      list.replaceChildren(...groups.map((g) => ui.el("div", { class: "ifl-sr-group", role: "group", "aria-label": g.group || g.id }, ui.el("div", { class: "ifl-label", "aria-hidden": "true", text: g.group || "" }),
        g.entries.map((e, i) => {
          const r = ui.row({ lead: e.avatar != null ? { avatar: e.avatar } : e.icon ? { app: e.icon } : null, title: e.title, sub: e.sub, trail: "chevron", href: e.href, run: e.href ? null : () => { close(); e.run(); }, label: e.label });
          r.setAttribute("role", "option"); r.id = `${id}-${g.id}-${i}`;
          return r;
        }))));
      say.textContent = q && !groups.length && settled ? `Nothing for “${q}”` : "";
    };
    const run = () => {
      const q = input.value.trim(), my = ++gen;
      clear.hidden = !input.value;
      collect(q ? [...provs] : [...provs].filter((p) => p.id === "apps"), q, (g, s) => { if (my === gen && h) draw(g, s, q); });
    };
    input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(run, 80); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); list.querySelector("[role=option]")?.click(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); list.querySelector("[role=option]")?.focus(); }
    });
    list.addEventListener("keydown", (e) => {
      const o = [...list.querySelectorAll("[role=option]")], i = o.indexOf(document.activeElement);
      if (i < 0 || !/^Arrow(Up|Down)$/.test(e.key)) return;
      e.preventDefault();
      (e.key === "ArrowDown" ? o[i + 1] : o[i - 1] || input)?.focus();
    });
    clear.addEventListener("click", () => { input.value = ""; input.focus(); run(); });
    h = F.sheet.open({ sheet: "search", title: "Search everything", focus: input, body: ui.el("div", { class: "ifl-search" }, box, say, list), onClose: () => { h = null; gen++; clearTimeout(t); } });
    input.focus({ preventScroll: true });
    run();
    return h;
  }
  function close() { h?.close(); }
  return {
    open, close,
    provide(p) {
      if (!p || typeof p.search !== "function") return () => {};
      provs.add(p);
      return () => provs.delete(p);
    },
  };
}
