// Mail's conversation rows under the roof (One roof stage 4, s4/spec §4.1, S4-D18, D19; app.js:3977–4150): one
// ifl-row per conversation, and the swipe physics of setupRowGestures: right = Done, left = Later, never a pointer that
// starts within EDGE px of the left edge (that is the framework's edge Back, D19). B0-b's stub (STUB = true); MM writes it.
// Frozen:
//   threadRow(t, ctx) → HTMLElement   the row for Summary t: an element with data-thread=<t.id>, its words by textContent
//   swipes(listEl, ctx, { done(id), later(id), menu(id) }) → off   one set of pointer listeners on the list (delegated);
//                                     ctx.store's busy-swipe note while a row is under the finger (S4-D13)
//   EDGE = 20
export const STUB = true;
export const EDGE = 20;
export function threadRow(t, ctx) {
  const el = document.createElement("div");
  el.className = "ifl-row ml-row";
  el.dataset.thread = String(t?.id ?? "");
  el.textContent = String(t?.subject ?? "");
  return el;
}
export function swipes(listEl, ctx, handlers = {}) {
  return () => {};
}
