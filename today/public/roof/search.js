// InFlite's search (One roof, spec §3.10, D16: on this device only). Static, so the sheet and its input are made and
// focused inside the tap's own handler (iOS raises the keyboard only then).
// createSearch(F) → Search = { open(), close(), provide(provider) → off }
//   provider = { id, group, order, search(q) → Entry[] | Promise<Entry[]> }
//   Entry = { title, sub, icon?: app, avatar?: name, href?: path, run?: fn, label? }
//   The sheet "Search everything" (data-sheet=search): input[type=search] (role=combobox over one listbox of
//   [role=option], aria-activedescendant the highlighted one; ↑/↓ move it, Enter (the keyboard's Go) opens it, Esc
//   closes). The empty field: your apps as a row of icons, Recent (what you opened from here, with Clear) and a few
//   shortcuts; no provider asked. Typed: every provider (80 ms debounce), each answer drawn as it comes (one slower than
//   300 ms when it arrives; one that throws left out), ranked (rank below): a Top hit, then groups best first, three
//   each with "Show all", the letters that matched in bold, "Nothing for “…”" through textContent. The query
//   is sent to authorised app providers. Opened links can enter Recent. Chat and Mail record results stay in the
//   account's current frame and disappear when access ends.
// collect(providers, q, update(groups, settled), { slow }) → Promise: the merging, ordered by order then id, each group
//   at most 20 entries; update is called once the quick ones are in (or slow ms passed) and again as each late one arrives.
// match(q, text) → { s, hits: [[from, to], …] } | null: how well text answers q (0…1): its start, a word's start, inside
//   a word, every word of q at a word's start, the letters in order (an acronym's best), or one slip (two from seven
//   letters) at a word's start from four typed; case and accents aside.
// rank(groups, q, { recent }) → { top, groups: [{ id, group, entries, all }], more }: each entry scored (title, else
//   sub, else as its provider found it), one address once (its best), a recent one a little higher; the best of all the
//   Top hit (when there's more than one result), a provider's offer to look further ("Find “q” in Markets", "Search Mail
//   for “q”") in more, last; groups by their best, then order.
// recents(F) → Entry[]; remember(F, entry); forget(): RECENT, the account's own (a list another account left is
//   no one's), Mail's only for the admin.
import { REGISTRY, ownPath, parse } from "./router.js";

const SLOW = 300, MAX = 20, RECENT = "ifl:recent", KEEP = 8, RECENT_SHOWN = 5;
export function collect(providers, q, update, { slow = SLOW,signal,current } = {}) {
  const ps = [...providers].sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || String(a.id).localeCompare(String(b.id)));
  const got = new Map();
  let shown = false, left = ps.length;
  const groups = () => ps.filter((p) => got.get(p)?.length).map((p, i) => ({ id: p.id, group: p.group, order: i, entries: got.get(p) }));
  const fire = () => { shown = true; if (!signal?.aborted && (!current || current())) update(groups(), left === 0); };
  const clean = (r) => {
    const entries = Array.isArray(r) ? r.filter(e => e && typeof e.title === "string" && (e.href || typeof e.run === "function")) : [];
    if (entries.length <= MAX) return entries;
    return entries.map(e => score(e, q)).sort(compare).slice(0, MAX).map(x => x.e);
  };
  return new Promise((done) => {
    if (!ps.length) { fire(); return done(); }
    const t = setTimeout(() => { if (!shown) fire(); }, slow);
    for (const p of ps) {
      let r;
      try { r = p.search(q, { signal, current }); } catch (_) { r = []; }
      Promise.resolve(r).then(clean, () => []).then((list) => {
        got.set(p, list);
        left--;
        if (left === 0) { clearTimeout(t); fire(); done(); }
        else if (shown) fire();
      });
    }
  });
}

