// Mail's card on Today (One roof stage 4, s4/spec S4-D10, §2.5): drawn from the answer's cards.mail, which the account
// builds from Mail's numbers alone (functions/_todaymail.js in the georgefarrowgreen repo): { state: "ok", href, people,
// updates, later: { n, next, href } }. Numbers only, never a name or a subject. For the site's admin, and only when Mail
// answered (no card at all otherwise: never a stale or an error one). cards.js draws it (the integrator's one line:
// CARD_KEYS, APP.mail, and this drawer for key "mail").
//   mailCard(card, ctx) → the card's inside, as cards.js's drawers give theirs (ctx = { links, tz, now, hub? })
//     head "Mail" (Open: Mail, /mail/ at the hub); big line "3 from people", or "All caught up" with none; then
//     "1 back from Later at 14:00" when the next back from Later is later today (a tap: Later), else "Updates: 5 unread"
//     when there are any, else nothing
// Every address from the answer goes through the hub's own path at the hub (IFL.hub.go: email. → /mail/) and is checked
// either way (cards.js safe); every number is checked as one; nothing else of the answer is drawn.
import { esc, safe, onHub, hubOf, G, hm, dayKey } from "/cards.js";

export const MAIL_ICON = "/apps/mail.svg";
const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
// (an address from the answer, as the hub's own path at the hub, and checked either way)
function link(h, ctx) {
  if (typeof h !== "string") return null;
  if (onHub(ctx)) { try { return safe(hubOf(ctx).go(h)); } catch { return null; } }
  return safe(h);
}
const href = (h, ctx) => esc(link(h, ctx) || "#");

// the words, alone (for the card and its tests): { big, line, later } (later: whether the line is Later's)
export function mailWords(card, { now = Date.now(), tz = "Europe/London" } = {}) {
  const people = count(card?.people), updates = count(card?.updates), n = count(card?.later?.n), next = card?.later?.next;
  if (people == null) return null;
  const big = people ? `${people} from people` : "All caught up";
  const soon = n && Number.isFinite(next) && next > now && dayKey(next, tz) === dayKey(now, tz);
  if (soon) return { big, line: `1 back from Later at ${hm(next, tz)}`, later: true };
  if (updates) return { big, line: `Updates: ${updates} unread`, later: false };
  return { big, line: "", later: false };
}

// (a space between the head's name and the rest: never drawn in its flex row, but its words read "Mail Open", not one)
export function mailCard(c, ctx = {}) {
  const w = mailWords(c, ctx);
  if (!w) return "";
  const head = `<a class="tc-head" href="${href(c.href, ctx)}" aria-label="Open Mail"><img src="${MAIL_ICON}" alt=""><span class="tc-app">Mail</span> <span class="tc-meta"></span><span class="tc-go"><span>Open</span>${G.open}</span></a>`;
  const big = `<h3 class="tc-h">${esc(w.big)}</h3>`;
  const line = !w.line ? "" : w.later
    ? `<p class="tc-p ml-later"><a href="${href(c.later?.href, ctx)}">${G.clock}${esc(w.line)}</a></p>`
    : `<p class="tc-p ml-updates">${esc(w.line)}</p>`;
  return `${head}${big}${line}`;
}
