// InFlite's Send (One roof, spec §3.11, D17): stage 1 keeps Chat's engine sheet (IFL.hub.send → IFLChat.share, end to
// end encrypted in its own frame) as the one Send sheet. Degraded, Chat's own address (IFL.hub.send does that); the
// "Sent to Pat. You’re still here" toast stays IFL.hub.sent's.
// createSend(F) → Send = { send({ words, packed, what, to }) → Promise, button({ words, packed, what }) → Element }
//   button: a button.ifl-btn[data-act=send] "Send" with the send glyph, aria-label "Send <what> to a friend".
export function createSend(F) {
  const send = ({ words, packed, to } = {}) => {
    const hub = globalThis.IFL?.hub;
    if (!hub?.send) return Promise.resolve(false);
    return Promise.resolve(hub.send(words, packed, { to })).catch(() => false);
  };
  return {
    send,
    button(spec = {}) {
      return F.ui.btn("Send", { icon: "send", act: "send", label: `Send ${spec.what || "this"} to a friend`, run: () => send(typeof spec === "function" ? spec() : spec) });
    },
  };
}
