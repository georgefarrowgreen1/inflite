// Mail's module: the list (One roof stage 4, spec §4.1, §2.1, S4-D9; app.js 3012–3943). view(el, ctx) → { draw, hide,
// destroy } (every Mail view's signature, B0-b).
//   The "Search Mail" field: typing narrows what's loaded, on this phone; Enter (or "Search Mail for …" from InFlite's
//   search) asks Mail by POST (actions.load, store query), never a URL, and nothing is remembered. The chips under it:
//   the filter, the address and the search, each with its ✕. Then what's being sent (the outbox, each with Undo or Try
//   Again), the rows by day (none in Later), Updates as a digest, Load More; or the caught-up screen (the next back from
//   Later, the newest Updates' senders), the empty words of each place (app.js emptyEl), a search's alternatives with
//   their counts (POST, count), or "Couldn’t reach Mail" with Try Again and Open Mail on Its Own; the gate and offline words are mail.js's.
//   A row's tap: on a phone, the reader as a history entry (fw.nav.go("/mail/#thread=<id>"), S4-D6); on an iPad, the
//   pane (store threadId). A draft's tap opens it in compose.
import { threadRow, swipes } from "./rows.js";
import { MAIL } from "./api.js";

export function view(el, ctx) {
  const { store, fw, logic, actions } = ctx, ui = fw.ui;
  const doc = el.ownerDocument;
  let typed = "", shownSig = "";
  const field = ui.field({ type: "search", placeholder: "Search Mail", label: "Search Mail",
    onInput: (v) => { typed = v; if (!v.trim() && store.get().query) search(""); else draw(); },
    onEnter: (v) => search(v) });
  field.classList.add("ml-search");
  field.input.setAttribute("enterkeyhint", "search");
  const chips = ui.el("div", { class: "ml-chips", role: "group", "aria-label": "Showing" });
  const box = ui.el("div", { class: "ml-out", "aria-live": "polite" });
  const rows = ui.el("div", { class: "ml-rows" });
  const foot = ui.el("div", { class: "ml-foot" });
  const sentinel = ui.el("div", { class: "ml-end", "aria-hidden": "true" });
  el.append(field, chips, box, rows, foot, sentinel);

  function search(q) {
    q = String(q || "").trim().slice(0, 300);
    typed = q;
    field.input.value = q;
    if (q === store.get().query) return draw();
    store.set({ query: q }, "search");
    actions.load();
  }
  const open = (id) => {
    if (!logic.idOk(id)) return;
    if (store.get().layout === "pad") store.set({ threadId: id }, "row");
    else fw.nav.go(fw.nav.href("thread", id));
  };
  const byId = (id) => store.get().list.rows.find((r) => r.id === id);
  const offSwipe = swipes(rows, ctx, {
    done: (id) => { const t = byId(id); if (t) actions.act([id], logic.leadAction(t).act); },
    later: (id) => { const t = byId(id); if (!t) return; if (t.trashed) actions.act([id], t.starred ? "unflag" : "flag"); else ctx.open.later([id]); },
    menu: (id) => { const t = byId(id); if (t) ctx.open.rowMenu(t); },
  });
  const click = (e) => {
    const row = e.target.closest?.(".ml-row");
    if (!row || row.dataset.swiped) return;
    if (row.dataset.draft) return ctx.open.compose({ draftId: row.dataset.draft });
    open(row.dataset.thread);
  };
  const key = (e) => {
    const row = e.target.closest?.(".ml-row");
    if (row && e.target === row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); click({ target: row }); }
  };
  rows.addEventListener("click", click);
  rows.addEventListener("keydown", key);

  // (the next page as the foot comes into sight)
  const io = globalThis.IntersectionObserver ? new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting) && store.get().list.more) actions.load({ more: true }); }, { rootMargin: "400px" }) : null;
  io?.observe(sentinel);

  const words = (s) => {
    if (s.box === "trash") return ["Trash is empty", "What you put here goes for good after 30 days."];
    if (s.box === "drafts") return ["No drafts", null];
    if (s.filter !== "all" && (s.lens === "people" || s.lens === "updates")) return [`Nothing ${s.filter === "unread" ? "unread" : s.filter === "flagged" ? "flagged" : "with attachments"} here`, null];
    if (s.address) return [`Nothing waiting for ${s.address}`, null];
    return { updates: ["No updates waiting", null], later: ["Nothing put off", null], done: ["Nothing done yet", null] }[s.lens] || ["Nothing here", null];
  };
  function caughtUp(s) {
    const c = s.counts || {}, n = c.nextLater, ups = (c.updatesFrom || []).map((p) => logic.displayName(p).split(/\s+/)[0]).filter(Boolean);
    return ui.el("div", { class: "ml-caught" },
      ui.empty({ title: "All caught up", body: "Nothing from people is waiting." }),
      n?.at ? ui.row({ lead: { time: logic.fmtWhen(n.at) }, title: `${logic.displayName(n.from) || "A conversation"} is back from Later`, sub: n.subject || "", run: () => fw.nav.section("later"), label: `Later: ${logic.displayName(n.from) || "a conversation"}, back ${logic.fmtWhen(n.at)}` }) : null,
      ups.length ? ui.row({ lead: { icon: "bell" }, title: "Newest in Updates", sub: ups.join(", "), run: () => fw.nav.section("updates") }) : null);
  }
  // (a search that finds nothing: the searches beside it that do, each with its count, asked for by POST)
  let alts = { q: null, found: null };
  function noResults(s) {
    const q = s.query, inTrash = /\bin:trash\b/i.test(q);
    const altBox = ui.el("div", { class: "ml-alts" });
    const fill = () => altBox.replaceChildren(...(alts.found?.length ? [ui.label("Try instead"), ui.list(alts.found.map((a) => ui.row({ title: a.label, sub: a.sub, value: a.n > 998 ? "999+" : String(a.n), trail: "chevron", run: () => search(a.q), label: `${a.label}: ${a.n} conversation${a.n === 1 ? "" : "s"}` })))] : []));
    if (alts.q !== q) {
      alts = { q, found: null };
      const list = inTrash ? [{ label: "Not in Trash", sub: "Everywhere else", q: q.replace(/\s*\bin:trash\b/i, "").trim() }] : [{ label: "In Trash", sub: "Deleted mail isn’t searched otherwise", q: `${q} in:trash` }];
      Promise.all(list.map((a) => (a.q ? ctx.api.search({ q: a.q, view: "all", count: true }).then((r) => (a.n = Number(r?.count) || 0), () => (a.n = 0)) : (a.n = 0)))).then(() => {
        if (alts.q !== q) return;
        alts.found = list.filter((a) => a.n > 0);
        const live = rows.querySelector(".ml-alts");
        if (live) { live.replaceWith(altBox); fill(); }
      });
    } else fill();
    return ui.el("div", { class: "ml-none" }, ui.empty({ title: "No Results", body: `Nothing matches “${logic.sayQuery(q)}”.` }), altBox);
  }

  function drawChips(s) {
    const c = [];
    if (s.filter !== "all" && !s.box && !s.query) c.push(ui.chip(logic.FILTERS.find((f) => f.k === s.filter)?.label || s.filter, { run: () => { store.set({ filter: "all" }, "chip"); actions.load(); }, label: "Show all mail" }));
    if (s.address && !s.query) c.push(ui.chip(`to ${s.address.split("@")[0]}@`, { run: () => { store.set({ address: null }, "chip"); actions.load(); }, label: `Show mail to every address, not only ${s.address}` }));
    if (s.box && !s.query) c.push(ui.chip(s.box === "trash" ? "Trash" : "Drafts", { run: () => { store.set({ box: null }, "chip"); actions.load(); }, label: `Leave ${s.box === "trash" ? "Trash" : "Drafts"}` }));
    if (s.query) c.push(ui.chip(logic.sayQuery(s.query), { run: () => search(""), label: "Clear Search" }));
    chips.replaceChildren(...c);
    chips.hidden = !c.length;
  }
  function drawOutbox(s) {
    box.replaceChildren(...s.outbox.map((it) => {
      const subj = it.draft?.subject || "(No Subject)";
      const act = it.state === "waiting" ? ui.btn("Undo", { small: true, act: "undo", run: () => ctx.outbox.undo(it.key) })
        : it.state === "failed" || it.state === "queued" ? ui.btn("Try Again", { small: true, act: "retry", run: () => ctx.outbox.retry(it.key) }) : null;
      const say = { waiting: "Sending…", sending: "Sending…", queued: "Waiting for a connection", failed: "Didn’t send" }[it.state] || "";
      return ui.el("div", { class: "ifl-row ml-sending", data: { key: it.key, state: it.state } }, ui.el("span", { class: "ifl-tx" }, ui.el("b", { text: subj }), ui.el("small", { text: say })), act ? ui.el("span", { class: "ifl-trail" }, act) : null);
    }));
    box.hidden = !s.outbox.length;
  }

  // (Mail unreachable, or its switch off: Try Again, or Mail at its own address, in a new tab, spec §8)
  function unreached(err) {
    const e = ui.error({ title: "Couldn’t reach Mail", body: err, acts: [{ label: "Try Again", act: "retry", primary: true, run: () => actions.load() }, { label: "Open Mail on Its Own", act: "own", href: MAIL + "/" }] });
    const a = e.querySelector('a[data-act="own"]');
    if (a) { a.target = "_blank"; a.rel = "noopener"; }
    return e;
  }

  function drawRows(s) {
    const L = s.list;
    const filter = typed.trim() && typed.trim() !== s.query ? typed.trim().toLowerCase() : "";
    const list = filter ? L.rows.filter((t) => [t.subject, t.snippet, t.latest?.snippet, ...(t.people || []).flatMap((p) => [p.name, p.email])].some((x) => String(x || "").toLowerCase().includes(filter))) : L.rows;
    // (the day too: "Today" and "Yesterday" are said again after midnight even if nothing else changed)
    const sig = JSON.stringify([logic.startOfDay(Date.now()), s.layout, s.threadId, s.lens, s.query, filter, L.loading, L.err, list.length && list.map((t) => [t.id, t.date, t.unread, t.starred, t.snoozeUntil, t.done, t.trashed, t.count, t.subject, t.category])]);
    if (sig === shownSig) return;
    shownSig = sig;
    const kept = rows.contains(doc.activeElement) ? doc.activeElement.closest(".ml-row")?.dataset : null;
    if (!list.length) {
      rows.removeAttribute("role");
      if (L.loading) rows.replaceChildren(ui.skeleton("rows", 6));
      else if (L.err) rows.replaceChildren(unreached(L.err));
      else if (filter) rows.replaceChildren(ui.empty({ title: "Nothing loaded matches", body: "Press Return to search all your mail." }));
      else if (s.query) rows.replaceChildren(noResults(s));
      else if (s.lens === "people" && s.filter === "all" && !s.address && !s.box) rows.replaceChildren(caughtUp(s));
      else { const [t, b] = words(s); rows.replaceChildren(ui.empty({ title: t, body: b })); }
    } else {
      rows.setAttribute("role", "list");
      const out = [];
      let day = null;
      for (const t of list) {
        const d = s.lens === "later" && !s.query && !s.box ? null : logic.dayLabel(t.sort ?? t.date);
        if (d && d !== day) out.push(ui.el("div", { class: "ml-day", role: "presentation", text: d }));
        day = d;
        const w = threadRow(t, ctx);
        w.setAttribute("role", "listitem");
        out.push(w);
      }
      rows.replaceChildren(...out);
    }
    if (kept) rows.querySelector(kept.thread ? `.ml-row[data-thread="${CSS.escape(kept.thread)}"]` : `.ml-row[data-draft="${CSS.escape(kept.draft || "")}"]`)?.focus({ preventScroll: true });
    foot.replaceChildren(L.more && list.length ? (L.loading ? ui.skeleton("rows", 1) : ui.btn("Load More", { act: "more", run: () => actions.load({ more: true }) })) : "");
  }

  function draw() {
    const s = store.get();
    if (field.input.value !== typed && doc.activeElement !== field.input) field.input.value = typed = s.query;
    drawChips(s);
    drawOutbox(s);
    drawRows(s);
  }
  const offs = ["list", "query", "lens", "filter", "address", "box", "counts", "outbox", "layout", "threadId"].map((k) => store.on(k, () => draw()));

  return {
    draw,
    hide() {},
    focusSearch() { field.input.focus(); },
    destroy() {
      for (const f of offs) f();
      offSwipe();
      io?.disconnect();
      rows.removeEventListener("click", click);
      rows.removeEventListener("keydown", key);
      el.replaceChildren();
    },
    swiping: () => offSwipe.active(),
  };
}
