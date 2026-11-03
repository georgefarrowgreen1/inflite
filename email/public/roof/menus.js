// Mail's module: its menus, as framework sheets (One roof stage 4, spec §2.2, S4-D18, S4-D26, BB4; app.js listMenu
// 2892, laterMenu/pickTime 4186–4260, rowItems 4235, unsubSheet 4269, confirmMenu). fw.sheet.open, Mail's accent, no
// history (D22); the names are the hooks' (§10.2).
//   openViews(ctx)          "mail-views": filters (in People and Updates), Mark All as Read, each address with its count,
//                           Drafts, Trash (with Empty Trash there), Mail Settings last (→ ctx.open.settings())
//   openLater(ctx, ids)     "mail-later": logic.laterChoices() and Pick a Time; Back to Inbox Now for one put off already
//   openRowMenu(ctx, t)     "mail-rowmenu": Reply, Forward, Done, Later, Flag, Mark as Unread, Move to People/Updates,
//                           Always Show …, Unsubscribe, Trash (Delete Forever in the Trash)
//   openUnsub(ctx, t)       "mail-unsub": asked first, with how often you open them
//   confirm(ctx, spec) → Promise<boolean>   "mail-confirm": spec = { title, text, yes, no, danger }
export const SHEETS = { views: "mail-views", later: "mail-later", rowMenu: "mail-rowmenu", unsub: "mail-unsub", confirm: "mail-confirm" };

const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function openViews(ctx) {
  const { store, fw, logic, actions } = ctx, ui = fw.ui, s = store.get(), c = s.counts || {};
  let h = null;
  const go = (patch) => () => { h?.close(); store.set({ query: "", ...patch }, "views"); actions.load(); };
  const tick = (on) => (on ? ui.el("span", { class: "ml-tick", "aria-hidden": "true" }, ctx.icon("done")) : null);
  const groups = [];
  if ((s.lens === "people" || s.lens === "updates") && !s.box)
    groups.push(ui.list(logic.FILTERS.map((f) => {
      const r = ui.row({ title: f.label, trail: tick(s.filter === f.k && !s.address), run: go({ filter: f.k, address: null, box: null }), act: `filter-${f.k}` });
      r.setAttribute("aria-current", String(s.filter === f.k && !s.address));
      return r;
    }), { label: "Show" }));
  const addrs = Object.entries(c.byAddress || {});
  if (addrs.length > 1)
    groups.push(ui.list(addrs.map(([a, n]) => ui.row({ title: `Only Mail to ${a.split("@")[0]}@`, value: n ? String(n) : "", trail: tick(s.address === a), run: go({ address: s.address === a ? null : a, box: null }), label: `${a}${n ? `, ${n} unread` : ""}` })), { label: "Addresses" }));
  const more = [
    ui.row({ lead: { icon: "pen" }, title: "Drafts", value: c.drafts ? String(c.drafts) : "", trail: tick(s.box === "drafts"), run: go({ box: "drafts", address: null }), act: "drafts" }),
    ui.row({ lead: { icon: "x" }, title: "Trash", value: c.trash ? String(c.trash) : "", trail: tick(s.box === "trash"), run: go({ box: "trash", address: null }), act: "trash" }),
  ];
  if (s.box !== "trash" && s.list.rows.some((t) => t.unread)) more.unshift(ui.row({ title: "Mark All as Read", run: () => { h?.close(); actions.markAllRead(); }, act: "readall" }));
  if (s.box === "trash") more.push(ui.row({ title: "Empty Trash", run: async () => { h?.close(); const n = c.trash || s.list.rows.length; if (await ctx.open.confirm({ title: "Empty Trash?", text: `${n === 1 ? "1 conversation" : `${n || "All"} conversations`} will be deleted. This can’t be undone.`, yes: "Empty Trash", danger: true })) actions.emptyTrash(); }, act: "empty" }));
  if (s.box || s.address) more.unshift(ui.row({ title: `Back to ${logic.LENSES.find((l) => l.k === s.lens)?.label || "People"}`, run: go({ box: null, address: null }), act: "back" }));
  groups.push(ui.list(more));
  groups.push(ui.list([ui.row({ lead: { icon: "gear" }, title: "Mail Settings", trail: "chevron", run: () => { h?.close(); ctx.open.settings(); }, act: "settings" })]));
  h = fw.sheet.open({ sheet: SHEETS.views, title: logic.viewTitle(s), body: ui.el("div", { class: "ml-sheet" }, groups) });
  return h;
}

