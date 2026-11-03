// Mail's pictures viewer under the roof (One roof stage 4, s4/spec §4.1, §2.2, S4-D17; app.js:5287–5680): the lazy
// framework sheet "mail-viewer" (network only): pictures only (logic.PICTURES), each fetched by api.picture and shown
// from a blob: URL re-typed to its own type, used only in <img src>, revoked on close; pinch, swipe, Share with
// navigator.share({ files }) where offered. Anything else opens at Mail's address (api.fileUrl), never here.
// B0-b's stub (STUB = true); MR writes it.
// Frozen: openViewer(ctx, files, i) → sheet handle | null   files: [{ id, filename, type, size }], i: the one shown first
export const STUB = true;
export function openViewer(ctx, files, i = 0) {
  return null;
}
