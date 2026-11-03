// Mail's list under the roof (One roof stage 4, s4/spec §4.1, §2.1, S4-D9; app.js:3012–3943): the "Search Mail" field
// (store query; Enter searches Mail by POST, never a URL), rows by day (rows.js), Updates' digest, caught-up (the next
// back from Later, the newest Updates' senders), the empty states and search alternatives, Load More.
// B0-b's stub (STUB = true); MM writes it.
// Frozen: view(el, ctx) → { draw(), hide(), destroy() } (every Mail view's signature):
//   el: the section.ml-list mail.js made; ctx: mail.js's (§4.2). draw(): (re)draw from ctx.store, cheap when nothing
//   changed; the view subscribes to the store keys it draws (lens, filter, address, box, query, list, counts, offline,
//   threadId, layout) and draws only its own region. hide(): its screen left. destroy(): unmount (remove what it added).
// Hooks it keeps (§10.2): each conversation row is an element with data-thread="<id>" inside .m-mail.
import { threadRow, swipes } from "./rows.js";

export const STUB = true;
export function view(el, ctx) {
  return {
    draw() { if (el && !el.firstChild) el.textContent = "Mail"; },
    hide() {},
    destroy() { if (el) el.textContent = ""; },
  };
}
