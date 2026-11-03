// InFlite's Send (spec §3.11, D17): Chat's engine sheet through IFL.hub.send. B0's stub; FW writes it.
// createSend(F) → Send = { send({ words, packed, what, to }), button({ words, packed, what }) → Element }
//   send → IFL.hub.send(words, packed, { to }) (degraded: Chat's own address); button → a .ifl-btn "Send" with the send
//   glyph, aria-label "Send <what> to a friend", that calls send.
export const STUB = true;
export function createSend(F) {
  return { send(spec) {}, button(spec) { return null; } };
}
