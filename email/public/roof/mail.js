// Mail's module: its entry under InFlite's roof (One roof stage 4, spec §4.1, §4.2, S4-D5–D7, D9, D13–D15, D20–D26;
// stage 1 §5; the joint contracts s24 §4, §7). Served by Mail's Worker at /roof/mail.js and passed through at
// inflite.ai/mail/roof/mail.js; loaded by the framework (roof/modules.js) with import("/mail/roof/mail.js") on first open.
//
// Exports (frozen; roofmailcontract.test reads them from this file's text, so each stays a literal on one line):
//   CONTRACT = 1; BUILD and NEWS = literal copies of email/public/app.js's (equal, always: the integrator raises both in
//   one commit, S4-D19); SECTIONS = the router's REGISTRY.mail.sections = connector.sections; mount(root, fw) →
//   Promise<instance>. This file never imports connector.js (it isn't in the static graph, §4.4).
// instance = { show(route, hint), hide(), back() → boolean, busy() → boolean, flush() → Promise<{ lost }>,
//   sendable() → null, unmount() }
//   show(route): the header set synchronously first, before any await (§2.1, RI14); route.section → the lens (on the
//     first show a bare People route goes to the remembered lens, mail:lens, S4-D25); key "thread" + arg → the reader
//     (phone: the history entry stays, the switcher hidden, "Back to Mail"; iPad: the pane, the address tidied to the
//     lens's, S4-D6); on a thread route route.section is ignored (the alias says People) and the lens kept; "settings" →
//     ctx.open.settings(arg); "signin" + arg → finishSignIn (lazy signin.js).
//   hide(): the poll stopped (S4-D14), the header reset to the lens's (no subject left behind). back(): S4-D7.
//   busy(): S4-D13 (compose open, a send in its undo window or in flight, a swipe under the finger, the reader touched
//   in the last 30 s). flush(): C10, outbox.flush. sendable(): null (S4-D22). unmount(): flush with keepalive, every
//   listener dropped (keydown, matchMedia, the reader's), the views destroyed.
//
// What mount builds, in root (div.m-mail, inside main#m-mail): div.ml-state (the gate and offline words, S4-D12,
// S4-D15), section.ml-list (list.js's view) and section.ml-reader (reader.js's view, shown while a thread is);
// root.dataset.layout = "phone" | "pad" (S4-D6's rule, watched by matchMedia).
// ctx (frozen, §4.2) = { store, api, logic, actions, fw, layout(), icon,
//   open: { compose(init), later(ids), views(), rowMenu(t), unsub(t), settings(page), viewer(files, i), signin(),
//           confirm(spec) }, outbox, touched() }
//   touched(): the reader was touched (a body frame's note too): busy() for 30 s after. (MM's addition.)
//   leave(id, nextId): actions.act's, as an action takes the open conversation out of the list (app.js leaveThread): a
//     phone's reader goes back to the list (fw.nav.back(), or a cold one to the lens's address, replaced, kind "pop"); an
//     iPad's pane opens nextId, else none. (MM's addition.)
//   open.compose, open.settings, open.viewer and open.signin reach their lazy files only through fw.lazy.
// The header is set from here alone, on lens, filter, address, box, counts, offline, threadId, thread, layout, list:
//   title = the view with pick ▾ → open.views(); line "3 unread" | "All caught up" | "Couldn’t reach Mail · Try Again";
//   acts: Write only; badges { people: { n, say } } (S4-D26); a phone reader: title the subject, acts Done and Later,
//   sections: false (s24 §4), back "Back to Mail" when it was opened cold (S4-D7).
import { createStore, STORAGE, local } from "./store.js";
import { MAIL, createApi } from "./api.js";
import * as logic from "./logic.js";
import { createActions } from "./actions.js";
import { view as listView } from "./list.js";
import { view as readerView } from "./reader.js";
// (menus.js's confirm under another name: a bare confirm( reads as the page's, which §5.1 forbids)
import { openViews, openLater, openRowMenu, openUnsub, confirm as confirmSheet } from "./menus.js";
import { icon } from "./icons.js";
import { createOutbox } from "./outbox.js";

