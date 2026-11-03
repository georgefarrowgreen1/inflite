// Mail's reader under the roof (One roof stage 4, s4/spec §4.1, §2.1, S4-D6, D17, §3.1, §3.2; app.js:4631–4960, 5234):
// the head; message cards from api.meta (never /api/messages/<id>: the page never receives a body, §3.1); a body frame
// per expanded message (bodyframe.js; the newest one made on the row's tap from latestId, in parallel with the thread
// fetch); files (S4-D17: api.picture for logic.PICTURES only, api.fileUrl in a new tab for the rest); quick reply; the
// foot (Reply · Reply All · Forward · ⋯); on an iPad the toolbar (Done, Later, ⋯) and the sticky pane.
// Frozen: view(el, ctx) → { draw(), hide(), destroy() } (list.js's signature): el is the section.ml-reader mail.js made;
//   it draws store.threadId / store.thread; hide() destroys its frames' handles and revokes picture URLs.
//   Added (MR): readAt() → when a body frame last said it was touched (0 if never): mail.js's busy() (S4-D13).
// What it does with the store: on a new threadId it asks api.thread(id) unless store.thread already holds that thread
//   or is loading it, then api.meta for the newest and the few unread (≤ 5), each kept in store.thread.metas; opening an
//   unread conversation marks it read (ctx.actions.act([id], "read", { undo: false })).
// Hooks it keeps (§10.2): .m-mail iframe.mail-body (bodyframe.js makes them); .m-mail [data-act=done|later|reply|send].
// Nothing from a message's body is here: cards are Meta (summary fields) drawn with textContent; pictures are blob: URLs
// made only for logic.PICTURES, re-typed, used only in <img src> and revoked when the conversation goes.
import { bodyFrame, listenFrames, themeAll } from "./bodyframe.js";
import { STORAGE } from "./store.js";
import { MAIL } from "./api.js";

const RASTER = /^image\/(png|jpeg|gif|webp|avif|heic|bmp)$/;
const isPic = (a) => RASTER.test(String(a?.type || "").toLowerCase());
const REPLY_DAYS = 14 * 864e5;
const remoteOn = () => { try { return localStorage.getItem(STORAGE.remoteImages) === "1"; } catch (_) { return false; } };
// the replies typed at the foot, one per conversation, kept a fortnight (app.js qrDrafts, 4775–4790)
const replies = {
  all() { let k = null; try { k = JSON.parse(localStorage.getItem(STORAGE.replies) || "null"); } catch (_) {} return k && typeof k === "object" && !Array.isArray(k) ? k : {}; },
  get(id) { const d = this.all()[id]; return d && typeof d.text === "string" && Date.now() - d.at < REPLY_DAYS ? d.text : ""; },
  set(id, text) { const k = this.all(); for (const [x, d] of Object.entries(k)) if (!(Date.now() - d?.at < REPLY_DAYS)) delete k[x]; if (text) k[id] = { text, at: Date.now() }; else delete k[id]; try { localStorage.setItem(STORAGE.replies, JSON.stringify(k)); } catch (_) {} },
};
const thr = (r) => (r && r.thread ? { ...r.thread, messages: r.messages || r.thread.messages || [] } : r);

