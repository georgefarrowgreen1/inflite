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
//   each with "Show all", the letters that matched in bold, "Nothing for “…”" through textContent. The query never
//   leaves the page: no request, no URL, no history.state, no log, and never stored; only what's opened (a result with
//   an address) is kept, in Recent (RECENT, on this device, for this account; Today's sign-out clears it).
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
import { REGISTRY, ownPath } from "./router.js";

const SLOW = 300, MAX = 20, SHOW = 3, RECENT = "ifl:recent", KEEP = 8, RECENT_SHOWN = 5;
export function collect(providers, q, update, { slow = SLOW } = {}) {
  const ps = [...providers].sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || String(a.id).localeCompare(String(b.id)));
  const got = new Map();
  let shown = false, left = ps.length;
  const groups = () => ps.filter((p) => got.get(p)?.length).map((p, i) => ({ id: p.id, group: p.group, order: i, entries: got.get(p) }));
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

const LOOSE = 0.2, TOP = 0.35;
export function rank(groups, q, { recent = [] } = {}) {
  const typed = fold(q).trim(), was = new Set(recent.map((r) => r.href));
  const offer = (e) => !!typed && fold(e.title).includes(`“${typed.slice(0, 30)}`);
  const seen = new Map(), out = [], more = [];
  for (const g of groups) {
    const list = [];
    for (const e of g.entries) {
      const m = match(q, e.title), ms = m ? null : match(q, e.sub);
      // (a sub counts only where it holds what was typed)
      const x = { e, s: (m ? m.s : ms?.s >= 0.7 ? ms.s * 0.55 : LOOSE) + (e.href && was.has(e.href) ? 0.06 : 0), hits: m?.hits || [] };
      if (offer(e)) { more.push({ ...x, s: 0, hits: [] }); continue; }
      if (e.href) {
        const o = seen.get(e.href);
        if (o && o.s >= x.s) continue;
        if (o) o.gone = true;
        seen.set(e.href, x);
      }
      list.push(x);
    }
    out.push({ id: g.id, group: g.group, order: g.order ?? out.length, list });
  }
  for (const g of out) g.list = g.list.filter((x) => !x.gone).sort((a, b) => b.s - a.s);
  const all = out.flatMap((g) => g.list);
  let top = null;
  if (all.length > 1) {
    const best = all.reduce((a, b) => (b.s > a.s ? b : a));
    if (best.s >= TOP) { top = best; const g = out.find((x) => x.list.includes(best)); g.list = g.list.filter((x) => x !== best); }
  }
  const gs = out.filter((g) => g.list.length).sort((a, b) => b.list[0].s - a.list[0].s || a.order - b.order);
  return { top, groups: gs.map((g) => ({ id: g.id, group: g.group, entries: g.list, all: g.list.length })), more };
}

