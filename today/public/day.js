// Today's day, drawn (Today First, spec §7.3, §7.7): a version 2 answer of GET /api/today?v=2, phase by phase. The top
// card of the phase it is (the plan, the weather you'll ride in, the ride, your ride done, the day closed), Waiting for
// You (who and when from the server; what they said, from Chat's engine on this phone only), Coming Up, The Rest of
// Today; Undo, Take and Keep (/api/act, /api/act/undo); Send on every card (IFL.hub.send). Everything through esc(),
// nothing in an inline style, and never a box to type in.
//   drawDay(root, answer, ctx: { now }) → nothing: the day drawn into root (#today), its phase as root's data-phase
//   phaseAt(answer, now) → the phase it is at now, from the answer's timeline, with no request
//   tickDay(root, answer, now) → nothing: passed rows dropped, and at the answer's until, the next phase from its tops
// (B0's stub: only the phase marked, so the page's hook can be built against it; batch TP writes it. The names and
// arguments stay.)
export function drawDay(root, answer, ctx) {
  if (root) root.dataset.phase = answer?.phase || "";
}
export function phaseAt(answer, now) {
  return answer?.phase;
}
export function tickDay(root, answer, now) {}