export function openLater(ctx, ids) {
  const { store, fw, logic, actions } = ctx, ui = fw.ui;
  ids = [].concat(ids).filter(Boolean);
  const t = store.get().list.rows.find((r) => r.id === ids[0]) || (store.get().thread?.t?.id === ids[0] ? store.get().thread.t : null);
  let h = null;
  const put = (until) => { h?.close(); actions.act(ids, "snooze", { until }); };
  const rows = logic.laterChoices().map((c) => ui.row({ lead: { icon: "clock" }, title: c.label, value: c.timeOnly ? logic.fmtTime(c.until) : logic.fmtWhen(c.until), run: () => put(c.until) }));
  rows.push(ui.row({ lead: { icon: "pen" }, title: "Pick a Time", trail: "chevron", act: "pick", run: () => h?.push({ page: "pick", title: "Bring It Back On…", body: (pg) => {
    const pad = (n) => String(n).padStart(2, "0");
    const local = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const input = ui.el("input", { type: "datetime-local", class: "ml-when", "aria-label": "When it comes back", value: local(logic.at(1, 8)), min: local(Date.now() + 60000) });
    const set = () => { const until = new Date(input.value).getTime(); if (!Number.isFinite(until) || until <= Date.now()) return fw.toast("Choose a time in the future"); put(until); };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") set(); });
    pg.append(ui.el("label", { class: "ifl-field" }, input), ui.el("div", { class: "ifl-acts" }, ui.btn("Later", { primary: true, act: "later", run: set })));
    input.focus({ preventScroll: true });
  } }) }));
  if (t?.snoozeUntil) rows.push(ui.row({ lead: { icon: "back" }, title: "Back to Inbox Now", run: () => { h?.close(); actions.act(ids, "unsnooze"); } }));
  h = fw.sheet.open({ sheet: SHEETS.later, title: t?.snoozeUntil ? `Comes back ${logic.fmtWhen(t.snoozeUntil)}` : "Bring It Back…", body: ui.list(rows) });
  return h;
}

export function openRowMenu(ctx, t) {
  const { fw, logic, actions, api, store } = ctx, ui = fw.ui;
  let h = null;
  const run = (f) => () => { h?.close(); f(); };
  const lead = logic.leadAction(t);
  // (a reply: to the newest message, from its summary only; Mail's server quotes it, S4-D4)
  const reply = (mode) => async () => {
    h?.close();
    try {
      const id = t.latestId || t.latest?.id;
      if (!id) throw new Error("Open the conversation to reply.");
      const m = await api.meta(id);
      ctx.open.compose(logic.replyDraft(m, mode, store.get().me));
    } catch (e) { fw.toast(e.message || "Couldn’t open that. Try again."); }
  };
  const other = t.category === "updates" ? "people" : "updates", where = other === "people" ? "People" : "Updates";
  const sender = t.from && !t.people?.every((p) => p.me) ? logic.displayName(t.from) : null;
  const rows = [
    ui.row({ lead: { icon: "send" }, title: "Reply", act: "reply", run: reply("reply") }),
    ui.row({ lead: { icon: "share" }, title: "Forward", act: "forward", run: reply("forward") }),
    ui.row({ title: lead.act === "done" ? "Done" : lead.label, act: lead.act, run: run(() => actions.act([t.id], lead.act)) }),
    !t.trashed && ui.row({ lead: { icon: "clock" }, title: "Later…", act: "later", run: () => { h?.close(); ctx.open.later([t.id]); } }),
    ui.row({ title: t.starred ? "Unflag" : "Flag", act: "flag", run: run(() => actions.act([t.id], t.starred ? "unflag" : "flag")) }),
    ui.row({ title: t.unread ? "Mark as Read" : "Mark as Unread", act: "unread", run: run(() => actions.act([t.id], t.unread ? "read" : "unread")) }),
    ui.row({ title: `Move to ${where}`, act: "move", run: run(() => actions.act([t.id], "category", { category: other })) }),
    sender && ui.row({ title: `Always Show ${sender} in ${where}`, run: run(() => actions.act([t.id], "category", { category: other, sender: true })) }),
    t.canUnsub && !t.trashed && ui.row({ title: "Unsubscribe…", act: "unsub", run: () => { h?.close(); ctx.open.unsub(t); } }),
    t.trashed
      ? ui.row({ title: "Delete Forever", act: "delete", run: async () => { h?.close(); if (await ctx.open.confirm({ title: "Delete Forever?", text: "This conversation will be deleted. This can’t be undone.", yes: "Delete Forever", danger: true })) actions.act([t.id], "delete", { undo: false }); } })
      : ui.row({ title: "Move to Trash", act: "trash", run: run(() => actions.act([t.id], "trash")) }),
  ].filter(Boolean);
  h = fw.sheet.open({ sheet: SHEETS.rowMenu, title: t.subject || "(No Subject)", body: ui.list(rows) });
  return h;
}

