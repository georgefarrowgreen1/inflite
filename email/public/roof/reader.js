// Mail's reader under the roof (One roof stage 4, s4/spec §4.1, §2.1, S4-D6, D17, §3.1, §3.2; app.js:4631–4960, 5234):
// the head; message cards from api.meta (never /api/messages/<id>: the page never receives a body, §3.1); a body frame
// per expanded message (bodyframe.js; the newest one made on the row's tap from latestId, in parallel with the thread
// fetch); files (S4-D17: api.picture for logic.PICTURES only, api.fileUrl in a new tab for the rest); inline reply and
// its reply options; conversation actions alongside the subject in a split or workspace pane.
// Frozen: view(el, ctx) → { draw(), hide(), destroy() } (list.js's signature): el is the section.ml-reader mail.js made;
//   it draws store.threadId / store.thread; hide() destroys its frames' handles and revokes picture URLs.
//   Added (MR): readAt() → when a body frame last said it was touched (0 if never): mail.js's busy() (S4-D13).
// What it does with the store: on a new threadId it asks api.thread(id) unless store.thread already holds that thread
//   or is loading it, then api.meta for the newest and the few unread (≤ 5), each kept in store.thread.metas; opening an
//   unread conversation marks it read (ctx.actions.act([id], "read", { undo: false })).
// Hooks: .m-mail iframe.mail-body (bodyframe.js makes them), [data-act=reply|send] and the filing toolbar.
// Mail on Your Day's strip, above the messages, as Mail's own page has it (parts/spot.js): each booking, parcel or bill
//   Mail spotted in the conversation (thread.spots), with Remove / Put It Back and Wrong (api.spot), at .mr-spot.
// Nothing from a message's body is here: cards are Meta (summary fields) drawn with textContent; pictures are blob: URLs
// made only for logic.PICTURES, re-typed, used only in <img src> and revoked when the conversation goes.
import { bodyFrame, listenFrames, themeAll } from "./bodyframe.js";
import { STORAGE, privateJournal } from "./store.js";
import { MAIL, MAIL_PAGE } from "./api.js";

const PICTURES = /^image\/(png|jpeg|gif|webp|avif|heic|bmp)$/;
const isPic = (a) => PICTURES.test(String(a?.type || "").toLowerCase());
const REPLY_DAYS = 14 * 864e5;
const remoteOn = () => { try { return localStorage.getItem(STORAGE.remoteImages) === "1"; } catch (_) { return false; } };
// the replies typed at the foot, one per conversation, kept a fortnight (app.js qrDrafts, 4775–4790)
const thr = (r) => (r && r.thread ? { ...r.thread, messages: r.messages || r.thread.messages || [] } : r);