export function view(el, ctx) {
  const { store, api, logic, fw } = ctx, ui = fw.ui, E = ui.el;
  let cur = null, touched = 0;
  const offs = [];
  const off = listenFrames({
    remote(id, on) { const c = cur?.cards.get(id); if (c) c.banner.hidden = !on || c.loaded; },
    mailto(href) { const d = logic.mailtoDraft?.(href); if (d) ctx.open.compose(d); },
    touched() { touched = Date.now(); },
  });
  offs.push(off, fw.on("theme", (t) => themeAll(t)));
  for (const k of ["threadId", "thread", "layout", "offline"]) offs.push(store.on(k, () => draw()));

  const me = () => store.get().me || {};
  const pad = () => store.get().layout === "pad";
  const pill = (label, act, icon, run) => { const b = ui.btn(label, { small: true, act, run }); b.prepend(ctx.icon(icon)); return b; };

  // ---- a conversation opened: its frame for the newest at once, its messages, then the newest few's Meta
  function open(id) {
    shut();
    if (!id) {
      el.replaceChildren(pad() ? ui.empty({ title: "Choose a conversation", body: "It opens here." }) : "");
      return;
    }
    const s = store.get(), row = s.list?.rows?.find((r) => r.id === id);
    cur = { id, cards: new Map(), frames: new Map(), urls: [], expanded: new Set(), qr: null };
    cur.head = E("header", { class: "mr-head", tabindex: "-1" });
    cur.msgs = E("div", { class: "mr-msgs" });
    cur.foot = E("footer", { class: "mr-foot" });
    cur.bar = E("div", { class: "mr-bar", role: "toolbar", "aria-label": "Conversation" });
    el.replaceChildren(cur.bar, cur.head, cur.msgs, cur.foot);
    // (the newest message's frame, made on the tap from the row's latestId, while the thread is still on its way)
    if (row?.latestId) {
      cur.expanded.add(row.latestId);
      cur.msgs.append(card({ id: row.latestId, from: row.from || row.latest?.from || {}, date: row.date, threadId: id }, true));
    }
    const t = s.thread?.t;
    if (t?.id === id && t.messages) loaded(t);
    else if (!(s.thread?.loading && s.thread?.t?.id === id)) load(id);
  }
  async function load(id) {
    store.set({ thread: { t: null, metas: {}, loading: true, err: null } }, "reader");
    let t;
    try { t = thr(await api.thread(id)); }
    catch (e) { if (cur?.id === id) store.set({ thread: { t: null, metas: {}, loading: false, err: e?.message || "Couldn’t open it." } }, "reader"); return; }
    if (cur?.id !== id) return;
    store.set({ thread: { t, metas: {}, loading: false, err: null } }, "reader");
    loaded(t);
    if (t.unread) ctx.actions.act([id], "read", { undo: false }).catch?.(() => {});
  }
  function loaded(t) {
    const msgs = t.messages || [];
    if (!cur.expanded.size && msgs[0]) cur.expanded.add(msgs[0].id);
    for (const m of msgs.filter((m) => m.unread && m.folder === "inbox").slice(0, 5)) cur.expanded.add(m.id);
    // (the early frame was for the newest; if Mail says otherwise, that one opens too)
    if (msgs[0]) cur.expanded.add(msgs[0].id);
    for (const mid of cur.expanded) meta(mid);
  }
  async function meta(mid) {
    const id = cur?.id, have = store.get().thread.metas?.[mid];
    if (have) return have;
    try {
      const m = await api.meta(mid);
      if (cur?.id !== id) return null;
      const th = store.get().thread;
      store.set({ thread: { ...th, metas: { ...th.metas, [mid]: m } } }, "reader");
      return m;
    } catch (e) {
      const c = cur?.id === id && cur.cards.get(mid);
      if (c) c.files.replaceChildren(ui.error({ body: e?.message || "Couldn’t load it.", acts: [{ label: "Try Again", act: "retry", run: () => meta(mid) }] }));
      return null;
    }
  }

  // ---- a message's card: made once, filled in place (a frame moved in the page would load again)
  function card(m, early = false) {
    const c = { id: m.id, el: E("article", { class: "mr-card", data: { mid: m.id } }), loaded: false };
    c.top = E("button", { type: "button", class: "mr-mhead" });
    c.top.addEventListener("click", () => toggle(m.id));
    c.body = E("div", { class: "mr-body" });
    c.banner = E("p", { class: "mr-remote", hidden: true }, E("span", { text: "Remote pictures are hidden to protect your privacy." }), " ",
      ui.btn("Load", { small: true, act: "load-remote", run: () => { c.loaded = true; c.banner.hidden = true; cur?.frames.get(m.id)?.allowImages(); } }));
    c.files = E("div", { class: "mr-files" });
    c.when = E("p", { class: "mr-when" });
    c.el.append(c.top, c.banner, c.body, c.files, c.when);
    cur.cards.set(m.id, c);
    paintCard(c, m, early);
    return c.el;
  }
  function paintCard(c, m, early) {
    const open = cur.expanded.has(m.id), sent = m.folder === "sent", who = sent ? "You" : logic.displayName(m.from) || "Unknown Sender";
    c.el.classList.toggle("open", open);
    c.el.classList.toggle("unread", !!m.unread && m.folder === "inbox");
    c.top.setAttribute("aria-expanded", String(open));
    const to = (m.to || []).map((p) => (!sent && p.email === m.mailbox ? "you" : logic.displayName(p))).join(", ");
    c.top.replaceChildren(ui.avatar(logic.displayName(m.from) || "?"), E("span", { class: "mr-who" },
      E("b", { text: open ? who : who.split(/\s+/)[0] }), E("small", { text: open ? (to ? `to ${to}` : m.from?.email || "") : m.snippet || "" })),
      E("span", { class: "mr-date", text: m.date ? logic.fmtListDate?.(m.date) || "" : "" }));
    c.when.textContent = open && m.date ? logic.fmtLongDate?.(m.date) || "" : "";
    if (!open) { dropFrame(m.id); c.body.replaceChildren(); c.files.replaceChildren(); c.banner.hidden = true; return; }
    if (!cur.frames.has(m.id)) {
      const f = bodyFrame(m, { theme: fw.theme(), images: remoteOn(), eager: early || m.id === store.get().thread.t?.messages?.[0]?.id });
      cur.frames.set(m.id, f);
      // (no frame: the shell can't be had here; never the body itself, only the snippet and a way to Mail)
      c.body.replaceChildren(f?.el || E("div", { class: "mr-noframe" }, m.snippet ? E("p", { text: m.snippet }) : null,
        E("a", { href: `${MAIL}/#thread=${encodeURIComponent(cur.id)}`, target: "_blank", rel: "noopener", text: "Open in Mail" })));
    }
    files(c, m.attachments);
  }
  function dropFrame(id) { cur?.frames.get(id)?.destroy?.(); cur?.frames.delete(id); }
  function toggle(id) {
    if (!cur) return;
    if (cur.expanded.has(id)) cur.expanded.delete(id);
    else { cur.expanded.add(id); meta(id); }
    paint();
  }

  // ---- files: pictures by CORS as re-typed blobs, the rest at Mail's address in a new tab (S4-D17)
  function files(c, list) {
    if (!Array.isArray(list) || c.filesFor === list) return;
    c.filesFor = list;
    const pics = list.filter(isPic), rest = list.filter((a) => !isPic(a));
    const gal = pics.length ? E("div", { class: "mr-gallery", role: "list" }) : null;
    pics.slice(0, 6).forEach((a, i) => {
      const b = E("button", { type: "button", class: "mr-tile", role: "listitem", "aria-label": `${a.filename}, ${logic.fmtSize?.(a.size) || ""}` });
      b.addEventListener("click", () => ctx.open.viewer(pics.map((p) => ({ ...p, url: p._url })), i));
      gal.append(b);
      picture(a).then((u) => { if (!u) return; a._url = u; const img = E("img", { alt: "", decoding: "async" }); img.src = u; b.replaceChildren(img); });
    });
    c.files.replaceChildren(gal || "", ...rest.map((a) => E("a", { class: "mr-file", href: api.fileUrl(a.id), target: "_blank", rel: "noopener", data: { act: "file" } },
      ctx.icon("attachment"), E("span", {}, E("b", { text: a.filename || "File" }), E("small", { text: logic.fmtSize?.(a.size) || "" })))));
  }
  async function picture(a) {
    const id = cur?.id, type = String(a.type).toLowerCase();
    if (!RASTER.test(type)) return null;
    try {
      const blob = new Blob([await (await api.picture(a.id)).arrayBuffer()], { type });
      if (cur?.id !== id) return null;
      const u = URL.createObjectURL(blob);
      cur.urls.push(u);
      return u;
    } catch (_) { return null; }
  }

  // ---- the head, the bar and the foot
  function paintHead(t) {
    const ps = (t.people || []).slice(0, 4).map((p) => (p.me ? "you" : (p.name || p.email || "").split(/[\s@]/)[0]));
    const who = ps.length > 1 ? `${ps.slice(0, -1).join(", ")} and ${ps[ps.length - 1]}` : ps[0] || "";
    cur.head.replaceChildren(...[
      E("h2", { class: "mr-subject", text: t.subject || "(No Subject)" }),
      E("p", { class: "mr-meta", text: [who && who[0].toUpperCase() + who.slice(1), t.count > 1 && `${t.count} messages`, t.trashed ? "In Trash" : t.done && "Done"].filter(Boolean).join(" · ") }),
      t.snoozeUntil ? E("p", { class: "mr-later" }, ctx.icon("later"), E("span", { text: `Comes back ${logic.fmtWhen?.(t.snoozeUntil) || ""}` }),
        ui.btn("Bring Back Now", { small: true, act: "unsnooze", run: () => ctx.actions.act([t.id], "unsnooze") })) : null,
    ].filter(Boolean));
  }
  function acts(t) {
    const lead = t.trashed ? ["Restore", "restore"] : t.done ? ["Inbox", "inbox"] : ["Done", "done"];
    return [pill(lead[0], lead[1], lead[1] === "done" ? "done" : "inbox", () => ctx.actions.act([t.id], lead[1])),
      t.trashed ? null : pill("Later", "later", "later", () => ctx.open.later([t.id])),
      ui.iconBtn("more", { label: "More", act: "more", run: () => ctx.open.rowMenu(t) })].filter(Boolean);
  }
  function paintFoot(t) {
    cur.bar.hidden = !pad();
    if (pad()) cur.bar.replaceChildren(...acts(t));
    for (const b of cur.bar.querySelectorAll("[data-act=more]")) b.replaceChildren(ctx.icon("more"));
    if (!cur.qr) cur.qr = quick(t);
    const newest = t.messages?.find((m) => m.folder !== "sent") || t.messages?.[0];
    const row = E("div", { class: "mr-replies" },
      pill("Reply", "reply", "reply", () => write(t, "reply")), pill("Reply All", "reply-all", "reply-all", () => write(t, "replyAll")),
      pill("Forward", "forward", "forward", () => write(t, "forward")),
      newest ? E("a", { class: "ifl-btn small", href: api.rawUrl(newest.id), target: "_blank", rel: "noopener", data: { act: "original" }, text: "Open Original" }) : null);
    cur.foot.replaceChildren(pad() ? "" : E("div", { class: "mr-acts" }, ...acts(t)), cur.qr, row);
    for (const b of cur.foot.querySelectorAll("[data-act=more]")) b.replaceChildren(ctx.icon("more"));
  }
  // (replies go to the newest message someone else sent, or the newest if it's all yours)
  async function target(t) {
    const m = t.messages?.find((x) => x.folder !== "sent") || t.messages?.[0];
    return m ? store.get().thread.metas?.[m.id] || (await meta(m.id)) : null;
  }
  async function write(t, mode) {
    const m = await target(t);
    if (m) ctx.open.compose(logic.replyDraft(m, mode, me()));
    else fw.toast("Couldn’t open that message. Try again in a moment.");
  }
  // a reply typed at the foot: to whoever wrote last, sent through the outbox as compose sends (app.js:4796–4846)
  function quick(t) {
    const last = t.messages?.find((m) => m.folder !== "sent");
    const first = last ? (logic.displayName(last.from) || "").split(/\s+/)[0] : "";
    const said = first ? `Reply to ${first}` : "Reply";
    const f = E("textarea", { class: "mr-qr-text", rows: "1", placeholder: `${said}…`, "aria-label": said, enterkeyhint: "enter" });
    f.value = replies.get(t.id);
    const send = ui.iconBtn("send", { label: "Send", act: "send", run: () => go() });
    send.replaceChildren(ctx.icon("reply"));
    const sync = () => { send.disabled = !f.value.trim(); };
    f.addEventListener("input", () => { replies.set(t.id, f.value); sync(); });
    f.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
    sync();
    async function go() {
      const text = f.value.trim();
      if (!text) return;
      const m = await target(t);
      if (!m) return fw.toast("Couldn’t send that. Try again in a moment.");
      const d = logic.replyDraft(m, "reply", me());
      const sig = (me().addresses || []).find((a) => a.email === String(d.from || "").toLowerCase())?.signature || me().signature || "";
      d.text = sig ? `${text}\n\n${sig}` : text;
      f.value = ""; sync(); f.blur(); replies.set(t.id, "");
      const { files: _, mode: __, threadId: ___, ...draft } = d;
      try { await ctx.outbox.send({ ...draft, draftId: null }, [], null); }
      catch (_) { replies.set(t.id, text); if (f.isConnected && !f.value) { f.value = text; sync(); } }
    }
    return E("div", { class: "mr-qr" }, f, send);
  }

  // ---- drawing from the store
  function paint() {
    if (!cur) return;
    const s = store.get(), th = s.thread || {}, t = th.t?.id === cur.id ? th.t : null;
    el.classList.toggle("mr-pad", pad());
    if (s.offline && !t) {
      cur.msgs.replaceChildren(ui.empty({ title: "Mail needs a connection", body: "Your mail is safe at Mail and will be here when you’re back online." }));
      return;
    }
    if (th.err && !t) {
      cur.msgs.replaceChildren(ui.error({ title: "Couldn’t open this conversation", body: th.err, acts: [{ label: "Try Again", act: "retry", primary: true, run: () => open(cur.id) }] }));
      return;
    }
    if (!t) { if (!cur.msgs.firstChild) cur.msgs.append(ui.skeleton("rows", 3)); return; }
    cur.msgs.querySelector(".ifl-skeleton")?.remove();
    paintHead(t);
    // oldest first, as a conversation reads; the newest at the foot, by the reply (cards already made stay where they are)
    let prev = null;
    for (const m of [...(t.messages || [])].reverse()) {
      const meta = th.metas?.[m.id], full = meta ? { ...m, ...meta } : m;
      let c = cur.cards.get(m.id);
      if (!c) { card(full); c = cur.cards.get(m.id); }
      else paintCard(c, full);
      if (!c.el.isConnected || c.el.parentNode !== cur.msgs) { if (prev) prev.after(c.el); else cur.msgs.prepend(c.el); }
      prev = c.el;
    }
    for (const [id, c] of cur.cards) if (!(t.messages || []).some((m) => m.id === id)) { dropFrame(id); c.el.remove(); cur.cards.delete(id); }
    paintFoot(t);
  }
  function shut() {
    if (!cur) return;
    for (const f of cur.frames.values()) f?.destroy?.();
    for (const u of cur.urls) URL.revokeObjectURL(u);
    cur = null;
  }
  function draw() {
    const id = store.get().threadId || null;
    if (!id || id !== cur?.id || !el.firstChild) open(id);
    paint();
  }
  return {
    draw,
    hide() { shut(); el.replaceChildren(); },
    destroy() { shut(); for (const f of offs.splice(0)) f?.(); el.replaceChildren(); },
    readAt: () => touched,
  };
}