// ---- matching: a letter at a time, so a hit's place in the folded words is its place in the words as written
const fold = (s) => [...String(s ?? "")].map((c) => { const f = c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); return f.length === c.length ? f : c; }).join("");
const word = (c) => /[\p{L}\p{N}]/u.test(c || "");
const starts = (t) => { const a = []; for (let i = 0; i < t.length; i++) if (word(t[i]) && !word(t[i - 1])) a.push(i); return a; };
// (letters apart: swaps count once; Q no longer than 12, so this stays small)
function slips(a, b, most) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      low = Math.min(low, d[i][j]);
    }
    if (low > most) return most + 1;
  }
  return d[a.length][b.length];
}
export function match(q, text) {
  const Q = fold(q).trim().replace(/\s+/g, " "), T = fold(text);
  if (!Q || !T) return null;
  const W = starts(T), at = (i) => W.includes(i);
  const fit = (s, hits) => ({ s: Math.max(0.05, s - Math.min(0.08, Math.max(0, T.length - Q.length) * 0.002)), hits });
  const i = T.indexOf(Q);
  if (i === 0) return fit(1, [[0, Q.length]]);
  if (i > 0) {
    let k = i;
    while (k >= 0 && !at(k)) k = T.indexOf(Q, k + 1);
    if (k > 0) return fit(0.9, [[k, k + Q.length]]);
    if (Q.length > 2) return fit(0.7, [[i, i + Q.length]]);
  }
  // every word of q at a word's start (any order), or inside one
  const qs = Q.split(" ");
  if (qs.length > 1) {
    const hits = [];
    let all = true;
    for (const w of qs) {
      const k = W.find((x) => T.startsWith(w, x));
      if (k != null) { hits.push([k, k + w.length]); continue; }
      const j = w.length > 1 ? T.indexOf(w) : -1;
      if (j < 0) { hits.length = 0; break; }
      all = false; hits.push([j, j + w.length]);
    }
    if (hits.length) return fit(all ? 0.82 : 0.66, hits.sort((a, b) => a[0] - b[0]));
  }
  const L = Q.replace(/ /g, "");
  if (L.length < 2) return null;
  // the letters in order, from a word's start: an acronym ("wr", Weather · Radar) best, close together next
  for (const w0 of W) {
    if (T[w0] !== L[0]) continue;
    const hits = [];
    let j = w0, n = 0, heads = 0;
    for (const c of L) {
      const ahead = W.find((x) => x >= j && T[x] === c && x - j <= 12);
      const k = ahead != null && (T[j] !== c) ? ahead : T.indexOf(c, j);
      if (k < 0) { n = -1; break; }
      if (at(k)) heads++;
      if (hits.length && hits.at(-1)[1] === k) hits.at(-1)[1] = k + 1; else hits.push([k, k + 1]);
      j = k + 1; n++;
    }
    if (n !== L.length) continue;
    const spread = j - w0;
    if (heads === L.length && L.length > 1) return fit(0.62, hits);
    if (spread <= L.length * 2 + 1 && hits.length <= Math.ceil(L.length / 2)) return fit(0.45 + 0.1 * (L.length / spread), hits);
  }
  // one slip (two, from seven letters) at a word's start, from four letters typed
  if (L.length >= 4) {
    const most = L.length >= 7 ? 2 : 1;
    let best = null;
    for (const w0 of W) for (const n of [L.length, L.length - 1, L.length + 1]) {
      if (w0 + n > T.length + 1) continue;
      const d = slips(L.slice(0, 12), T.slice(w0, w0 + n), most);
      if (d <= most && (!best || d < best.d)) best = { d, hits: [[w0, Math.min(T.length, w0 + n)]] };
    }
    if (best) return fit(0.5 - 0.1 * best.d, best.hits);
  }
  return null;
}

const LOOSE = 0.2, TOP = 0.68;
function score(e, q) {
  const title = match(q, e.title), sub = title ? null : match(q, e.sub);
  return { e, s: e.offer ? 0 : title ? title.s : sub?.s >= 0.7 ? sub.s * 0.55 : LOOSE, hits: title?.hits || [] };
}
const compare = (a, b) => b.s - a.s || (b.e.updatedAt || 0) - (a.e.updatedAt || 0);
const identity = e => e.key || e.href || JSON.stringify([e.app || e.icon, e.title, e.sub]);

export function rank(groups, q, { recent = [] } = {}) {
  const typed = fold(q).trim(), was = new Set(recent.map((r) => r.href));
  const offer = (e) => !!typed && fold(e.title).includes(`“${typed.slice(0, 30)}`);
  const seen = new Map(), out = [], more = [];
  for (const g of groups) {
    const list = [];
    for (const e of g.entries) {
      const x = score(e, q);
      if (e.href && was.has(e.href)) x.s += 0.06;
      if (e.offer || offer(e)) { more.push({ ...x, s: 0, hits: [] }); continue; }
      const key = e.key || e.href;
      if (key) {
        const o = seen.get(key);
        if (o && (o.s > x.s || o.s === x.s && (!e.detail || o.e.detail))) continue;
        if (o) o.gone = true;
        seen.set(key, x);
      }
      list.push(x);
    }
    out.push({ id: g.id, group: g.group, order: g.order ?? out.length, list });
  }
  for (const g of out) g.list = g.list.filter((x) => !x.gone).sort(compare);
  const all = out.flatMap((g) => g.list);
  let top = null;
  if (all.length > 1) {
    const [best, next] = all.sort(compare);
    if (best.s >= TOP && (compare(best, next) < 0 || !best.e.app && !next.e.app)) { top = best; const g = out.find((x) => x.list.includes(best)); g.list = g.list.filter((x) => x !== best); }
  }
  const gs = out.filter((g) => g.list.length).sort((a, b) => b.list[0].s - a.list[0].s || a.order - b.order);
  return { top, groups: gs.map((g) => ({ id: g.id, group: g.group, entries: g.list, all: g.list.length })), more };
}