// ---- Recent: what you opened from here, on this device, for this account
const me = (F) => F?.session?.view?.user?.id ?? null;
const yoursOf = (F) => (a) => a !== "mail" || F?.session?.view?.apps?.mail === true;
const store = () => { try { return globalThis.localStorage || null; } catch (_) { return null; } };
function readKept(F) {
  try {
    const k = JSON.parse(store()?.getItem(RECENT) || "null");
    return k && k.u === me(F) && Array.isArray(k.list) ? k.list : [];
  } catch (_) { return []; }
}
export function recents(F) {
  const yours = yoursOf(F);
  return readKept(F).filter((r) => r && typeof r.title === "string" && ownPath(r.href) && (yours("mail") || !/^\/mail(?=$|[/?#])/.test(r.href))).slice(0, KEEP);
}
export function remember(F, e) {
  if (!e || typeof e.title !== "string" || !ownPath(e.href)) return;
  const r = { title: e.title.slice(0, 120), sub: typeof e.sub === "string" ? e.sub.slice(0, 120) : "", href: e.href };
  if (typeof e.icon === "string") r.icon = e.icon;
  if (e.avatar != null) r.avatar = String(e.avatar).slice(0, 60);
  const list = [r, ...readKept(F).filter((x) => x?.href !== e.href)].slice(0, KEEP);
  try { store()?.setItem(RECENT, JSON.stringify({ u: me(F), list })); } catch (_) {}
}
export function forget() { try { store()?.removeItem(RECENT); } catch (_) {} }

// the apps, in the Apps tab's order: Weather, then the apps beside (Chats, Fitness, Markets, Mail), each by its hub page
const APPS = () => ["weather", "chats", "fitness", "markets", "mail"].filter((a) => REGISTRY[a]);
// a few places people go most (the app's own where the account has it)
const SHORTCUTS = [["Rain radar", "weather", "/weather/#radar", "rain"], ["Add a friend", "chats", "/chats/#add", "addp"], ["Activities", "fitness", "/fitness/#activities", "ride"],
  ["Holdings", "markets", "/markets/#holdings", "trend"], ["Quiet Hours", null, "/#you=quiet", "moon"]];
// (and more ways in, as you type)
const ALSO = [["Rain radar", "weather", "/weather/#radar"], ["16-day forecast", "weather", "/weather/#days"], ["Add a friend", "chats", "/chats/#add"], ["Friend requests", "chats", "/chats/#requests"]];

// the Apps provider: every module (REGISTRY) and app beside (connectors.js STATIC) with its sections; a module that's
// switched off is listed as STATIC has it (its hub page's), and an app's sections only where the account has the app
// (view.apps[app] !== false); Mail, the site admin's alone, not listed at all for anyone else
function appsProvider(F) {
  let st = null;
  const on = (a) => !!F.session?.apps?.[a], has = (a) => F.session?.view?.apps?.[a] !== false;
  const yours = yoursOf(F);
  const mod = (R) => ({ app: R.app, name: R.name, icon: R.app, href: R.path, links: R.sections.slice(1).map(([id, l]) => [l, R.path + "#" + id]) });
  const load = () => (st ||= import("./connectors.js").then((c) => c.STATIC, () => ({}))).then((S) =>
    [...Object.values(REGISTRY).filter((R) => !S[R.app]).map(mod), ...Object.values(S).map((c) => (REGISTRY[c.app] && on(c.app) ? mod(REGISTRY[c.app]) : c))]
      .filter((c) => yours(c.app)).flatMap((c) => [{ title: c.name, sub: "App", icon: c.icon, href: c.href }, ...(has(c.app) ? c.links || [] : []).map(([l, href]) => ({ title: `${c.name} · ${l}`, sub: c.name, icon: c.icon, href })),
        ...(has(c.app) ? ALSO.filter(([, a]) => a === c.app).map(([title, , href]) => ({ title, sub: c.name, icon: c.icon, href })) : [])]));
  return {
    id: "apps", group: "Apps", order: 10,
    search: (q) => load().then((a) => (q.trim() ? a.filter((e) => match(q, e.title)) : a)),
  };
}

let n = 0;
export function createSearch(F) {
  const provs = new Set([appsProvider(F)]);
  let h = null, t = 0, gen = 0;
  function open() {
    if (h) return h;
    const ui = F.ui, id = `ifl-sr-${++n}`, yours = yoursOf(F), has = (a) => !a || F.session?.view?.apps?.[a] !== false;
    const input = ui.el("input", { type: "search", role: "combobox", placeholder: "Search", "aria-label": "Search everything", "aria-controls": id, "aria-expanded": "true", "aria-autocomplete": "list", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "go" });
    const clear = ui.el("button", { class: "ifl-clear", type: "button", "aria-label": "Clear", hidden: true }, ui.icon("x"));
    const box = ui.el("div", { class: "ifl-field search" }, ui.icon("search"), input, clear);
    const list = ui.el("div", { class: "ifl-results", id, role: "listbox", "aria-label": "Results" });
    const say = ui.el("p", { class: "ifl-none", role: "status" });
    const wide = new Set();
    let opts = [], at = -1, last = null, lastQ = "", was = null, waiting = false, asked = null;
    // (the highlighted one: aria-activedescendant on the field, aria-selected on it, kept in sight)
    const mark = (i, scroll = true) => {
      at = opts.length ? Math.max(-1, Math.min(opts.length - 1, i)) : -1;
      opts.forEach((o, j) => o.setAttribute("aria-selected", String(j === at)));
      if (at >= 0) { input.setAttribute("aria-activedescendant", opts[at].id); if (scroll) opts[at].scrollIntoView?.({ block: "nearest" }); }
      else input.removeAttribute("aria-activedescendant");
    };
    const option = (r, e, key) => {
      r.setAttribute("role", "option"); r.id = `${id}-${key}`; r.tabIndex = -1;
      // (opened: kept in Recent, when it has an address to go back to)
      if (e.href) r.addEventListener("click", () => remember(F, e));
      return r;
    };
    // (a title with what matched in bold: its letters as text, never markup)
    const bold = (r, title, hits) => {
      const b = r.querySelector(".ifl-tx b");
      if (!b || !hits?.length) return r;
      const kids = [];
      let k = 0;
      for (const [a, z] of hits) { if (a > k) kids.push(title.slice(k, a)); kids.push(ui.el("mark", { class: "ifl-hit", text: title.slice(a, z) })); k = z; }
      if (k < title.length) kids.push(title.slice(k));
      b.replaceChildren(...kids);
      return r;
    };
    const rowOf = (e, key, hits) => {
      const r = ui.row({ lead: e.avatar != null ? { avatar: e.avatar } : e.icon ? { app: e.icon } : null, title: e.title, sub: e.sub, trail: "chevron", href: e.href, run: e.href ? null : () => { close(); e.run(); }, label: e.label });
      return bold(option(r, e, key), e.title, hits);
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
      const apps = APPS().filter(yours).map((a) => {
        const R = REGISTRY[a], ic = a === "chats" ? "chat" : a;
        return option(ui.el("a", { class: "ifl-sr-app", href: R.path, "aria-label": R.name }, ui.icon(null, { app: ic, size: 40 }), ui.el("span", { text: R.name })), { title: R.name, sub: "App", icon: ic, href: R.path }, `app-${a}`);
      });
      const kept = recents(F).slice(0, RECENT_SHOWN);
      const wipe = ui.el("button", { class: "ifl-sr-more", type: "button", text: "Clear", "aria-label": "Clear Recent" });
      wipe.addEventListener("click", () => { forget(); draw(); input.focus({ preventScroll: true }); });
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
    const drawn = (r, settled, q) => {
      const showAll = (g) => {
        const b = ui.el("button", { class: "ifl-sr-more", type: "button", text: "Show all", "aria-label": `Show all ${g.group || ""}`.trim(), "aria-expanded": "false" });
        b.addEventListener("click", () => { wide.add(g.id); draw(); input.focus({ preventScroll: true }); });
        return b;
      };
      const gs = [];
      if (r.top) gs.push(group("top", "Top hit", [rowOf(r.top.e, "top", r.top.hits)], null, "top"));
      for (const g of r.groups) {
        const full = wide.has(g.id), shown = full ? g.entries : g.entries.slice(0, SHOW);
        gs.push(group(g.id, g.group || g.id, shown.map((x, i) => rowOf(x.e, `${g.id}-${i}`, x.hits)), !full && g.all > SHOW ? showAll(g) : null));
      }
      if (r.more.length) gs.push(group("more", "More", r.more.map((x, i) => rowOf(x.e, `more-${i}`))));
      list.replaceChildren(...gs);
      say.textContent = q && !gs.length && settled ? `Nothing for “${q}”` : "";
      // (a late answer leaves the highlight where ↑/↓ put it; a new query starts it at the top)
      done(q === was ? at : 0);
      was = q;
    };
    function draw() {
      const q = input.value.trim();
      if (!q) home();
      else if (last) drawn(rank(last.groups, q, { recent: recents(F) }), last.settled, q);
    }
    const run = () => {
      const q = input.value.trim(), my = ++gen;
      waiting = false;
      clear.hidden = !input.value;
      if (q !== lastQ) wide.clear();
      lastQ = q;
      if (!q) { last = null; return home(); }
      // (Mail's provider, the admin's alone, asked only for them)
      asked = collect([...provs].filter((p) => p.id !== "mail" || yours("mail")), q, (g, s) => { if (my === gen && h) { last = { groups: g, settled: s }; draw(); } });
    };
    input.addEventListener("input", () => { clearTimeout(t); waiting = true; t = setTimeout(run, 80); });
    input.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!opts.length) return;
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
      if (i >= 0 && i !== at) mark(i, false);
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