export const CONTRACT = 1;
export const BUILD = "1.63";
export const NEWS = "A name half typed in To stays as you typed it when you move on, not a red chip";
export const SECTIONS = [["people", "People"], ["updates", "Updates"], ["later", "Later"], ["done", "Done"]];

const LENS_IDS = SECTIONS.map((s) => s[0]);
// (Mail's own rule for a phone, app.js:1993: narrow, or short and not wide)
const PHONE = "(max-width: 699.98px), (max-height: 499.98px) and (max-width: 999.98px)";
// (signin: Mail has no session here. fw.session.lost() is told first (S4-D12, D3): if InFlite's is gone too, InFlite
// signs out and this never shows; if InFlite is still signed in, Mail alone needs signing in to, by the same hand-back)
const GATE = {
  signin: ["You’re signed out of Mail", "Sign in to Mail to read your mail here.", "Sign In to Mail"],
  reauth: ["Confirm it’s you", "Mail asks again every 12 hours before it shows your mail.", "Confirm It’s You"],
  passkey: ["Mail needs a passkey", "Add a passkey to your account, then confirm it’s you.", "Confirm It’s You"],
  notadmin: ["Mail is George’s", "Mail on InFlite is only for the account that owns it.", null],
};
const OFFLINE = ["Mail needs a connection", "Your mail is safe at Mail and will be here when you’re back online."];