// ---- Recent: what you opened from here, on this device, for this account
const me = (F) => F?.session?.view?.user?.id ?? null;
const yoursOf = (F) => (a) => a !== "mail" || F?.session?.view?.apps?.mail === true;
const store = () => { try { return globalThis.localStorage || null; } catch (_) { return null; } };
let privateRecents = new WeakMap(), lastOpened = 0;
function privateApp(entry) {
  const route = parse(entry?.href, { roof: true });
  if (route?.app === "chats" && ["open", "share"].includes(route.key)) return "chats";
  if (route?.app === "mail" && route.key === "thread") return "mail";
  return null;
}
function writeKept(owner, list) {
  try {
    if (list.length) store()?.setItem(RECENT, JSON.stringify({ u: owner, list }));
    else store()?.removeItem(RECENT);
  } catch (_) {}
}
function readKept(F) {
  try {
    const k = JSON.parse(store()?.getItem(RECENT) || "null");
    if (!Array.isArray(k?.list)) return [];
    const list = k.list.filter(entry => !privateApp(entry));
    if (list.length !== k.list.length) writeKept(k.u, list);
    const owner = me(F);
    return owner && k.u === owner ? list : [];
  } catch (_) { return []; }
}
function readPrivate(F) {
  const current = privateRecents.get(F);
  return current?.owner === me(F) ? current.list : [];
}
export function recents(F) {
  const yours = yoursOf(F);
  return [...readKept(F), ...readPrivate(F)]
    .filter(r => r && typeof r.title === "string" && ownPath(r.href) && (yours("mail") || !/^\/mail(?=$|[/?#])/.test(r.href)))
    .sort((a, b) => (Number(b.openedAt) || 0) - (Number(a.openedAt) || 0))
    .slice(0, KEEP).map(({ openedAt, ...entry }) => entry);
}
export function remember(F, e) {
  const owner = me(F);
  if (!owner || !e || typeof e.title !== "string" || !ownPath(e.href)) return;
  const app = privateApp(e);
  if (app && !yoursOf(F)(app)) return;
  lastOpened = Math.max(Date.now(), lastOpened + 1);
  const r = { title: e.title.slice(0, 120), sub: typeof e.sub === "string" ? e.sub.slice(0, 120) : "", href: e.href, openedAt: lastOpened };
  if (typeof e.icon === "string") r.icon = e.icon;
  if (e.avatar != null) r.avatar = String(e.avatar).slice(0, 60);
  const kept = readKept(F);
  const previous = app ? readPrivate(F) : kept;
  const list = [r, ...previous.filter(x => x?.href !== e.href)].slice(0, KEEP);
  if (app) privateRecents.set(F, { owner, list });
  else writeKept(owner, list);
}
export function forget(F) {
  if (F) privateRecents.delete(F);
  else privateRecents = new WeakMap();
  writeKept(null, []);
}

// the apps, in the Apps tab's order: Weather, then the apps beside (Chats, Fitness, Markets, Mail), each by its hub page
const APPS = () => ["weather", "chats", "fitness", "markets", "mail"].filter((a) => REGISTRY[a]);
// a few places people go most (the app's own where the account has it)
const SHORTCUTS = [["Rain radar", "weather", "/weather/#radar", "rain"], ["Add a friend", "chats", "/chats/#add", "addp"], ["Activities", "fitness", "/fitness/#activities", "ride"],
  ["Holdings", "markets", "/markets/#holdings", "trend"], ["Quiet Hours", null, "/#you=quiet", "moon"]];
let n = 0;
export function createSearch(F, { chatReady = () => true } = {}) {
  let renderer, searchProviders;
  const provs = new Set();
  let h = null, t = 0, gen = 0, discoveryView;
  const canRemember = entry => privateApp(entry) !== "chats" || chatReady();
  const visibleRecents = () => recents(F).filter(canRemember);
  readKept(F); // Remove private rows created by older builds.
  function open(resume) {
    if (h) return h;
    if (typeof resume?.query !== "string") resume = null;
    const ui = F.ui, id = `ifl-sr-${++n}`, yours = yoursOf(F), has = (a) => !a || F.session?.view?.apps?.[a] !== false;
    const input = ui.el("input", { type: "search", role: "combobox", maxlength: 160, placeholder: "Search InFlite", "aria-label": "Search everything", "aria-controls": id, "aria-expanded": "true", "aria-autocomplete": "list", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "go" });
    const clear = ui.el("button", { class: "ifl-clear", type: "button", "aria-label": "Clear", hidden: true }, ui.icon("x"));
    const box = ui.el("div", { class: "ifl-field search" }, ui.icon("search"), input, clear);
    const list = ui.el("div", { class: "ifl-results", id, role: "listbox", "aria-label": "Results" });
    const say = ui.el("p", { class: "ifl-none", role: "status" });
    let pinned = false, previewing = false;
    function focusResult(key) {
      const row = opts.find(o => o.dataset.result === key);
      if (row) { pinned = true; mark(opts.indexOf(row), false); row.focus({ preventScroll: true }); }
    }
    const view = discoveryView?.(F, { resume, focusResult, query: () => input.value, expanded: () => wide,
      list, sheet: () => h, redraw: draw,
      select(row) { pinned = true; previewing = true; mark(opts.indexOf(row), false); },
      restore(row) {
        previewing = false;
        if (!input.isConnected) return;
        draw();
        focusResult(row.dataset.result);
      },
      resetSelection() { pinned = false; }
    });
    const wide = new Set(resume?.wide);
    let opts = [], at = -1, last = null, lastQ = resume?.query || "", was = null, waiting = false, asked = null;
    // (the highlighted one: aria-activedescendant on the field, aria-selected on it, kept in sight)
    const mark = (i, scroll = true) => {
      at = opts.length ? Math.max(-1, Math.min(opts.length - 1, i)) : -1;
      opts.forEach((o, j) => o.setAttribute("aria-selected", String(j === at)));
      if (at >= 0) { input.setAttribute("aria-activedescendant", opts[at].id); if (scroll) opts[at].scrollIntoView?.({ block: "nearest" }); }
      else input.removeAttribute("aria-activedescendant");
    };
    const option = (r, e, key) => {
      r.setAttribute("role", "option"); r.id = `${id}-${key}`; r.tabIndex = -1; r.dataset.result = identity(e);
      // (opened: kept in Recent, when it has an address to go back to)
      if (e.href) r.addEventListener("click", () => { if (h && canRemember(e)) remember(F, e); });
      return r;
    };
    const rowOf = (e, key, hits) => {
      const r = ui.row({ lead: e.avatar != null ? { avatar: e.avatar } : e.icon ? { app: e.icon } : null, title: e.title, sub: e.sub, trail: "chevron", href: e.href, run: e.href ? null : () => { if (e.layer) { const my = gen; e.run(() => gen === my && !!h); } else if (view && (e.preview || e.detail)) view.open(e, r); else { close(); e.run(); } }, label: e.label });
      option(r, e, key);
      return hits?.length ? renderer.highlight(ui, r, e.title, hits) : r;
    };
    const head = (label, act) => ui.el("div", { class: "ifl-sr-head" }, ui.el("div", { class: "ifl-label", "aria-hidden": "true", text: label }), act || null);
    const group = (gid, label, kids, act, cls = "") => ui.el("div", { class: `ifl-sr-group${cls ? " " + cls : ""}`, role: "group", "aria-label": label, data: { group: gid } }, head(label, act), kids);
    const done = (focus) => {
      opts = [...list.querySelectorAll("[role=option]")];
      if (opts.length) list.setAttribute("role", "listbox"); else list.removeAttribute("role");
      mark(focus, false);
    };

    // the empty field: your apps, Recent, shortcuts
    const home = () => {
      view?.reset();
      const apps = APPS().filter(yours).map((a) => {
        const R = REGISTRY[a], ic = a === "chats" ? "chat" : a;
        return option(ui.el("a", { class: "ifl-sr-app", href: R.path, "aria-label": R.name }, ui.icon(null, { app: ic, size: 40 }), ui.el("span", { text: R.name })), { title: R.name, sub: "App", icon: ic, href: R.path }, `app-${a}`);
      });
      const kept = visibleRecents().slice(0, RECENT_SHOWN);
      const wipe = ui.el("button", { class: "ifl-sr-more", type: "button", text: "Clear", "aria-label": "Clear Recent" });
      wipe.addEventListener("click", () => { forget(F); draw(); input.focus({ preventScroll: true }); });
      const cuts = SHORTCUTS.filter(([, a]) => !a || (yours(a) && has(a))).map(([title, a, href, glyph], i) => {
        const c = ui.chip(title, { kind: "action", href });
        c.prepend(ui.icon(glyph));
        return option(c, { title, sub: a ? REGISTRY[a]?.name || "" : "Settings", icon: a || undefined, href }, `cut-${i}`);
      });
      list.replaceChildren(...[
        group("apps", "Apps", ui.el("div", { class: "ifl-sr-apps" }, apps), null, "apps"),
        kept.length ? group("recent", "Recent", kept.map((e, i) => rowOf(e, `recent-${i}`)), wipe, "recent") : null,
        cuts.length ? group("shortcuts", "Shortcuts", ui.el("div", { class: "ifl-sr-cuts" }, cuts), null, "cuts") : null].filter(Boolean));
      say.textContent = "";
      was = null;
      done(-1);
    };
    // typed: Top hit, the groups, then the offers to look further
    function draw() {
      const q = input.value.trim();
      if (!q) return home();
      if (!last) return;
      const selected = q === was && pinned ? opts[at]?.dataset.result : null;
      renderer.showResults(last, { ui, input, group, rowOf, wide, draw }, list, say, q, view, visibleRecents());
      done(0);
      if (selected) { const i = opts.findIndex(o => o.dataset.result === selected); if (i >= 0) mark(i, false); }
      was = q;
      view?.restored?.(last.settled);
    }
    let queryController=null;
    const run = () => {
      queryController?.abort();queryController=new AbortController();
      const q = input.value.trim(), my = ++gen;
      waiting = false;
      clear.hidden = !input.value;
      if (q !== lastQ) { wide.clear(); pinned = false; view?.reset(); list.scrollTop = 0; }
      lastQ = q;
      if (!q) { last = null; return home(); }
      // (Mail's provider, the admin's alone, asked only for them)
      const current = () => my === gen && !!h;
      asked = import("./search-render.js").then(module => {
        if (!current()) return;
        renderer = module;
        searchProviders ||= module.createQuery(F, yours, provs);
        return searchProviders(q, (groups, settled) => {
          last = { groups, settled };
          if (!previewing) draw();
        }, { signal: queryController.signal, current });
      }).catch(() => { if (current()) say.textContent = "Search couldn’t finish. Try again."; });
    };
    input.addEventListener("input", () => { queryController?.abort();gen++;last = null; view?.reset(); list.replaceChildren(); done(-1); say.textContent = ""; clear.hidden = !input.value; clearTimeout(t); waiting = true; t = setTimeout(run, 80); });
    input.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!opts.length) return;
        pinned = true;
        const d = e.key === "ArrowDown" ? 1 : -1;
        mark(at < 0 ? (d > 0 ? 0 : opts.length - 1) : (at + d + opts.length) % opts.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        // (typed faster than the debounce: asked now, the first opened once it's drawn)
        if (waiting) { clearTimeout(t); run(); const my = gen; return void Promise.race([asked, new Promise((r) => setTimeout(r, SLOW + 20))]).then(() => { if (my === gen && h) opts[0]?.click(); }); }
        opts[at >= 0 ? at : input.value.trim() ? 0 : -1]?.click();
      } else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    list.addEventListener("mousemove", (e) => {
      const o = e.target.closest?.("[role=option]"), i = o ? opts.indexOf(o) : -1;
      if (i >= 0 && i !== at) { pinned = true; mark(i, false); }
    });
    clear.addEventListener("click", () => { input.value = ""; input.focus(); run(); });
    h = F.sheet.open({ sheet: "search", title: view ? "Search InFlite" : "Search everything", focus: input, body: ui.el("div", { class: "ifl-search" }, box, view?.filters, say, list), onClose: () => { queryController?.abort();h = null; gen++; clearTimeout(t); } });
    input.value = lastQ;
    input.focus({ preventScroll: true });
    run();
    return h;
  }
  function close() { h?.close(); }
  return {
    open, close, useDiscovery(factory) { discoveryView = factory; },
    invalidate({ app, clearAll = false } = {}) {
      if (clearAll) privateRecents.delete(F);
      else if (app) {
        const list = readPrivate(F).filter(entry => privateApp(entry) !== app);
        if (list.length) privateRecents.set(F, { owner: me(F), list });
        else privateRecents.delete(F);
      }
      if (h) { h.body.replaceChildren(); h.now(); }
    },
    provide(p) {
      if (!p || typeof p.search !== "function") return () => {};
      provs.add(p);
      return () => provs.delete(p);
    },
  };
}