export async function openUnsub(ctx, t) {
  const { fw, api, logic, actions } = ctx, ui = fw.ui;
  let info;
  try { info = await api.unsubInfo(t.id); } catch (e) { fw.toast(e.message || "Couldn’t ask Mail. Try again."); return null; }
  const who = logic.displayName(info?.sender) || info?.sender?.email || "this sender";
  let h = null;
  const finish = () => { fw.toast(`Finish on ${who}’s page`); };
  const words = `${info?.of > 1 ? `You’ve opened ${info.opened} of their last ${plural(info.of, "email")}. ` : ""}${info?.how === "page" ? "Mail will open their page to finish." : info?.how === "mail" && info?.to ? `Mail will email ${info.to} to ask them to stop, and move what’s here to Done.` : "Mail will ask them to stop, and move what’s here to Done."}`;
  const body = ui.el("div", { class: "ml-sheet ml-unsub" }, ui.el("p", { class: "ifl-sub", text: words }));
  // (their page: opened by the tap itself, a link, as one opened once Mail's answered can be blocked as a pop-up)
  const acts = info?.page && /^https:\/\//i.test(info.page)
    ? [{ label: "Unsubscribe", primary: true, destructive: true, act: "unsub", href: info.page }]
    : [{ label: "Unsubscribe", primary: true, destructive: true, act: "unsub", run: async () => {
      h?.setBusy(true);
      try {
        const r = await api.unsubscribe(t.id);
        h?.close();
        if (r?.open && /^https:\/\//i.test(r.open)) { const w = globalThis.open(r.open, "_blank", "noopener"); if (!w) fw.toast(`Finish on ${who}’s page`); return; }
        fw.toast(`Unsubscribed from ${who}`);
        actions.counts(); actions.load({ quiet: true });
      } catch (e) { h?.setBusy(false); fw.toast(e.message || "Couldn’t unsubscribe. Try again."); }
    } }];
  acts.push({ label: "Cancel", act: "cancel", run: () => h?.close() });
  h = fw.sheet.open({ sheet: SHEETS.unsub, title: `Unsubscribe from ${who}?`, body, acts });
  const a = h.el.querySelector('a[data-act="unsub"]');
  if (a) { a.target = "_blank"; a.rel = "noopener noreferrer"; a.addEventListener("click", () => { h.close(); finish(); }); }
  return h;
}

export function confirm(ctx, spec) {
  spec = spec || {};
  const { fw } = ctx, ui = fw.ui;
  return new Promise((done) => {
    let said = false;
    const say = (v) => () => { if (said) return; said = true; done(v); h.close(); };
    const h = fw.sheet.open({
      sheet: SHEETS.confirm, title: spec.title || "Are You Sure?",
      body: spec.text ? ui.el("p", { class: "ifl-sub", text: spec.text }) : null,
      acts: [{ label: spec.no || "Cancel", act: "no", run: () => say(false)() }, { label: spec.yes || "OK", primary: true, destructive: !!spec.danger, act: "yes", run: () => say(true)() }],
      onClose: () => { if (!said) { said = true; done(false); } },
    });
  });
}
