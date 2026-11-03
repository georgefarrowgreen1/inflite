// Mail's menus under the roof (One roof stage 4, s4/spec §4.1, §2.2, S4-D18, S4-D26, BB4): framework sheets (fw.sheet.open,
// Mail's accent, no history, D22) with the names the hooks know (§10.2, roofhooks.mjs). B0-b's stub (STUB = true): the
// openers and SHEETS are frozen; MM writes them.
//   openViews(ctx)          "mail-views": filters; addresses with counts; Drafts; Trash with Empty Trash; Mail Settings
//                           as the last row (→ ctx.open.settings())
//   openLater(ctx, ids)     "mail-later": logic.laterChoices() and Pick a Time; → ctx.actions.act(ids, "snooze", { until })
//   openRowMenu(ctx, t)     "mail-rowmenu": Done, Later, Flag, Mark Unread, Move to People/Updates, Unsubscribe, Trash
//   openUnsub(ctx, t)       "mail-unsub": unsubSheet (app.js:4269)
//   confirm(ctx, spec) → Promise<boolean>   "mail-confirm": spec = { title, text, yes, no, danger }
export const STUB = true;
export const SHEETS = { views: "mail-views", later: "mail-later", rowMenu: "mail-rowmenu", unsub: "mail-unsub", confirm: "mail-confirm" };
export function openViews(ctx) {}
export function openLater(ctx, ids) {}
export function openRowMenu(ctx, t) {}
export function openUnsub(ctx, t) {}
export function confirm(ctx, spec) { return Promise.resolve(false); }
