// Mail's module: its entry under InFlite's roof (One roof stage 4, s4/spec §4.1, §4.2, S4-D5–D7, D13, D14, D23, D25,
// D26; stage 1 §5). Served by Mail's Worker at /roof/mail.js and passed through at inflite.ai/mail/roof/mail.js; loaded
// by the framework (roof/modules.js) with import("/mail/roof/mail.js") on first open. B0-b's stub (STUB = true): the
// exports, the instance's methods, ctx and the regions are frozen; MM writes the real entry.
//
// Exports (frozen; roofmailcontract.test reads them from this file's text, so each stays a literal on one line):
//   CONTRACT = 1; BUILD and NEWS = literal copies of email/public/app.js's (equal, always: the integrator raises both in
//   one commit, S4-D19); SECTIONS = the router's REGISTRY.mail.sections = connector.sections; mount(root, fw) →
//   Promise<instance>. This file never imports connector.js (it isn't in the static graph, §4.4).
// instance = { show(route, hint) → void | Promise, hide(), back() → boolean, busy() → boolean,
//   flush() → Promise<{ lost: number }>, sendable() → null, unmount() }
//   show(route): the header set synchronously first, before any await (§2.1, RI14); route.section → the lens (S4-D25 on
//     the first show); key "thread" + arg → the reader (phone: pushed, iPad: pane, S4-D6); "settings" →
//     ctx.open.settings(arg); "signin" + arg → finishSignIn (lazy signin.js).
//   hide(): stops the poll (S4-D14), resets the header to the lens's. back(): S4-D7. busy(): S4-D13 (compose open, a
//   send in its undo window or in flight, a swipe under the finger, the reader touched in the last 30 s).
//   flush(): C10 (open compose and queued sends saved as server drafts, ≤ 2 s). sendable(): null (S4-D22).
//   unmount(): flush with keepalive, picture URLs revoked, every listener dropped (message, keydown, matchMedia).
//
// What mount builds, in root (div.m-mail, inside main#m-mail): section.ml-list (list.js's view) and section.ml-reader
// (reader.js's view, hidden until a thread shows); root.dataset.layout = "phone" | "pad" (S4-D6's rule by matchMedia).
// ctx (frozen, §4.2) = { store, api, logic, actions, fw, layout(), icon,
//   open: { compose(init), later(ids), views(), rowMenu(t), unsub(t), settings(page), viewer(files, i), signin(),
//           confirm(spec) },
//   outbox }   (added by B0-b: outbox.js's createOutbox(ctx), so compose.js sends through MM's outbox, S4-D18)
//   open.compose, open.settings, open.viewer and open.signin reach their lazy files only through
//   fw.lazy((q) => import("./<file>.js" + q)) (s24-contracts §7: q is "?retry=<n>" after a failed import).
// The header (fw.header.set) is set from here alone, on lens, filter, address, box, counts, offline, threadId, layout:
//   title = the view with pick ▾ → open.views(); line; acts: Write only ({ icon: "compose", label: "Write", run }); badges
//   { people: { n, say } } (S4-D26); on a phone reader sections: false and back: { label: "Back to Mail" }
//   (s24-contracts §4: false hides the switcher). A Mail API call refused by CORS while online →
//   fw.session.hubAgain() (s24-contracts §2); a change Today's Mail card shows (counts) → fw.changed().
import { createStore } from "./store.js";
import { MAIL, createApi } from "./api.js";
import * as logic from "./logic.js";
import { createActions } from "./actions.js";
import { view as listView } from "./list.js";
import { view as readerView } from "./reader.js";
// (menus.js's confirm under another name: a bare confirm( reads as the page's, which §5.1 forbids)
import { openViews, openLater, openRowMenu, openUnsub, confirm as confirmSheet } from "./menus.js";
import { icon } from "./icons.js";
import { createOutbox } from "./outbox.js";

export const STUB = true;
export const CONTRACT = 1;
export const BUILD = "1.48";
export const NEWS = "InFlite’s note about its one app shows only on Mail’s own Home Screen icon, never over a page in a small browser";
export const SECTIONS = [["people", "People"], ["updates", "Updates"], ["later", "Later"], ["done", "Done"]];

export async function mount(root, fw) {
  const store = createStore();
  const api = createApi({ base: MAIL, onLost: () => fw.session.lost() });
  const ctx = { store, api, logic, actions: null, fw, layout: () => store.get().layout, icon, open: {}, outbox: null };
  ctx.actions = createActions(ctx);
  ctx.outbox = createOutbox(ctx);
  Object.assign(ctx.open, {
    compose: (init) => fw.lazy((q) => import("./compose.js" + q)).then((m) => m.openCompose(ctx, init)),
    later: (ids) => openLater(ctx, ids), views: () => openViews(ctx), rowMenu: (t) => openRowMenu(ctx, t), unsub: (t) => openUnsub(ctx, t),
    settings: (page) => fw.lazy((q) => import("./mailsettings.js" + q)).then((m) => m.openSettings(ctx, page)),
    viewer: (files, i) => fw.lazy((q) => import("./viewer.js" + q)).then((m) => m.openViewer(ctx, files, i)),
    signin: () => fw.lazy((q) => import("./signin.js" + q)).then((m) => m.signIn(ctx)),
    confirm: (spec) => confirmSheet(ctx, spec),
  });
  const doc = root.ownerDocument;
  const region = (cls, label) => { const el = doc.createElement("section"); el.className = cls; el.setAttribute("aria-label", label); root.append(el); return el; };
  const listEl = region("ml-list", "Conversations"), readerEl = region("ml-reader", "Conversation");
  readerEl.hidden = true;
  root.dataset.layout = "phone";
  const list = listView(listEl, ctx), reader = readerView(readerEl, ctx);
  return {
    show(route) {
      fw.header.set({ title: "Mail", line: "", acts: [{ icon: "compose", label: "Write", run: () => ctx.open.compose({}) }] });
      list.draw();
    },
    hide() { list.hide(); reader.hide(); },
    back: () => false,
    busy: () => false,
    flush: async () => ({ lost: 0 }),
    sendable: () => null,
    unmount() { list.destroy(); reader.destroy(); listEl.remove(); readerEl.remove(); },
  };
}