export async function mount(root, fw) {
  const doc = root.ownerDocument, win = doc.defaultView || globalThis;
  const store = createStore();
  let readAt = 0;
  const api = createApi({
    base: MAIL,
    onLost: (access) => { store.set({ access }, "401"); if (access === "signin") fw.session.lost(); },
    onRefused: () => { try { fw.session.hubAgain?.(); } catch {} },
  });
  const ctx = { store, api, logic, actions: null, fw, layout: () => store.get().layout, icon, open: {}, outbox: null, touched: () => { readAt = Date.now(); } };
  const failed = (e) => { fw.toast("That didn’t open. Try again."); throw e; };
  const signinJs = () => fw.lazy((q) => import("./signin.js" + q)).catch(failed);
  Object.assign(ctx.open, {
    compose: (init) => fw.lazy((q) => import("./compose.js" + q)).catch(failed).then((m) => m.openCompose(ctx, init || {})),
    later: (ids) => openLater(ctx, ids), views: () => openViews(ctx), rowMenu: (t) => openRowMenu(ctx, t), unsub: (t) => openUnsub(ctx, t),
    settings: (page) => fw.lazy((q) => import("./mailsettings.js" + q)).catch(failed).then((m) => m.openSettings(ctx, page ?? null)),
    viewer: (files, i) => fw.lazy((q) => import("./viewer.js" + q)).catch(failed).then((m) => m.openViewer(ctx, files, i)),
    signin: () => signinJs().then((m) => m.signIn(ctx)),
    confirm: (spec) => confirmSheet(ctx, spec),
  });
  ctx.leave = (id, next) => {
    const s = store.get();
    if (s.threadId !== id) return;
    if (s.layout === "phone") {
      if (onScreen && route?.key === "thread") {
        if (fw.nav.depth() > 0) fw.nav.back();
        else fw.nav.go(SECTION_PATH(s.lens), { replace: true, kind: "pop" });
      } else store.set({ threadId: null }, "leave");
      return;
    }
    store.set({ threadId: next && logic.idOk(next) ? next : null }, "leave");
  };
  ctx.actions = createActions(ctx);
  ctx.outbox = createOutbox(ctx);
  const { actions } = ctx;

  const make = (tag, cls, label) => { const el = doc.createElement(tag); el.className = cls; if (label) el.setAttribute("aria-label", label); root.append(el); return el; };
  const stateEl = make("div", "ml-state");
  const listEl = make("section", "ml-list", "Conversations"), readerEl = make("section", "ml-reader", "Conversation");
  stateEl.hidden = true;
  readerEl.hidden = true;
  const offs = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };

  // ---- layout: phone or iPad, by Mail's own rule
  const mq = win.matchMedia ? win.matchMedia(PHONE) : null;
  const layout = () => (mq ? (mq.matches ? "phone" : "pad") : "phone");
  store.set({ layout: layout() });
  root.dataset.layout = store.get().layout;
  if (mq) on(mq, "change", () => {
    const l = layout(), s = store.get();
    store.set({ layout: l }, "layout");
    root.dataset.layout = l;
    // (an iPad window made narrow with a thread open: pushed over the list, as a phone has it)
    if (onScreen && l === "phone" && s.threadId && route?.key !== "thread") fw.nav.go(fw.nav.href("thread", s.threadId));
    drawState();
  });
  for (const ev of ["pointerdown", "keydown", "wheel", "scroll"]) on(readerEl, ev, () => ctx.touched(), { passive: true, capture: true });

  const list = listView(listEl, ctx), reader = readerView(readerEl, ctx);
  const bootState = { first: true, started: null };
  const hashCode = () => { try { return new URLSearchParams(String(win.location.hash || "").slice(1)).get("signin"); } catch (_) { return null; } };
  let onScreen = false, route = null, cold = false;

  // ---- the header, from one place
  function header() {
    if (!onScreen) return;
    fw.header.set(headOf(store.get()));
  }
  function headOf(s, { lensOnly = false } = {}) {
    const write = { icon: "compose", label: "Write", run: () => ctx.open.compose({}) };
    const n = Number(s.counts?.people) || 0;
    const badges = { people: n ? { n, say: `${n} unread` } : 0 };
    if (!lensOnly && s.layout === "phone" && s.threadId && route?.key === "thread") {
      const t = s.thread?.t || s.list.rows.find((r) => r.id === s.threadId);
      const subj = t?.subject || "Conversation";
      return {
        title: subj, compactTitle: subj, pick: null, line: "", sections: false, badges,
        back: cold ? { label: "Back to Mail" } : null,
        acts: [{ icon: "done", label: "Done", word: "Done", run: () => t && actions.act([t.id], logic.leadAction(t).act) }, { icon: "later", label: "Later", word: "Later", run: () => t && ctx.open.later([t.id]) }],
      };
    }
    const gate = s.access && s.access !== "ok";
    const title = gate || (s.offline && !s.list.rows.length) ? "Mail" : logic.viewTitle(s);
    const lensN = s.lens === "people" || s.lens === "updates" ? Number(s.counts?.[s.lens]) || 0 : 0;
    const line = gate ? "" : s.offline ? "Offline" : s.list.err && !s.list.rows.length ? "Couldn’t reach Mail · Try Again"
      : s.query ? `${s.list.rows.length}${s.list.more ? "+" : ""} found` : s.box === "trash" ? (s.counts?.trash ? `${s.counts.trash} in Trash` : "Empty")
      : s.box === "drafts" ? (s.counts?.drafts ? `${s.counts.drafts} draft${s.counts.drafts === 1 ? "" : "s"}` : "")
      : s.lens === "people" || s.lens === "updates" ? (lensN ? `${lensN} unread` : s.counts ? "All caught up" : "")
      : s.lens === "later" ? (s.counts?.later ? `${s.counts.later} put off` : "") : "";
    const sectionLabel = SECTIONS.find(([id]) => id === s.lens)?.[1] || "Mail";
    return {
      title, compactTitle: n && s.lens === "people" ? `${sectionLabel} · ${n}` : sectionLabel, line, badges,
      pick: gate ? null : { label: "Views", run: () => ctx.open.views() }, acts: gate ? [] : [write], sections: SECTIONS, back: null,
    };
  }
  offs.push(...["lens", "filter", "address", "box", "counts", "offline", "threadId", "thread", "layout", "list", "query", "access"].map((k) => store.on(k, header)));

  // ---- the gate (S4-D12) and offline (S4-D15) words, over the list
  function drawState() {
    const s = store.get(), ui = fw.ui;
    const gate = s.access && s.access !== "ok" ? GATE[s.access] || GATE.signin : null;
    const off = !gate && s.offline && !s.list.rows.length;
    stateEl.hidden = !gate && !off;
    listEl.hidden = !!gate || off || (s.layout === "phone" && !!s.threadId && route?.key === "thread");
    readerEl.hidden = !!gate || !s.threadId || (s.layout === "phone" && route?.key !== "thread");
    root.classList.toggle("ml-split", s.layout === "pad" && !gate && !off);
    if (gate) stateEl.replaceChildren(ui.empty({ title: gate[0], body: gate[1], acts: gate[2] ? [{ label: gate[2], primary: true, act: "signin", run: () => ctx.open.signin() }] : [] }));
    else if (off) stateEl.replaceChildren(ui.empty({ title: OFFLINE[0], body: OFFLINE[1], acts: [{ label: "Write", act: "compose", run: () => ctx.open.compose({}) }] }));
    else stateEl.replaceChildren();
  }
  offs.push(...["access", "offline", "list", "threadId", "layout"].map((k) => store.on(k, drawState)));

  // ---- starting: who's asking, then me, the counts, the version and the list together
  async function start() {
    try {
      const sess = await api.session();
      const access = sess?.access || "signin";
      store.set({ access }, "session");
      // (Mail's /api/session answers 200 { access: "signin" } when it has no session: InFlite asked whether it's gone)
      if (access === "signin") { try { fw.session.lost(); } catch {} }
      if (access !== "ok") return;
      const [me, counts, v] = await Promise.all([api.me(), api.counts(), api.version().catch(() => null), actions.load()]);
      store.set({ me, counts: logic.countsOf(counts), version: v?.v ?? null, offline: false }, "start");
    } catch (e) {
      if (!e.status) store.set({ offline: win.navigator?.onLine === false, list: { ...store.get().list, loading: false, err: win.navigator?.onLine === false ? null : e.message } }, "start");
      else if (e.status !== 401) store.set({ list: { ...store.get().list, loading: false, err: e.message } }, "start");
    } finally { drawState(); }
  }

  // ---- the poll: only while shown and the page visible (S4-D14)
  let timer = 0, polling = false;
  async function poll(back = false) {
    if (!onScreen || doc.visibilityState !== "visible" || polling || list.swiping?.()) return;
    const s = store.get();
    // (behind the gate: asked again as the page comes back, a check done in Mail's own tab meanwhile)
    if (s.access !== "ok") { if (s.access === null || s.offline || (back && s.access !== "notadmin")) return start(); return; }
    polling = true;
    try {
      const { v } = await api.version();
      if (store.get().offline) store.set({ offline: false });
      if (v && v === store.get().version && !store.get().list.err) { store.set({ updatedAt: Date.now() }); return; }
      const before = Number(store.get().counts?.people) || 0;
      await actions.counts();
      if (store.get().query || (await actions.load({ quiet: true }))) store.set({ version: v ?? store.get().version });
      const after = Number(store.get().counts?.people) || 0;
      const n = store.get();
      if (after > before && (n.lens !== "people" || n.filter !== "all" || n.box)) fw.toast(`${after - before} New in People`);
    } catch (e) {
      if (!e.status) store.set({ offline: true });
    } finally { polling = false; }
  }
  const startPoll = () => { clearInterval(timer); timer = setInterval(poll, 30000); };
  const stopPoll = () => { clearInterval(timer); timer = 0; };
  offs.push(fw.on("visible", () => { if (onScreen) { poll(true); startPoll(); } }));
  offs.push(fw.on("hidden", () => stopPoll()));
  on(win, "online", () => { if (onScreen) poll(); });

  // ---- search (S4-D9): loaded conversations, the views, Mail Settings, and "Search Mail for …" (the one way a query
  // leaves this phone: by POST, to Mail)
  const VIEWS_RUN = [...SECTIONS.map(([id, l]) => [l, () => fw.nav.section(id)]), ["Drafts", () => go({ box: "drafts" })], ["Trash", () => go({ box: "trash" })]];
  function go(patch) { store.set({ query: "", address: null, ...patch }, "go"); actions.load(); }
  const unprovide = fw.search?.provide?.({
    id: "mail", group: "Mail", order: 30,
    search(q) {
      const s = q.trim().toLowerCase();
      if (!s) return [];
      const hits = store.get().list.rows.filter((t) => !t.draft && [t.subject, t.latest?.snippet, t.snippet, ...(t.people || []).flatMap((p) => [p.name, p.email])].some((x) => String(x || "").toLowerCase().includes(s))).slice(0, 5)
        .map((t) => { const who = logic.displayName(t.from || t.people?.[0]); return { title: t.subject || "(No Subject)", sub: [who, logic.fmtListDate(t.date)].filter(Boolean).join(" · "), avatar: who || "?", run: () => openThread(t.id) }; });
      const views = VIEWS_RUN.filter(([l]) => l.toLowerCase().includes(s)).map(([l, run]) => ({ title: `Mail · ${l}`, sub: "Mail", icon: "mail", run }));
      const settings = "mail settings".includes(s) ? [{ title: "Mail Settings", sub: "Mail", icon: "mail", run: () => ctx.open.settings(null) }] : [];
      return [...hits, ...views, ...settings, { title: `Search Mail for “${q.trim()}”`, sub: "Asks Mail", icon: "mail", label: `Search Mail for ${q.trim()}`, run: () => searchMail(q) }];
    },
  }) || (() => {});
  function searchMail(q) {
    q = String(q || "").trim().slice(0, 300);
    if (!q) return;
    if (store.get().layout === "phone" && route?.key === "thread") fw.nav.go(SECTION_PATH(store.get().lens));
    store.set({ query: q, box: null }, "search");
    actions.load();
  }
  const SECTION_PATH = (id) => (id === "people" ? "/mail/" : `/mail/#${id}`);
  function openThread(id) {
    if (!logic.idOk(id)) return;
    if (store.get().layout === "pad") store.set({ threadId: id }, "open");
    else fw.nav.go(fw.nav.href("thread", id));
  }

  // ---- keys (S4-D23): inert unless Mail is shown and nothing's being typed or a sheet is open
  on(doc, "keydown", (e) => {
    if (!onScreen || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.("input,textarea,select,[contenteditable]") || doc.activeElement?.closest?.("dialog")) return;
    const s = store.get(), k = e.key;
    const rowEl = listEl.contains(doc.activeElement) ? doc.activeElement.closest?.(".ml-row[data-thread]") : null;
    const t = rowEl ? s.list.rows.find((r) => r.id === rowEl.dataset.thread) : s.threadId ? s.thread?.t || s.list.rows.find((r) => r.id === s.threadId) : null;
    const rowsNow = [...listEl.querySelectorAll(".ml-row")];
    const step = (d) => {
      const i = rowsNow.indexOf(rowEl || listEl.querySelector(`.ml-row[data-thread="${CSS.escape(s.threadId || "")}"]`));
      const next = rowsNow[Math.max(0, Math.min(rowsNow.length - 1, i < 0 ? 0 : i + d))];
      if (!next) return;
      next.focus();
      if (s.layout === "pad" && next.dataset.thread) store.set({ threadId: next.dataset.thread }, "key");
    };
    const reply = (mode) => { if (!t) return; const id = t.latestId || t.latest?.id; if (id) api.meta(id).then((m) => ctx.open.compose(logic.replyDraft(m, mode, store.get().me)), (err) => fw.toast(err.message)); };
    const did = {
      c: () => ctx.open.compose({}), n: () => ctx.open.compose({}),
      "/": () => list.focusSearch?.(),
      1: () => fw.nav.section("people"), 2: () => fw.nav.section("updates"),
      j: () => step(1), k: () => step(-1),
      r: () => reply("reply"), a: () => reply("replyAll"), f: () => reply("forward"),
      e: () => t && actions.act([t.id], logic.leadAction(t).act),
      "#": () => t && (t.trashed ? null : actions.act([t.id], "trash")), Delete: () => t && !t.trashed && actions.act([t.id], "trash"),
      u: () => t && actions.act([t.id], t.unread ? "read" : "unread"),
      l: () => t && actions.act([t.id], t.starred ? "unflag" : "flag"),
    }[k];
    if (!did) return;
    e.preventDefault();
    did();
  });

  // ---- lenses: where a section route puts the list
  function setLens(lens) {
    const s = store.get();
    if (lens === s.lens && !s.box && !s.address && !s.query && (s.list.rows.length || s.list.loading || s.list.err)) return;
    store.set({ lens, filter: lens === s.lens ? s.filter : "all", address: null, box: null, query: "" }, "lens");
    try { local.put(STORAGE.lens, lens); } catch {}
    if (s.access === "ok") actions.load();
  }

  return {
    show(r) {
      const s0 = store.get();
      const thread = r?.key === "thread" && logic.idOk(r.arg) ? r.arg : null;
      // (back from the phone's reader to the list, in Mail all along: the row that opened it, C7)
      const from = onScreen && !thread && route?.key === "thread" && s0.layout === "phone" ? s0.threadId : null;
      route = r;
      cold = !!thread && fw.nav.depth() === 0;
      // (the header first, before anything waits: no subject of the last thread left behind)
      onScreen = true;
      if (thread) store.set({ threadId: thread }, "route");
      else if (s0.layout === "phone" && s0.threadId) store.set({ threadId: null }, "route");
      fw.header.set(headOf(store.get()));
      // (the remembered lens, on the first show only, for a bare People address, S4-D25)
      const first = bootState.first;
      bootState.first = false;
      if (first && !thread && r?.key === "people") {
        const kept = local.get(STORAGE.lens, null);
        if (LENS_IDS.includes(kept) && kept !== "people") {
          store.set({ lens: kept }, "remembered");
          header();
          queueMicrotask(() => fw.nav.section(kept));
        }
      }
      // (on a thread route the section is the alias's: the lens stays as it is)
      if (!thread && r?.section && LENS_IDS.includes(r.section) && !(first && store.get().lens !== "people" && r.key === "people")) {
        if (bootState.started) setLens(r.section);
        else store.set({ lens: r.section }, "route");
      }
      // (an iPad: the pane, the address the lens's)
      if (thread && store.get().layout === "pad") queueMicrotask(() => fw.nav.section(store.get().lens));
      if (r?.key === "settings") ctx.open.settings(r.arg || null);
      // (the hand-back swapped at Mail, then Mail asked afresh once the first ask is in, whichever way it went: a first
      // ask answered after the swap says the old gate, and only a fresh one brings Mail's list in)
      // (the code read from the address as it is now, before the frame tidies it: the sign-in page puts its own hints
      // after it, &f=…, which the router's arg can't hold)
      const code = r?.key === "signin" ? r.arg || hashCode() : null;
      if (code) signinJs().then((m) => m.finishSignIn(ctx, code)).then(() => Promise.resolve(bootState.started).catch(() => {})).then(() => start(), () => {});
      drawState();
      list.draw();
      reader.draw();
      // (the frame gives focus back as the pop is drawn, while the list is still hidden under the reader, so it lands on
      // the header's title: given to the row here, once the list shows again)
      if (from) listEl.querySelector(`.ml-row[data-thread="${CSS.escape(from)}"]`)?.focus({ preventScroll: true });
      if (doc.visibilityState === "visible") startPoll();
      if (!bootState.started) {
        bootState.started = start();
        return Promise.race([bootState.started, new Promise((ok) => setTimeout(ok, 900))]);
      }
      if (store.get().access === null || (store.get().offline && win.navigator?.onLine !== false)) start();
    },
    hide() {
      onScreen = false;
      stopPoll();
      // (the header back to the lens's: nothing of the thread left behind for the next show)
      fw.header.set(headOf(store.get(), { lensOnly: true }));
      try { list.hide(); reader.hide(); } catch (e) { console.error(e); }
    },
    back() {
      const s = store.get();
      if (s.layout === "phone" && s.threadId && route?.key === "thread" && fw.nav.depth() === 0) {
        fw.nav.go("/mail/", { replace: true, kind: "pop" });
        return true;
      }
      return false;
    },
    busy: () => {
      const s = store.get();
      return !!(s.compose || s.sending > 0 || list.swiping?.() || Date.now() - readAt < 30e3);
    },
    flush: () => ctx.outbox.flush(),
    sendable: () => null,
    unmount() {
      onScreen = false;
      stopPoll();
      ctx.outbox.flush({ keepalive: true }).catch(() => {}).finally(() => ctx.outbox.destroy());
      unprovide();
      for (const f of offs.splice(0)) try { f(); } catch {}
      try { list.destroy(); } catch (e) { console.error(e); }
      try { reader.destroy(); } catch (e) { console.error(e); }
      stateEl.remove(); listEl.remove(); readerEl.remove();
    },
  };
}