export function view(el, ctx) {
  const { store, api, logic, fw } = ctx, ui = fw.ui, E = ui.el;
  const owner = fw.session.user.id;
  const journal = privateJournal(owner, () => !fw.signal?.aborted && fw.session.user.id === owner && ctx.canDraft?.() !== false);
  const replies = {
    all() {
      const drafts = journal.get(STORAGE.replies);
      return drafts && typeof drafts === "object" && !Array.isArray(drafts) ? drafts : {};
    },
    get(id) {
      const draft = this.all()[id];
      return draft && typeof draft.text === "string" && Date.now() - draft.at < REPLY_DAYS ? draft.text : "";
    },
    set(id, text) {
      const drafts = this.all();
      for (const [key, draft] of Object.entries(drafts)) if (!(Date.now() - draft?.at < REPLY_DAYS)) delete drafts[key];
      if (text) drafts[id] = { text, at: Date.now() };
      else delete drafts[id];
      try { journal.put(STORAGE.replies, drafts); } catch {}
    },
  };
  let cur = null, touched = 0;
  const offs = [];
  const dismissed = new Set();
  const off = listenFrames({
    remote(id, on) { const c = cur?.cards.get(id); if (c) c.banner.hidden = !on || c.loaded; },
    mailto(href) { const d = logic.mailtoDraft?.(href); if (d) ctx.open.compose(d); },
    touched() { touched = Date.now(); ctx.touched?.(); },
  });
  offs.push(off, fw.on("theme", (t) => themeAll(t)));
  for (const k of ["threadId", "thread", "layout", "offline", "access"]) offs.push(store.on(k, () => draw()));

  const me = () => store.get().me || {};
  const pad = () => store.get().layout === "pad";
  const control = (name, options) => {
    const button = ui.iconBtn(name, options);
    button.replaceChildren(ctx.icon(name));
    return button;
  };

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
    cur.spots = E("div", { class: "mr-spots", role: "group", "aria-label": "Spotted by Mail", hidden: true });
    cur.msgs = E("div", { class: "mr-msgs" });
    cur.historyLabel = E("h3");
    cur.older = E("div", { class: "mr-older" });
    cur.history = E("section", { class: "mr-history", hidden: true }, cur.historyLabel, cur.older);
    cur.change = E("div", { class:"mr-change", role:"group", "aria-label":"Calendar change" });
    cur.foot = E("footer", { class: "mr-foot", hidden: true, "aria-label": "Quick reply" });
    const content = E("div", { class: "mr-content" }, cur.msgs, cur.change, cur.spots, cur.history);
    el.replaceChildren(cur.head, content, cur.foot);
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
    const view = cur, current = () => cur === view && ctx.canRead?.() !== false;
    store.set({ thread: { t: null, metas: {}, loading: true, err: null } }, "reader");
    let t;
    try { t = thr(await api.thread(id)); }
    catch (e) { if (current()) store.set({ thread: { t: null, metas: {}, loading: false, err: e?.message || "Couldn’t open it." } }, "reader"); return; }
    if (!current()) return;
    store.set({ thread: { t, metas: {}, loading: false, err: null } }, "reader");
    loaded(t);
    if (t.unread) ctx.actions.act([id], "read", { undo: false }).catch?.(() => {});
  }
  function loaded(t) {
    const msgs = t.messages || [];
    if (!cur.qr) cur.expanded.clear();
    if (msgs[0]) cur.expanded.add(msgs[0].id);
    for (const mid of cur.expanded) meta(mid);
  }
  async function meta(mid) {
    const view = cur, have = store.get().thread.metas?.[mid];
    const current = () => view && cur === view && ctx.canRead?.() !== false;
    if (!current()) return null;
    if (have) return have;
    try {
      const m = await api.meta(mid);
      if (!current()) return null;
      const th = store.get().thread;
      store.set({ thread: { ...th, metas: { ...th.metas, [mid]: m } } }, "reader");
      return m;
    } catch (e) {
      const c = current() && cur.cards.get(mid);
      if (c) c.files.replaceChildren(ui.error({ body: e?.message || "Couldn’t load it.", acts: [{ label: "Try Again", act: "retry", run: () => meta(mid) }] }));
      return null;
    }
  }

  // ---- a message's card: made once, filled in place (a frame moved in the page would load again)
  function card(m, early = false) {
    const c = { id: m.id, el: E("article", { class: "mr-card", data: { mid: m.id } }), loaded: false };
    c.top = E("button", { type: "button", class: "mr-mhead" });
    c.top.addEventListener("click", () => {
      if (store.get().thread?.t?.messages?.[0]?.id !== m.id) return toggle(m.id);
      c.addresses.hidden = !c.addresses.hidden;
      c.top.setAttribute("aria-expanded", String(!c.addresses.hidden));
    });
    c.addresses = E("p", {class:"mr-addresses",hidden:true});
    c.envelope = E("details", { class: "mr-envelope", hidden: true }, E("summary", {text:"Message details"}));
    c.body = E("div", { class: "mr-body" });
    c.banner = E("p", { class: "mr-remote", hidden: true }, E("span", { text: "Remote pictures are hidden to protect your privacy." }), " ",
      ui.btn("Load", { small: true, act: "load-remote", run: () => { c.loaded = true; c.banner.hidden = true; cur?.frames.get(m.id)?.allowImages(); } }));
    c.files = E("div", { class: "mr-files" });
    c.el.append(c.top, c.addresses, c.envelope, c.banner, c.body, c.files);
    cur.cards.set(m.id, c);
    paintCard(c, m, early);
    return c.el;
  }
  function paintCard(c, m, early) {
    const open = cur.expanded.has(m.id), sent = m.folder === "sent", who = sent ? "You" : logic.displayName(m.from) || "Unknown Sender";
    c.el.classList.toggle("open", open);
    c.el.classList.toggle("unread", !!m.unread && m.folder === "inbox");
    const newest = store.get().thread?.t?.messages?.[0]?.id === m.id;
    c.envelope.hidden = newest || !open;
    if (!newest) {
      if (c.addresses.parentNode !== c.envelope) c.envelope.append(c.addresses);
      c.addresses.hidden = false;
      if (!open) c.envelope.open = false;
    } else if (c.addresses.parentNode !== c.el) {
      c.top.after(c.addresses);
      c.addresses.hidden = true;
    }
    c.top.setAttribute("aria-expanded", String(newest ? !c.addresses.hidden : open));
    c.addresses.textContent = [["From", [m.from]], ["To", m.to], ["Cc", m.cc], ...(sent ? [["Bcc", m.bcc]] : [])].map(([label, people]) => {
      const addresses = (people || []).map(p => p?.email).filter(Boolean).join(", ");
      return addresses ? label + ": " + addresses : "";
    }).concat(m.date ? logic.fmtLongDate?.(m.date) : "").filter(Boolean).join("\n");
    const to = (m.to || []).map((p) => (!sent && p.email === m.mailbox ? "you" : logic.displayName(p))).join(", ");
    c.top.replaceChildren(ui.avatar(logic.displayName(m.from) || "?"), E("span", { class: "mr-who" },
      E("b", { text: who }), E("small", { text: open ? (to ? `to ${to}` : m.from?.email || "") : m.snippet || "" })),
      E("span", { class: "mr-date", text: m.date ? logic.fmtListDate?.(m.date) || "" : "" }));
    if (!open) { dropFrame(m.id); c.body.replaceChildren(); c.files.replaceChildren(); c.filesFor = null; c.banner.hidden = true; return; }
    if (!cur.frames.has(m.id)) {
      const f = bodyFrame(m, { theme: fw.theme(), images: remoteOn(), eager: early || m.id === store.get().thread.t?.messages?.[0]?.id });
      cur.frames.set(m.id, f);
      // (no frame: the shell can't be had here; never the body itself, only the snippet and a way to Mail)
      c.body.replaceChildren(f?.el || E("div", { class: "mr-noframe" }, m.snippet ? E("p", { text: m.snippet }) : null,
        E("a", { href: `${MAIL_PAGE}/#thread=${encodeURIComponent(cur.id)}`, target: "_blank", rel: "noopener", text: "Open in Mail" })));
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
    for (const file of rest.filter(f=>/\.vcf$/i.test(f.filename) || /^text\/(?:x-)?vcard(?:;|$)/i.test(f.type))) {
      const review = ui.btn("Save to People", {small:true,run:async()=>{
        const view=cur, current=()=>cur===view && cur?.expanded.has(c.id) && !fw.signal.aborted && fw.session.user.id===owner && store.get().access==="ok";
        try {
          if(current())await ctx.open.contactCard({anchor:review,base:MAIL,owner,current,read:()=>{
            if(file.size>512*1024)throw Error("Choose a card smaller than 512 KB.");
            return api.picture(file.id,{export:true});
          }});
        } catch {if(current())fw.toast("Couldn’t open this contact card.");}
      }});
      const link=[...c.files.querySelectorAll("a")].find(a=>a.href===api.fileUrl(file.id));
      if(link){
        const tile=E("div",{class:"mail-vcard"},E("span",{class:"mail-card-identity"},ctx.icon("recipient"),E("span",{},E("small",{text:"Contact card"}),E("strong",{text:(file.filename||"Contact").replace(/\.vcf$/i,"")}))));
        link.replaceWith(tile);link.replaceChildren(E("span",{text:"Download vCard"}));
        tile.append(E("div",{class:"mail-card-actions"},review,link));
      }else c.files.append(review);
    }
    if (list.length && fw.workspace?.files?.save) {
      const save = async attachment => {
        const thread = cur?.id, current = () => !fw.signal.aborted && fw.session.user.id === owner && cur?.id === thread && cur?.cards.get(c.id) === c && cur.expanded.has(c.id) && store.get().access === "ok" && c.filesFor === list;
        if (!current()) return;
        try {
          if (attachment.size > 25 * 1024 * 1024) throw new Error("Files are limited to 25 MB each.");
          const blob = await api.picture(attachment.id, { export: true });
          if (!current()) return;
          if (!(blob instanceof Blob) || blob.size > 25 * 1024 * 1024) throw new Error("That attachment is too large to save.");
          const file = new File([blob], attachment.filename || "Attachment", { type: attachment.type || blob.type || "application/octet-stream" });
          const result = await fw.workspace.files.save(file, { title: "Save attachment to InFlite Files", current });
          if (current() && result?.id) fw.toast("Saved to InFlite Files");
        } catch (error) { if (current() && error?.name !== "AbortError") fw.toast(error?.message || "That attachment couldn’t be saved."); }
      };
      c.files.append(ui.btn("Save to InFlite Files", { small: true, act: "save-drive", run: () => {
        if (list.length === 1) return save(list[0]);
        let chooser;
        chooser = fw.sheet.open({ sheet: "mail-save-attachment", title: "Choose an attachment", body: E("div", { class: "ml-workspace-file" }, ...list.map(attachment => ui.btn(attachment.filename || "Attachment", { run: () => { chooser.now(); save(attachment); } }))) });
      } }));
    }
  }
  async function picture(a) {
    const id = cur?.id, type = String(a.type).toLowerCase();
    if (!PICTURES.test(type)) return null;
    try {
      const blob = new Blob([await (await api.picture(a.id)).arrayBuffer()], { type });
      if (cur?.id !== id) return null;
      const u = URL.createObjectURL(blob);
      cur.urls.push(u);
      return u;
    } catch (_) { return null; }
  }

  // ---- Mail on Your Day's strip: what Mail spotted in it, the same as on Mail's own page (parts/spot.js)
  const fmt = (t, o) => new Intl.DateTimeFormat("en-GB", o).format(t);
  const hm = (t, tz) => { try { return fmt(t, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(tz && { timeZone: tz }) }); } catch (_) { return fmt(t, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); } };
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const short = (t) => (t == null ? "—" : `${fmt(t, { weekday: "short" })} ${fmt(t, { day: "numeric" })}`);
  const dayWord = (t) => (sameDay(t, Date.now()) ? "today" : sameDay(t, Date.now() + 864e5) ? "tomorrow" : fmt(t, { weekday: "long" }));
  const money = (p) => (p == null ? "—" : `£${p % 100 ? (p / 100).toFixed(2) : String(p / 100)}`);
  const hour = (t) => { const x = hm(t); return x.endsWith(":00") ? String(Number(x.slice(0, 2))) : x; };
  const range = (a, b) => { const [d1, m1, d2, m2] = [fmt(a, { day: "numeric" }), fmt(a, { month: "short" }), fmt(b, { day: "numeric" }), fmt(b, { month: "short" })]; return d1 === d2 && m1 === m2 ? `${d1} ${m1}` : m1 === m2 ? `${d1}–${d2} ${m1}` : `${d1} ${m1} – ${d2} ${m2}`; };
  const BILLS = new Set(["bill", "renewal", "trial", "sub"]);
  const STAGES = ["Ordered", "Shipped", "Out today", "Delivered"];
  const KINDS = { flight: "flights", train: "trains", bus: "coaches", hotel: "stays", car: "cars", restaurant: "tables", event: "tickets", booking: "invites", parcel: "parcels", bill: "bills", renewal: "renewals", trial: "trials", sub: "receipts" };
  function about(s) {
    if (s.kind === "parcel") {
      const title = `Parcel from ${s.shop || s.carrier || "a shop"}${s.stage === 3 ? " · delivered" : s.window ? ` · ${dayWord(s.window.from)}` : s.due != null ? ` · ${dayWord(s.due)}` : ""}`;
      const win = s.stage === 3 ? ["Delivered", s.deliveredAt != null ? hm(s.deliveredAt) : "—"] : s.window ? ["Window", `${hour(s.window.from)}–${hour(s.window.to)}`] : ["Due", short(s.due)];
      const tracking = s.track && /^https:\/\//.test(s.track) ? E("a", { class: "mr-spot-track", href: s.track, target: "_blank", rel: "noopener noreferrer", text: "Track ›" }) : s.ref || "—";
      const bar = E("div", { class: "mr-spot-bar", role: "img", "aria-label": STAGES[s.stage] || "" },
        E("span", { class: "mr-spot-steps" }, STAGES.map((_, i) => E("i", { class: i < s.stage || s.stage === 3 ? "on" : i === s.stage ? "now" : null }))),
        E("span", { class: "mr-spot-labs", "aria-hidden": "true" }, STAGES.map((l, i) => E("span", { class: i <= s.stage ? "on" : null, text: l }))));
      return { title, facts: [["Courier", s.carrier || "—"], win, ["Tracking", tracking]], extra: bar, how: [s.sender || s.carrier, s.ref ? `ref ${s.ref}` : s.order ? `order ${s.order}` : ""] };
    }
    if (BILLS.has(s.kind)) {
      const d = s.due;
      const title = s.kind === "renewal" ? `Renews ${dayWord(d)} · ${money(s.amount)}` : s.kind === "trial" ? `Trial ends ${dayWord(d)}` : s.kind === "sub" ? `${money(s.amount)} paid ${dayWord(d)}` : `${money(s.amount)} due ${dayWord(d)}`;
      const facts = s.kind === "renewal" ? [["Price", money(s.amount)], ["Renews", short(d)], ["Was", money(s.was)]]
        : s.kind === "trial" ? [["Then", money(s.amount)], ["Ends", short(d)], ["Paid by", s.auto ? "Card" : "You"]]
        : [["Amount", money(s.amount)], [s.kind === "sub" ? "Paid" : "Due", short(d)], ["Usual", money(s.usual)]];
      return { title, facts, extra: spark(s), how: [s.sender, s.account ? `account ${s.account}` : ""] };
    }
    const facts = s.repeat ? [["Next", `${short(s.start)} ${hm(s.start, s.tz)}`], ["Repeats", s.repeat]] : (s.facts || []).slice(0, 2);
    const when = `${fmt(s.start, { weekday: "long", ...(s.tz && { timeZone: s.tz }) })}${s.kind === "hotel" ? "" : ` ${hm(s.start, s.tz)}`}`;
    return { title: `${s.title} · ${when}`, facts: [...facts, ["Status", s.status === "cancelled" ? "Cancelled" : "Booked"]], extra: null, how: [s.sender, s.ref ? `ref ${s.ref}` : ""] };
  }
  // (a bill's last six as small bars, the newest marked when it's more than the usual: their heights by custom property)
  function spark(s) {
    const last = (s.last || []).slice(-6);
    if (last.length < 2) return null;
    const top = Math.max(...last), before = last.slice(0, -1), lo = Math.min(...before), hi = Math.max(...before);
    const up = s.usual && s.amount > s.usual ? Math.floor(((s.amount - s.usual) / s.usual) * 100) : 0;
    const bars = last.map((p, i) => { const b = E("i", { class: i === last.length - 1 && up ? "now" : null }); b.style.setProperty("--h", `${Math.max(12, Math.round((p / top) * 100))}%`); return b; });
    return E("div", { class: "mr-spot-spark" },
      E("span", {}, E("small", { text: `Your last ${last.length} from ${s.sender}` }), E("b", { text: `${lo === hi ? money(lo) : `${money(lo)}–${money(hi)}`}, now ` }, up ? E("span", { class: "mr-spot-chg", text: `+${up}%` }) : money(s.amount))),
      E("span", { class: "mr-spot-bars", "aria-hidden": "true" }, bars));
  }
  function spotCard(s, t) {
    const gone = s.status === "cancelled";
    const state = gone ? "Cancelled" : s.hidden ? "Not on Your Day" : s.trip ? `On Your Day · part of ${s.trip.name}, ${range(s.trip.start, s.trip.end)}` : "On Your Day";
    const a = about(s);
    const card = E("article", { class: `mr-spot${s.hidden || gone ? " gone" : ""}`, data: { spot: s.id, kind: s.kind }, "aria-label": `${a.title}, ${state}` });
    async function change(body, said) {
      for (const b of card.querySelectorAll("button")) b.disabled = true;
      try {
        const r = await api.spot(s.id, body);
        const th = store.get().thread;
        if (th?.t?.id === t.id && Array.isArray(r?.spots)) store.set({ thread: { ...th, t: { ...th.t, spots: r.spots } } }, "reader");
        fw.toast(said);
      } catch (e) {
        for (const b of card.querySelectorAll("button")) b.disabled = false;
        fw.toast(e?.message || "Couldn’t change that. Try again.");
      }
    }
    const btn = (label, act, body, said) => { const b = E("button", { type: "button", class: "ifl-btn small", data: { act }, text: label }); b.addEventListener("click", () => change(body, said)); return b; };
    card.append(
      E("div", { class: "mr-spot-top" }, E("span", { class: "mr-spot-ic" }, ctx.icon(`k-${s.kind}`)), E("div", { class: "mr-spot-tx" }, E("small", { class: "mr-spot-state", text: state }), E("b", { text: a.title }))),
      E("div", { class: "mr-spot-facts" }, a.facts.map(([k, v]) => E("div", {}, k, E("b", {}, v)))),
      a.extra || "",
      E("div", { class: "mr-spot-how", text: a.how.filter(Boolean).join(" · ") }),
      gone ? "" : E("div", { class: "mr-spot-btns" },
        s.hidden ? btn("Put it back", "back", { hidden: false }, "Back on Your Day") : btn("Remove", "remove", { hidden: true }, "Hidden"),
        s.hidden ? null : btn("Wrong", "wrong", { wrong: true }, `Hidden. Mail won’t read ${KINDS[s.kind] || "these"} from ${s.sender || "them"} again`)),
    );
    return card;
  }
  function paintSpots(t) {
    const list = Array.isArray(t.spots) ? t.spots.slice(0, 4) : [];
    if (cur.spotsFor === t.spots) return;
    cur.spotsFor = t.spots;
    cur.spots.hidden = !list.length;
    cur.spots.replaceChildren(...list.map((s) => spotCard(s, t)));
  }

  // ---- subject and filing actions, with the writing controls at the foot
  function paintHead(t) {
    const mailbox = !pad() && !el.closest(".ifl-in-pane") ? logic.viewTitle(store.get()) : null;
    const status = t.trashed ? "In Trash" : t.done ? "Done" : "";
    const showStatus = status && mailbox !== (t.trashed ? "Trash" : "Done");
    if (cur.headFor === t && cur.showStatus === showStatus) return;
    cur.headFor = t;
    cur.showStatus = showStatus;
    const lead = logic.leadAction(t);
    const leadButton = control(lead.act === "done" ? "done" : "inbox", {
      label: lead.label, act: lead.act, run: () => ctx.actions.act([t.id], lead.act),
    });
    const later = !t.trashed && control("later", {
      label: "Later", act: "later", run: () => ctx.open.later([t.id]),
    });
    const more = control("more", {
      label: "Conversation actions", act: "more", run: () => ctx.open.readerMenu(t, true),
    });
    more.setAttribute("aria-haspopup", "dialog");
    cur.head.replaceChildren(...[
      E("div", { class: "mr-heading" },
        E("div", { class: "mr-title" },
          E("h2", { class: "mr-subject", text: t.subject || "(No Subject)" }),
          showStatus ? E("p", { class: "mr-meta", text: status }) : null),
        E("div", { class: "mr-bar", role: "group", "aria-label": "File conversation" }, leadButton, later, more)),
      t.reminder ? E("div",{class:"mr-later"}, E("span",{text:"Follow up if unanswered · "+logic.fmtWhen(t.reminder.due)}),
        ui.btn("Clear",{small:true,run:async()=>{
          try { await api.batch({ids:[t.id],action:"cancel-followup",messageId:t.reminder.message_id}); if(cur?.id===t.id) await load(t.id); ctx.actions.load({quiet:true}); }
          catch(error){fw.toast(error.message || "Couldn’t clear the reminder");}
        }})) : null,
      t.snoozeUntil ? E("p", { class: "mr-later" }, ctx.icon("later"), E("span", { text: `Comes back ${logic.fmtWhen?.(t.snoozeUntil) || ""}` }),
        ui.btn("Bring Back Now", { small: true, act: "unsnooze", run: () => ctx.actions.act([t.id], "unsnooze") })) : null,
    ].filter(Boolean));
  }
  function paintFoot(t) {
    const newest = replyMessage(t);
    if (!newest) { cur.foot.hidden = true; return; }
    if (!cur.updateReplyTarget) cur.foot.append(quick(t));
    cur.foot.hidden = false;
    cur.updateReplyTarget(newest);
  }
  // (replies go to the newest message someone else sent, or the newest if it's all yours)
  const replyMessage = t => t.messages?.find(m => m.folder !== "sent") || t.messages?.[0];
  async function target(t) {
    const m = replyMessage(t);
    return m ? store.get().thread.metas?.[m.id] || (await meta(m.id)) : null;
  }
  // a reply typed at the foot: to whoever wrote last, sent through the outbox as compose sends (app.js:4796–4846)
  function quick(t) {
    let replyTo;
    const f = E("textarea", { class: "mr-qr-text", rows: "1", enterkeyhint: "enter" });
    f.value = replies.get(t.id);
    const send = control("send-up", { label: "Send", act: "send", run: () => go() });
    const options = control("reply", { label: "Reply options", act: "reply", run: () => menu() });
    options.setAttribute("aria-haspopup", "dialog");
    // (busy from the tap until the outbox answers, so a second tap can't send it twice)
    let busy = false;
    const fluid = globalThis.CSS?.supports?.("field-sizing: content");
    const sync = () => {
      send.disabled = busy || !replyTo || !f.value.trim();
      options.disabled = busy || !replyTo;
      f.readOnly = busy;
      if (!fluid && f.isConnected) {
        f.style.removeProperty("--mail-draft-height");
        f.style.setProperty("--mail-draft-height", f.scrollHeight + "px");
      }
    };
    const view = cur;
    view.updateReplyTarget = message => {
      if (!message || (replyTo && (busy || f.value))) return;
      replyTo = message;
      const recipient = message.folder === "sent" ? message.to?.[0] : message.from;
      const name = recipient && logic.displayName(recipient);
      const label = name ? `Reply to ${name}` : "Reply";
      f.placeholder = label + "…";
      f.setAttribute("aria-label", label);
      sync();
    };
    const current = () => cur === view && !fw.signal?.aborted && fw.session.user.id === owner && store.get().access === "ok";
    function menu() {
      const entry = (title, icon, act, action) => ui.row({ title, lead: ctx.icon(icon), act, run: () => { sheet.close(); action(); } });
      const sheet = fw.sheet.open({ sheet: "mail-reply", title: "Reply options", body: ui.list([
        entry("Expand reply", "expand", "reply", promote),
        entry("Reply All", "reply-all", "reply-all", () => write("replyAll")),
        entry("Forward", "forward", "forward", () => write("forward")),
      ]) });
    }
    async function write(mode) {
      const message = mode === "forward" ? store.get().thread?.t?.messages?.[0] : replyTo;
      const m = message && await meta(message.id);
      if (!current()) return;
      if (!m) return fw.toast("Couldn’t open that message. Try again in a moment.");
      await ctx.open.compose(logic.replyDraft(m, mode, me()), current).catch(() => {});
    }
    async function promote() {
      if (busy) return;
      const words = f.value;
      const selection = [f.selectionStart, f.selectionEnd, f.selectionDirection];
      busy = true; sync();
      try {
        const m = replyTo && await meta(replyTo.id);
        if (!current()) return;
        if (!m) return fw.toast("Couldn’t open that message. Try again in a moment.");
        const draft = logic.replyDraft(m, "reply", me());
        await ctx.open.compose({ ...draft, text: words, quickSelection: selection, onQuickOwned() {
          if (fw.signal?.aborted || fw.session.user.id !== owner) return;
          if (replies.get(t.id) === words) replies.set(t.id, "");
          if (f.value === words) f.value = "";
          sync();
        } }, current);
      } catch {
        // The opener reports import errors. The inline field still owns the reply.
      } finally { busy = false; sync(); }
    }
    // iOS can shrink or pan the visual viewport without resizing the layout viewport.
    const viewport = globalThis.visualViewport;
    const fit = () => {
      const inset = viewport && f === el.ownerDocument?.activeElement
        ? Math.max(0, globalThis.innerHeight - viewport.height - viewport.offsetTop) : 0;
      if (inset > 100) el.style.setProperty("--mail-keyboard-bottom", (Math.ceil(inset) + 6) + "px");
      else el.style.removeProperty("--mail-keyboard-bottom");
      view.foot.toggleAttribute("data-keyboard", inset > 100);
    };
    if (viewport) {
      f.addEventListener("focus", fit);
      f.addEventListener("blur", fit);
      viewport.addEventListener("resize", fit);
      viewport.addEventListener("scroll", fit);
      view.releaseViewport = () => {
        viewport.removeEventListener("resize", fit);
        viewport.removeEventListener("scroll", fit);
        el.style.removeProperty("--mail-keyboard-bottom");
      };
    }
    f.addEventListener("input", () => { replies.set(t.id, f.value); sync(); });
    f.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
    sync();
    async function go() {
      const text = f.value.trim();
      if (!text || busy) return;
      busy = true; sync();
      let r;
      try {
        const m = replyTo && await meta(replyTo.id);
        if (!m) r = { ok: false, error: "Couldn’t send that. Try again in a moment." };
        else {
          const d = logic.replyDraft(m, "reply", me());
          const sig = (me().addresses || []).find((a) => a.email === String(d.from || "").toLowerCase())?.signature || me().signature || "";
          d.text = sig ? `${text}\n\n${sig}` : text;
          f.value = ""; f.blur?.(); replies.set(t.id, "");
          const { files: _, mode: __, threadId: ___, ...draft } = d;
          r = await ctx.outbox.send({ ...draft, draftId: null }, [], null);
        }
      } catch (e) { r = { ok: false, error: e?.message }; }
      busy = false;
      // (not taken: the words put back, in the field and in mail:replies, and why said)
      if (!r?.ok) {
        replies.set(t.id, text);
        if (f.isConnected && !f.value.trim()) f.value = text;
        fw.toast(r?.error || "Couldn’t send. Try Again");
      }
      sync();
    }
    return E("div", { class: "mr-qr" }, options, f, send);
  }

  function paintChange(t) {
    const proposal = t.timeChange, mid = proposal?.messageId, latest = t.messages?.[0], view = cur;
    const current = () => !fw.signal.aborted && cur === view && store.get().thread?.t?.messages?.[0]?.id === mid && store.get().access === "ok" && fw.session.user.id === owner;
    if (mid && view.updatedId === mid && current()) return;
    if (!fw.workspace?.calendarChange || !mid || latest?.id !== mid || !current() || dismissed.has(mid)) {
      view.change.replaceChildren(); view.proposalId = null; return;
    }
    if (view.proposalId === mid) return;
    view.proposalId = mid;
    view.change.replaceChildren();
    const clear = () => { dismissed.add(mid); view.change.replaceChildren(); };
    const refresh = () => { view.proposalId = null; if (current()) paintChange(store.get().thread.t); };
    fw.workspace.calendarChange({...proposal,subject:t.subject,threadId:t.id,date:latest.date},current).then(result => {
      if (!result || !current()) return;
      const row = ui.row({lead:{icon:"calendar"},title:"Time change proposed", sub:result.label, trail:"chevron", run:()=>result.review({
        dismiss:async () => {
          clear();
          try { await api.batch({ids:[t.id],action:"dismiss-time",messageId:mid}); }
          catch { if (current()) { dismissed.delete(mid); refresh(); fw.toast("Couldn’t save that choice. Try again."); } }
        }, refresh,
        viewMessage:()=>{ if (current()) view.cards.get(mid)?.top.focus(); },
        updated:()=>{
          clear();
          if (!current()) return;
          view.updatedId = mid;
          const draftReply = async () => {
            const m = await target(t);
            if (!m || !current()) return;
            const draft = logic.replyDraft(m, "reply", me());
            const signature = me().addresses?.find(a=>a.email===draft.from)?.signature || me().signature;
            draft.text = proposal.time + " works for me." + (signature ? "\n\n"+signature : "");
            ctx.open.compose(draft,current);
          };
          view.change.replaceChildren(E("span",{text:"Calendar updated"}),ui.btn("Reply with time",{run:draftReply}));
          fw.toast("Calendar updated");
        }
      })});
      view.change.replaceChildren(row);
    }).catch(error => {
      if (current() && error?.name !== "AbortError") view.change.replaceChildren(ui.btn("Check Calendar again", {run:refresh}));
    });
  }

  // ---- drawing from the store
  function paint() {
    if (!cur) return;
    const s = store.get(), th = s.thread || {}, t = th.t?.id === cur.id ? th.t : null;
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
    paintSpots(t);
    // The newest body leads. Older messages stay folded until opened in place.
    const earlier = Math.max(0, (t.messages?.length || 0) - 1);
    cur.history.hidden = !earlier;
    cur.historyLabel.textContent = earlier + (earlier === 1 ? " earlier message" : " earlier messages");
    let prev = null;
    for (const m of t.messages || []) {
      const meta = th.metas?.[m.id], full = meta ? { ...m, ...meta } : m;
      let c = cur.cards.get(m.id);
      if (!c) { card(full); c = cur.cards.get(m.id); }
      else paintCard(c, full);
      const group = m.id === t.messages[0].id ? cur.msgs : cur.older;
      if (c.el.parentNode !== group || (group === cur.older && c.el.previousElementSibling !== prev)) { if (group === cur.older && prev) prev.after(c.el); else group.prepend(c.el); }
      if (group === cur.older) prev = c.el;
    }
    for (const [id, c] of cur.cards) if (!(t.messages || []).some((m) => m.id === id)) { dropFrame(id); c.el.remove(); cur.cards.delete(id); }
    paintFoot(t);
    paintChange(t);
  }
  function shut() {
    if (!cur) return;
    cur.releaseViewport?.();
    for (const f of cur.frames.values()) f?.destroy?.();
    for (const u of cur.urls) URL.revokeObjectURL(u);
    cur = null;
  }
  function draw() {
    if (ctx.canRead?.() === false) { shut(); el.replaceChildren(); return; }
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
