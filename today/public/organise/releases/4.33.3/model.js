const n = (t = /* @__PURE__ */ new Date()) => {
  const e = new Date(t);
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
}, o = (t, e) => {
  const a = /* @__PURE__ */ new Date(t + "T12:00:00");
  return a.setDate(a.getDate() + e), n(a);
}, i = (t) => {
  const e = new Date(t);
  return n(e) + "T" + String(e.getHours()).padStart(2, "0") + ":" + String(e.getMinutes()).padStart(2, "0");
};
function r(t) {
  const e = new Date(t);
  if (!Number.isFinite(+e) || i(+e) !== t) throw Error("This local time does not exist. Choose another time.");
  return +e;
}
const d = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", s = (t) => t.allDay ? t.startDate : n(t.start);
function p(t, e, a) {
  return t.allDay ? t.startDate < a && t.endDate > e : t.start < (/* @__PURE__ */ new Date(a + "T00:00:00")).getTime() && t.end > (/* @__PURE__ */ new Date(e + "T00:00:00")).getTime();
}
function l(t) {
  return t.allDay ? "All day" + (t.endDate > o(t.startDate, 1) ? " \xB7 through " + (/* @__PURE__ */ new Date(o(t.endDate, -1) + "T12:00:00")).toLocaleDateString() : "") : new Date(t.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " \u2013 " + new Date(t.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
const D = (t) => ["calendar", "notes", "people"].includes(t.app) ? `/${t.app}/#item=${t.id}` : t.app === "mail" ? t.id ? "/mail/#thread=" + t.id : "/mail/" : t.app === "chats" ? t.id ? "/chats/#open=" + t.id : "/chats/" : t.app === "fitness" && /^\d{4}-\d{2}-\d{2}$/.test(t.id || "") ? "/fitness/#day=" + t.id : `/${t.app}/`;
export {
  o as addDays,
  s as eventDay,
  n as localDay,
  i as localInput,
  p as overlaps,
  r as parseLocal,
  D as pathOf,
  l as when,
  d as zone
};
