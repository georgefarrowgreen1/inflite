import { addDays as u, localDay as p, pathOf as m, when as g, zone as D } from "./model.js";
async function k(t, a, { current: r, refresh: i, onRefresh: n }) {
  const s = () => t.live() && r(), o = { from: (/* @__PURE__ */ new Date(a[0] + "T00:00:00")).getTime(), to: (/* @__PURE__ */ new Date(a[1] + "T00:00:00")).getTime() }, e = await t.request("calendar-events", { method: "POST", body: o, current: r });
  if (!s()) return [];
  if (i) {
    const l = (e.calendars || []).filter((d) => d.provider !== "Imported calendar" && Date.now() - d.syncedAt > 9e5);
    l.length && Promise.allSettled(l.map(({ id: d, version: c }) => t.request("calendar-refresh", { method: "POST", body: { id: d, version: c }, current: r }))).then(() => {
      s() && n();
    });
  }
  return e.events || [];
}
function x(t, a, { create: r }) {
  const i = t.ui, n = i.el;
  let s;
  const o = (l, d) => i.btn(l, { run: () => Promise.resolve(d()).catch((c) => {
    t.signal.aborted || t.toast(c.message);
  }) }), e = n("div", { class: "org" }, n("p", { class: "org-muted", text: a.calendarName + " \xB7 Read only" }), n("h2", { text: a.title }), n("p", { text: g(a) }), a.description ? n("p", { class: "org-event-description", text: a.description }) : null, n("p", { class: "org-muted", text: "Changes stay in your original calendar. Last synced " + new Date(a.syncedAt).toLocaleString() }), o("Make an editable copy", async () => {
    const { title: l, description: d, allDay: c, timezone: f, start: h, end: y, startDate: b, endDate: w } = a;
    s.now(), await r({ title: l, description: d, allDay: c, timezone: f, links: [], ...c ? { startDate: b, endDate: w } : { start: h, end: y } });
  }), o("Manage calendars", () => {
    s.now(), t.workspace?.life?.calendars();
  }));
  return s = t.sheet.open({ sheet: "external-event", title: "Calendar event", body: e }), s;
}
function T(t, a = [], r = Date.now()) {
  const i = a.filter((e) => e.status === "open" && Number.isFinite(e.dueAt)).map((e) => ({ id: "reminder:" + e.id, title: e.title, start: e.dueAt, end: e.dueAt + 1, source: { app: "reminders", id: e.id }, label: "Reminder" }));
  if (!t || !Number.isFinite(t.at) || Math.abs(r - t.at) > 30 * 6e4) return i;
  const n = t.cards || {}, s = n.fitness, o = n.markets?.dividend;
  s?.kind === "session" && /^\d{4}-\d{2}-\d{2}$/.test(s.day || "") && i.push({ id: "fitness:" + s.day, title: s.session?.name || "Planned ride", allDay: !0, startDate: s.day, endDate: u(s.day, 1), source: { app: "fitness", id: s.day }, label: "Fitness \xB7 time not set", ride: !0 }), Number.isFinite(o?.at) && i.push({ id: "income:" + o.at, title: o.name ? "Income \xB7 " + o.name : "Expected income", allDay: !0, startDate: p(o.at), endDate: u(p(o.at), 1), source: { app: "markets" }, label: "Markets \xB7 estimated date" });
  for (const e of n.chat?.inbound || []) Number.isFinite(e.landsAt) && i.push({ id: "letter:" + e.who?.id + ":" + e.landsAt, title: e.mystery ? "A letter arrives" : "Letter from " + (e.who?.name || "a friend"), start: e.landsAt, end: e.landsAt + 1, source: { app: "chats", ...!e.mystery && /^[\w-]{1,40}$/.test(e.who?.id || "") ? { id: e.who.id } : {} }, label: "Chats \xB7 expected arrival" });
  for (const e of n.mail?.ahead || []) Number.isFinite(e.start) && i.push({ id: "booking:" + e.id, title: e.title, start: e.start, end: Number.isFinite(e.end) && e.end > e.start ? e.end : e.start + 1, source: { app: "mail", .../^[\w-]{1,40}$/.test(e.thread || "") ? { id: e.thread } : {} }, label: "Mail \xB7 confirmed booking" });
  for (const e of n.markets?.payouts || []) /^\d{4}-\d{2}-\d{2}$/.test(e.date || "") && i.push({ id: "interest:" + e.id, title: "Interest \xB7 " + e.name, allDay: !0, startDate: e.date, endDate: u(e.date, 1), source: { app: "markets" }, label: "Markets \xB7 scheduled payout" });
  return i;
}
async function A(t, a) {
  const r = [];
  let i = null;
  for (let n = 0; n < 5; n++) {
    const s = await t.request("actions", { query: { status: "open", cursor: i }, current: a });
    if (r.push(...s.actions || []), i = s.cursor, !i) break;
  }
  return r;
}
async function P(t, a, { current: r, refresh: i, onRefresh: n }) {
  const { createSystemClient: s } = await import("/roof/system-client.js");
  if (!r()) return [];
  const [o, e] = await Promise.all([
    k(s(t, { prefix: "/api/organise/" }), a, { current: r, refresh: i, onRefresh: n }).catch(() => []),
    A(s(t), r).catch(() => [])
  ]);
  return r() ? T(t.workspace?.today?.(), e).concat(o) : [];
}
function S(t, a, { create: r }) {
  if (a.readOnly) return x(t, a, { create: r });
  if (!a.ride) {
    t.nav.go(a.source.app === "reminders" ? "/#you=action-" + a.source.id : m(a.source));
    return;
  }
  const { el: i, btn: n } = t.ui, s = i("div", { class: "org" }, i("h3", { text: a.title }), i("p", { text: "This ride has no confirmed start time. Review Fitness and Weather, or choose a time to create a linked calendar event." }));
  let o;
  s.append(
    n("Open Fitness", { run: () => {
      o.now(), t.nav.go(m(a.source));
    } }),
    n("Open forecast", { run: () => {
      o.now(), t.nav.go("/weather/");
    } }),
    n("Choose event time", { primary: !0, run: async () => {
      o.now();
      try {
        await r({ title: a.title, description: "", allDay: !1, start: (/* @__PURE__ */ new Date(a.startDate + "T09:00:00")).getTime(), end: (/* @__PURE__ */ new Date(a.startDate + "T10:00:00")).getTime(), timezone: D(), links: [a.source] });
      } catch (e) {
        t.signal.aborted || t.toast(e.message);
      }
    } })
  ), o = t.sheet.open({ sheet: "calendar-ride", title: "Plan this ride", body: s });
}
export {
  P as calendarSources,
  T as linkedEvents,
  S as openCalendarSource
};
