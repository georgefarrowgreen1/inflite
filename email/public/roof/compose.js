// Mail's compose under the roof (One roof stage 4, s4/spec §4.1, §4.2, S4-D4, D16, D18, §3.1; app.js:5889–6542): the lazy
// framework sheet "mail-compose" (kept offline: connector.lazy, C11). B0-b's stub (STUB = true); MR writes it.
// Frozen: openCompose(ctx, init) → sheet handle | null
//   init = { to, cc, bcc, subject, text, quote: { of, mode } | null, files: [{ ref, filename, type, size } | File],
//            draftId, from, inReplyTo, references } (every field optional; {} = a new message)
//   quote: the original's snippet under "Quoted below" (Mail's server builds the quote, S4-D4); a draftId opens by
//   api.draft (a quoteOld draft: "This draft was started in Mail on its own. …", Send asks "Send Without the Quoted
//   Text?"). Send goes through ctx.outbox.send. Closing never asks: a changed compose closed by drag, Escape, ✕, a route
//   change or sign-out writes mail:unsent synchronously in onClose (ctx.outbox.keepUnsent), then saves a server draft
//   (keepalive) and toasts "Draft saved". Delete Draft is in its ⋯ menu.
export const STUB = true;
export function openCompose(ctx, init = {}) {
  return null;
}
