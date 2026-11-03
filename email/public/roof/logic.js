// Mail's pure logic under the roof (One roof stage 4, s4/spec §4.1): no DOM, no storage, no network; ported from
// email/public/app.js so roofmaillogic.test can hold each to the app.js function of the same name on fixed inputs.
// B0-b's stub (STUB = true): the names are frozen; MM writes them. Where app.js's version reads S (the state) or the
// clock, the port takes that as a trailing parameter (state, now), its other parameters as app.js's.
//
//   formatters (app.js:115–198):  escapeHtml, hue, initials, displayName, startOfDay, fmtListDate, fmtLongDate,
//                                 fmtQuoteDate, attName, fmtSize
//   text (225–295):               linkify, textToHtml, parseAddress, EMAIL_RE, mailtoDraft (no htmlToText, bodyInner)
//   views (1725, 2929–2950):      VIEWS, LENSES, FILTERS, lensCount(k, counts), listTitle(state)
//   search tokeniser (3068–3160): DATES, ymd, dateOp(k, now), sayQuery(q, people, now), restoreQuery(q, people, now)
//                                 → { rest, sf } (nothing remembered: no recent searches, S4-D9)
//   Later (4153–4185):            at(days, hour, minute, now), laterChoices(now), fmtWhen(ts, now)
//   lists (4374):                 inView(t, state)
//   replies (5687–5740):          mine(email, me), dedupe(list, me), replyDraft(m, mode, me) → openCompose's init with
//                                 quote: { of: m.id, mode } in place of quote.html (S4-D4)
//   pictures (S4-D17):            PICTURES, the only types shown as images (blob: URLs only for these, re-typed)
export const STUB = true;
export const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;
export const PICTURES = /^image\/(png|jpeg|gif|webp|avif|heic|bmp)$/;
export const VIEWS = {};
export const LENSES = [];
export const FILTERS = [];
export const DATES = [];

const todo = () => undefined;
export const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const hue = todo;
export const initials = todo;
export const displayName = (p) => (p ? p.name || p.email || "" : "");
export const startOfDay = todo;
export const fmtListDate = todo;
export const fmtLongDate = todo;
export const fmtQuoteDate = todo;
export const attName = todo;
export const fmtSize = todo;
export const linkify = todo;
export const textToHtml = todo;
export const parseAddress = todo;
export const mailtoDraft = todo;
export const lensCount = todo;
export const listTitle = todo;
export const ymd = todo;
export const dateOp = todo;
export const sayQuery = todo;
export const restoreQuery = todo;
export const at = todo;
export const laterChoices = () => [];
export const fmtWhen = todo;
export const inView = todo;
export const mine = todo;
export const dedupe = (list) => list || [];
export const replyDraft = todo;
