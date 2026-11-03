// Mail's sending under the roof (One roof stage 4, s4/spec §4.1, S4-D16, S4-D18, C9, C10; app.js:5796–5888, 6543–6697):
// Send = save, then send. B0-b's stub (STUB = true): the names and constants are frozen; MM writes it.
//   createOutbox(ctx) → {
//     send(draft, files, onProgress) → Promise   api.saveDraft (files uploaded with progress, or { ref }), then the toast
//         "Sending… · Undo" (fw.toast's handle, closed the moment the send starts), then after UNDO_MS
//         api.sendDraft(draftId, key); Undo before then keeps the draft and reopens compose (ctx.open.compose); after,
//         "Already sent". Offline: with files, refused ("Files need a connection. Try Again"); else queued in
//         STORAGE.outbox (text only, never file bytes) and sent on "online" or the next "visible".
//     retry(key), pending() → OutboxItem[]   "Did it go?" through api.sent(keys) (/api/sends)
//     keepUnsent(fields) → boolean           STORAGE.unsent written synchronously (compose's onClose); false over CAP or on
//                                            QuotaExceededError ("Couldn’t keep this on your phone. Try Again when you’re online")
//     unsent() → fields | null, dropUnsent()
//     flush({ keepalive }) → Promise<{ lost }>  open compose and queued sends saved as server drafts, ≤ FLUSH_MS (C10)
//     destroy()
//   }
//   OutboxItem = { key, at, draft: { from, to, cc, bcc, subject, text, quote: { of, mode } | null, draftId } }
import { STORAGE, CAP } from "./store.js";

export const STUB = true;
export const UNDO_MS = 6000;
export const FLUSH_MS = 2000;
export function createOutbox(ctx) {
  return {
    send: async (draft, files, onProgress) => ({ ok: false }),
    retry: async (key) => {},
    pending: () => [],
    keepUnsent: (fields) => true,
    unsent: () => null,
    dropUnsent: () => {},
    flush: async (opts = {}) => ({ lost: 0 }),
    destroy: () => {},
  };
}
