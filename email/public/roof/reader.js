// Mail's reader under the roof (One roof stage 4, s4/spec §4.1, §2.1, S4-D6, D17, §3.1, §3.2; app.js:4631–4960, 5234):
// the head; message cards from api.meta (never /api/messages/<id>: the page never receives a body, §3.1); a body frame
// per expanded message (bodyframe.js; the newest one made on the row's tap from latestId, in parallel with the thread
// fetch); files (S4-D17: api.picture for logic.PICTURES only, api.fileUrl in a new tab for the rest); quick reply; the
// foot (Reply · Reply All · Forward · ⋯); on an iPad the toolbar (Done, Later, ⋯) and the sticky pane.
// B0-b's stub (STUB = true); MR writes it.
// Frozen: view(el, ctx) → { draw(), hide(), destroy() } (list.js's signature): el is the section.ml-reader mail.js made;
//   it draws store.threadId / store.thread; hide() destroys its frames' handles and revokes picture URLs.
// Hooks it keeps (§10.2): .m-mail iframe.mail-body (bodyframe.js makes them); .m-mail [data-act=done|later|reply|send].
import { bodyFrame } from "./bodyframe.js";

export const STUB = true;
export function view(el, ctx) {
  return {
    draw() {},
    hide() {},
    destroy() { if (el) el.textContent = ""; },
  };
}
