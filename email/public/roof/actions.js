// Mail's thread actions under the roof (One roof stage 4, s4/spec §4.1, S4-D18; app.js:4410–4458): optimistic, by
// logic.inView, every one through api.batch (POST /api/threads/batch, one preflight for a whole visit, S4-D2), with the
// framework's undo toast (its handle closed when a newer one replaces it, C9), and the rows put back on an error.
// B0-b's stub (STUB = true): the names are frozen; MM writes them.
//   createActions(ctx) → { act(ids, action, opts) → Promise, batch(body) → Promise }
//     act: action one of "done" | "inbox" | "read" | "unread" | "flag" | "unflag" | "trash" | "restore" | "category" |
//     "snooze" | "unsnooze" | "delete"; opts { category, sender, until, undo: bool (default true), say: toast words };
//     the rows that leave the current list (logic.inView false) go at once; Undo sends the inverse.
//     batch: api.batch(body) with the store's list kept in step (body = { ids | every, action, … }).
export const STUB = true;
export function createActions(ctx) {
  return {
    act: async (ids, action, opts = {}) => ({ ok: true }),
    batch: (body) => ctx.api.batch(body),
  };
}
