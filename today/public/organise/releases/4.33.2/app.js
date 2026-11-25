import { createStore as ut } from "./store.js";
import { operationId as Te } from "/roof/system-client.js";
import { localDay as M, addDays as R, eventDay as le, overlaps as ie } from "./model.js";
const _ = { calendar: "Calendar", notes: "Notes", people: "People" }, pt = { calendar: [["week", "Week"], ["agenda", "Month"]], notes: [["all", "All notes"]], people: [["contacts", "Contacts"]] };
async function mt(b, d, t) {
  const y = d.ui, s = y.el, p = await (d.workspace?.organiseStore?.(t) || ut(d, t)), j = d.signal, Ze = d.session.view?.user?.id || d.session.user?.id, h = () => !j.aborted && (d.session.view?.user?.id || d.session.user?.id) === Ze;
  let ce = null, de = null, Ne = "", N = null, w = !1, q = !1, Ee = 0, x = "", z = null, E = /* @__PURE__ */ new Set(), g = null, O = null, A = 0, C = !1, J = "", f = M(), m = pt[t][0][0], ue = 0, F = [], G = "all", $ = "list", Ae = 0;
  const k = /* @__PURE__ */ new Map(), I = /* @__PURE__ */ new Map();
  let ee = null, Pe = "", te = null, pe = "", fe = !1, U = null, ae = null;
  b.classList.add("org"), b.dataset.organise = t, b.dataset.notesView = $;
  const ne = (e) => () => {
    try {
      Promise.resolve(e()).catch((n) => {
        h() && d.toast(n.message);
      });
    } catch (n) {
      h() && d.toast(n.message);
    }
  }, B = (e, n, r = !1) => y.btn(e, { primary: r, run: ne(n) }), he = () => {
    b.dataset.detail || (ce = scrollY, de = document.activeElement?.closest("[data-record]")?.dataset.record || null);
  }, W = (e, n, r = !1) => {
    he(), ae = n ? { id: e, ...n } : null, d.nav.go("/" + t + "/#item=" + e, { replace: r });
  }, ge = () => d.nav.go("/" + t + "/#" + m, { replace: !0, kind: "pop" }), me = () => {
    he(), d.nav.go("/" + t + "/#new");
  }, Me = t === "calendar" ? "New event" : t === "notes" ? "New note" : "Add person", we = s("input", { type: "search", class: "org-search", maxlength: 160, placeholder: t === "people" ? "Search contacts" : t === "notes" ? "Search notes" : "Search events", "aria-label": "Search " + _[t] }), ye = s("p", { class: "org-status", role: "status" }), V = s("div", { class: "org-list" }), L = s("section", { class: "org-detail", hidden: !0, "aria-label": _[t] + " editor" }), ve = B("Show more", () => D(!0)), se = B("Try again", () => D()), Oe = s("span", { class: "org-library-count" }), He = y.btn(Me, { icon: "plus", primary: !0, run: me }), Ie = s("div", { class: "org-library-caption" }, t === "calendar" ? s("h2", { text: "Schedule" }) : null, Oe), be = s("div", { class: "org-library-head" }, Ie, He), re = s("label", { class: "org-search-box" }, y.icon("search"), we), oe = t === "notes" ? s("div", { class: "org-library-options" }, y.seg([["all", "All notes"], ["lists", "Checklists"]], G, (e) => {
    G = e, S();
  }, { label: "Notes collection" }), y.iconBtn("grid", { label: "Switch notes layout", run: () => {
    $ = $ === "list" ? "grid" : "list", b.dataset.notesView = $, S();
  } })) : null, Z = t === "people" ? s("p", { class: "org-muted", hidden: !0 }) : null, xe = s("section", { class: "org-browser" }, be, re, ye, se, Z, V, ve);
  se.hidden = !0, be.hidden = re.hidden = t !== "calendar", oe && xe.insertBefore(oe, re);
  const Ce = s("nav", { class: "org-week-strip", "aria-label": "Choose a date" }), Be = s("h2"), Se = s("div", { class: "org-month-grid" }), P = s("input", { type: "date", value: f, "aria-label": "Calendar date" }), Qe = s("label", { class: "org-date-picker" }, Be, P), Re = (e) => {
    const n = /* @__PURE__ */ new Date(f + "T12:00:00");
    m === "week" ? f = R(f, e * 7) : (n.setDate(1), n.setMonth(n.getMonth() + e), f = M(n)), P.value = f, D();
  }, qe = t === "calendar" ? y.seg([["agenda", "Month"], ["week", "Week"]], m, (e) => {
    m = e, d.nav.go("/calendar/#" + e);
  }, { label: "Calendar view" }) : null;
  if (t === "calendar") {
    const e = s("div", { class: "org-month-nav" }, y.iconBtn("back", { label: "Previous", run: () => Re(-1) }), y.iconBtn("chev", { label: "Next", run: () => Re(1) })), n = s("section", { class: "org-calendar-panel", "aria-label": "Calendar dates" }, s("div", { class: "org-month-head" }, Qe, e), s("div", { class: "org-calendar-controls" }, qe, B("Today", () => {
      f = M(), P.value = f, D();
    })), Ce, Se);
    xe.prepend(n), P.addEventListener("change", () => {
      P.validity.valid && P.value && (f = P.value, D());
    });
  }
  const Xe = s("div", { class: "org-layout" }, xe, L);
  b.replaceChildren(Xe);
  function De() {
    const e = m === "week" ? f : f.slice(0, 8) + "01", n = R(e, -(((/* @__PURE__ */ new Date(e + "T12:00:00")).getDay() + 6) % 7));
    return [n, R(n, m === "week" ? 7 : 42)];
  }
  const ke = (e) => !x || [e.name, e.handle, "@" + e.handle].some((n) => n.toLocaleLowerCase().includes(x.toLocaleLowerCase())), Ue = (e) => !x || E.has(e.id) || e.chatFriend && ke(e.chatFriend) || [e.title, e.preview, e.text, e.description, e.details, e.email, e.organisation, ...(e.checklist || []).map((n) => n.text)].some((n) => n?.toLocaleLowerCase().includes(x.toLocaleLowerCase()));
  function Ve() {
    const e = /* @__PURE__ */ new Map(), n = new Map(p.snapshot().map((r) => [r.id, r]));
    for (const r of p.localForms()) n.set(r.id, r);
    for (const r of n.values()) for (const o of r.links || [])
      o.app === "chats" && k.has(o.id) && !e.has(o.id) && e.set(o.id, r);
    return e;
  }
  const _e = () => {
    const e = [...p.localForms(), ...p.pending()], n = new Map([...E].map((o) => [o, p.view(o)]));
    for (const o of e) n.set(o.id, o);
    if (t === "people" && k.size) {
      const o = Ve();
      for (const i of k.values()) {
        const l = o.get(i.id);
        l ? (n.has(l.id) || ke(i)) && n.set(l.id, { ...l, ...n.get(l.id), chatFriend: i }) : ke(i) && n.set("chat:" + i.id, { id: "chat:" + i.id, title: i.name, chatFriend: i, chatOnly: !0 });
      }
    }
    let r = [...n.values()].filter((o) => o && !o.deleted && Ue(o));
    if (t === "calendar") {
      const [o, i] = De();
      r = r.filter((l) => ie(l, o, i)).concat(F.filter((l) => ie(l, o, i) && Ue(l))), r.sort((l, u) => le(l).localeCompare(le(u)) || (l.start || 0) - (u.start || 0));
    } else t === "people" ? r.sort((o, i) => o.title.localeCompare(i.title)) : r.sort((o, i) => i.updatedAt - o.updatedAt);
    return t === "notes" && G === "lists" ? r.filter((o) => (o.checkCount ?? o.checklist?.length ?? 0) > 0) : r;
  };
  function je() {
    d.header.set({ title: _[t], back: { label: ["item", "new", "friend"].includes(N?.key) ? "Back to " + (t === "people" ? "Contacts" : _[t]) : "Back" }, line: "", crumb: { text: "InFlite", app: t }, sections: null, section: m, acts: t === "calendar" ? [{ icon: "settings", label: "Connected calendars", run: () => d.workspace?.life?.calendars() }] : t === "people" ? [{ icon: "more", label: "Contacts actions", run: () => {
      const e = s("div", { class: "org" }, B("Import contacts", () => (n.now(), We()))), n = d.sheet.open({ sheet: "contacts-actions", title: "Contacts", body: e });
    } }] : [] });
  }
  function Y(e, n) {
    return (/* @__PURE__ */ new Date(e + "T12:00:00")).toLocaleDateString([], n);
  }
  function Fe(e) {
    const n = JSON.stringify([f, m, e.map((l) => [l.id, l.start, l.end, l.startDate, l.endDate])]);
    if (Ne === n) return;
    Ne = n, Be.textContent = Y(f, { month: "long", year: "numeric" }), Ce.hidden = m !== "week", Se.hidden = m === "week";
    const r = b.contains(document.activeElement) ? document.activeElement?.dataset.date : null, [o] = De(), i = m === "week" ? Ce : Se;
    if (i.replaceChildren(), m !== "week") for (let l = 0; l < 7; l++) i.append(s("span", { class: "org-weekday", text: Y(R("2026-11-16", l), { weekday: "short" }) }));
    for (let l = 0; l < (m === "week" ? 7 : 42); l++) {
      const u = R(o, l), T = e.filter((c) => ie(c, u, R(u, 1))).length, a = s("button", { type: "button", class: "org-date", data: { date: u, outside: u.slice(0, 7) !== f.slice(0, 7), today: u === M() }, "aria-current": f === u ? "date" : null, "aria-label": Y(u, { weekday: "long", day: "numeric", month: "long" }) + " \xB7 " + T + " items", on: { click: () => {
        f = u, P.value = u, D();
      } } }, m === "week" ? s("span", { text: Y(u, { weekday: "short" }) }) : null, s("strong", { text: (/* @__PURE__ */ new Date(u + "T12:00:00")).getDate() }), s("small", { class: T ? "org-date-dot" : "", "aria-hidden": !0 }));
      i.append(a);
    }
    r && i.querySelector('[data-date="' + CSS.escape(r) + '"]')?.focus({ preventScroll: !0 });
  }
  function S() {
    if (!h()) return;
    const e = V.contains(document.activeElement) ? document.activeElement?.closest("[data-record]")?.dataset.record : null;
    ye.textContent = J || (C && !q ? "Opening\u2026" : p.pending().some((a) => a.state === "conflict") ? "A change needs review. Open the marked item." : p.ready() ? "" : "Private device storage is unavailable. Editing is paused."), ye.dataset.tone = J ? "error" : "", ve.hidden = !z, ve.disabled = C, se.hidden = !J, se.disabled = C;
    const n = _e();
    let r = n;
    if (t === "calendar") {
      Fe(n);
      const a = M(new Date(Number(f.slice(0, 4)), Number(f.slice(5, 7)), 1));
      r = n.filter((c) => ie(c, f, m === "week" ? R(f, 1) : a)), Ie.firstChild.textContent = m === "week" ? Y(f, { weekday: "long", day: "numeric", month: "short" }) : "Upcoming";
    }
    Oe.textContent = r.length ? r.length + (z ? "+" : "") + " " + (t === "notes" ? r.length === 1 ? "note" : "notes" : t === "people" ? r.length === 1 ? "person" : "people" : r.length === 1 ? "item" : "items") : "";
    const o = q && !C && !x && !k.size && !p.snapshot().some((a) => !a.deleted) && !p.localForms().length, i = t !== "calendar" && !r.length && (o || !q && C);
    if (be.hidden = i, re.hidden = i, oe && (oe.hidden = i), t !== "calendar") {
      const a = JSON.stringify([x, O, $, G, C, q, r.map((c) => [c.id, c.version, c.title, c.updatedAt, c.pending, c.state, c.formDraft, c.matchPreview, c.preview, c.checkCount, c.doneCount, c.text, c.checklist, c.organisation, c.email, c.phone, c.chatFriend, c.chatOnly])]);
      if (a === Pe) return;
      Pe = a;
    }
    const l = V.cloneNode(!1);
    let u = "", T = l;
    if (!r.length && !C) {
      const a = !x && t !== "calendar" && (t !== "notes" || G === "all"), c = s("section", { class: a ? "org-welcome" : "org-empty" });
      if (a) {
        const v = s("div", { class: "org-welcome-art", "aria-hidden": !0 }, t === "notes" ? s("div", { class: "org-paper org-paper-back" }) : s("div", { class: "org-portrait org-portrait-back" }, y.avatar("M")), t === "notes" ? s("div", { class: "org-paper" }, s("span", { class: "org-paper-mark" }, y.icon("file")), s("i"), s("i"), s("i")) : s("div", { class: "org-portrait" }, y.avatar("R")), s("span", { class: "org-art-badge" }, y.icon(t === "notes" ? "plus" : "person")));
        c.append(v, s("h2", { text: t === "notes" ? "No notes yet" : "No contacts yet" }), s("p", { text: t === "notes" ? "Start writing or make a checklist." : "Add someone, or bring your contacts with you." }), B(Me, me, !0)), t === "notes" ? c.append(B("Start a checklist", () => H({ title: "Untitled checklist", text: "", checklist: [{ id: Te(), text: "", done: !1 }], links: [] }))) : c.append(B("Import contacts", () => We()));
      } else c.append(...[s("span", { class: "org-empty-icon" }, y.icon(t === "notes" ? "file" : t === "people" ? "person" : "calendar")), s("h3", { text: x ? "No results" : t === "notes" ? "No checklists yet" : "Nothing scheduled" }), s("p", { text: x ? "Try another name or title." : t === "notes" ? "Turn your next note into a list." : m === "week" ? "Nothing scheduled for this day." : "Nothing else scheduled this month." }), t === "notes" ? B("Start a checklist", () => H({ title: "Untitled checklist", text: "", checklist: [{ id: Te(), text: "", done: !1 }], links: [] })) : null].filter(Boolean));
      l.append(c);
    }
    for (const a of r) {
      const c = t === "calendar" ? le(a) < f ? f : le(a) : t === "people" ? (a.title.trim()[0] || "#").toLocaleUpperCase() : $ === "list" ? M(a.updatedAt || Date.now()) === M() ? "Today" : M(a.updatedAt || Date.now()) === R(M(), -1) ? "Yesterday" : "Earlier" : "";
      c && c !== u && (u = c, l.append(s("h3", { class: "org-day-label", text: t === "calendar" ? Y(u, { weekday: "long", day: "numeric", month: "long" }) : u })), T = s("div", { class: "org-record-group" }), l.append(T));
      const v = s("button", { type: "button", class: "org-record", data: { record: a.id }, "aria-current": O === a.id ? "true" : null, on: { click: ne(() => a.chatOnly ? tt(a.chatFriend.id) : a.source ? at(a) : W(a.id)) } }), Q = s("span", { class: "org-record-copy" }, s("strong", { text: a.title }));
      if (t === "calendar") {
        const K = a.ride ? "To plan" : a.allDay ? a.source ? "Date only" : "All day" : new Date(a.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        v.append(s("span", { class: "org-event-time" }, s("strong", { text: K }), !a.allDay && a.end - a.start > 6e4 ? s("small", { text: new Date(a.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }) : null));
        const X = a.source ? a.ride ? "Fitness \xB7 choose a time" : a.label : a.links?.length ? a.links.length + " linked " + (a.links.length === 1 ? "item" : "items") : "";
        X && Q.append(s("span", { class: "org-muted", text: X })), v.dataset.source = a.source?.app || "calendar";
      } else if (t === "notes") {
        v.append(s("span", { class: "org-note-symbol" }, y.icon(a.checkCount ?? a.checklist?.length ?? 0 ? "check" : "file")));
        const K = (a.matchPreview ?? a.preview ?? a.text ?? "").trim();
        Q.append(s("span", { class: "org-note-preview org-muted", text: K || "No additional text" }));
        const X = a.checkCount ?? a.checklist?.length ?? 0, ct = a.doneCount ?? a.checklist?.filter((dt) => dt.done).length ?? 0;
        Q.append(s("span", { class: "org-note-meta" }, s("span", { text: a.updatedAt ? new Date(a.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" }) : "Just now" }), X ? s("span", { text: ct + " / " + X + " checked" }) : null));
      } else {
        v.append(s("span", { class: "org-record-avatar" }, y.avatar(a.title)));
        const K = a.organisation || a.email || a.phone || (a.chatFriend?.handle && a.title !== "@" + a.chatFriend.handle ? "@" + a.chatFriend.handle : "");
        Q.append(s("span", { class: "org-muted", text: a.chatFriend ? [K, "Chat friend"].filter(Boolean).join(" \xB7 ") : K || "Contact" }));
      }
      v.append(Q), t !== "notes" && v.append(y.icon("chev")), a.formDraft && v.append(s("span", { class: "org-pending", text: "Draft" })), a.pending && v.append(s("span", { class: "org-pending", text: a.state === "conflict" ? "Review" : a.state === "failed" ? "Retry" : "Saving" })), T.append(v);
    }
    (t === "calendar" || !V.isEqualNode(l)) && V.replaceChildren(...l.childNodes), e && document.activeElement?.dataset.record !== e && V.querySelector('[data-record="' + CSS.escape(e) + '"]')?.focus({ preventScroll: !0 }), g?.status();
  }
  function et(e, n, r) {
    if (!(!h() || !w)) {
      pe = n, fe = !!r, k.clear();
      for (const o of e) k.set(o.id, o);
      Z.hidden = !["locked", "signin", "key", "unavailable"].includes(n), Z.replaceChildren(s("a", { href: "/chats/#friends", text: n === "locked" ? "Unlock Chats to see friends" : "Open Chats to see friends" })), S(), $e(), g?.refreshFriend();
    }
  }
  function ze() {
    te?.(), te = null, k.clear(), pe = "", fe = !1, Z && (Z.hidden = !0), g?.refreshFriend(), U && (U = null, L.replaceChildren());
  }
  function tt(e) {
    !k.has(e) || !w || (he(), d.nav.go(d.nav.href("friend", e)));
  }
  const Le = () => Promise.all([import("./editor.js"), import("/roof/modules.js").then((e) => e.loadStyles(new URL("./editor.css", import.meta.url).pathname))]).then(([e]) => e);
  async function Je(e) {
    const n = ++A;
    if (await g?.flush(), !h() || !w || N !== e || n !== A) return;
    g?.destroy(), g = null, O = "chat:" + e.arg, L.hidden = !1, b.dataset.detail = "true", L.replaceChildren(s("p", { role: "status", text: "Opening contact\u2026" }));
    const r = U = { route: e, update: null }, o = () => h() && w && N === e && U === r;
    S();
    try {
      const { openFriendProfile: i } = await Le();
      if (!o()) return;
      r.update = i(d, { detail: L, id: e.arg, current: o, store: p, go: W, findContact: () => Ve().get(e.arg)?.id }), $e();
    } catch (i) {
      U === r && N === e && w && h() && L.replaceChildren(y.error({ title: "This contact couldn\u2019t open", body: i.message, acts: [{ label: "Try again", run: ne(() => Je(e)) }] }));
    }
  }
  function $e() {
    const e = U;
    e?.update?.(k.get(e.route.arg), pe, fe);
  }
  async function We() {
    const [e] = await Promise.all([import("./import.js"), import("/roof/modules.js").then((n) => n.loadStyles(new URL("./editor.css", import.meta.url).pathname))]);
    h() && w && e.openImport({ F: d, store: p, onImported: () => D() });
  }
  async function D(e = !1) {
    if (!h()) return;
    const n = ++Ee, r = t === "calendar" ? De() : null, o = r && JSON.stringify([x, r]);
    ee?.abort();
    const i = ee = new AbortController(), l = () => h() && !i.signal.aborted && n === Ee, u = !e && I.get(o);
    u && Date.now() - u.at < 6e4 && (E = new Set(u.ids), z = u.cursor, F = u.external, q = !0), C = !0, J = "", S();
    const T = r ? import("./connected.js").then(({ calendarSources: a }) => {
      if (!l() || !w) return null;
      const c = Date.now() - Ae > 15 * 6e4;
      return Ae = Date.now(), a(d, r, { current: () => w && l(), refresh: c, onRefresh: () => {
        l() && D();
      } });
    }).then((a) => ({ rows: a }), (a) => ({ error: a })) : null;
    try {
      const a = await p.list({ q: x, cursor: e ? z : null, range: r, signal: i.signal });
      if (!l() || !a) return;
      e || (E = /* @__PURE__ */ new Set());
      for (const c of a.records) E.add(c.id);
      if (z = a.cursor, q = !0, C = !1, S(), T) {
        const c = await T;
        if (!l()) return;
        if (c.error) throw c.error;
        c.rows && (F = c.rows), I.delete(o), I.set(o, { ids: [...E], cursor: z, external: F, at: Date.now() }), I.size > 4 && I.delete(I.keys().next().value);
      }
    } catch (a) {
      l() && (J = navigator.onLine === !1 ? "Offline \xB7 your pending changes are kept on this device." : a.message);
    } finally {
      l() && (C = !1, S());
    }
  }
  async function Ye(e, { initial: n, chat: r } = {}) {
    const o = ++A;
    if (!(O === e && g && !r)) {
      try {
        await g?.flush();
      } catch (i) {
        h() && w && o === A && (d.toast(i.message), g && W(O, null, !0));
        return;
      }
      if (!(!h() || o !== A)) {
        g?.destroy(), g = null, O = e, L.hidden = !1, b.dataset.detail = "true", L.replaceChildren(s("p", { role: "status", text: "Opening\u2026" }));
        try {
          const [i, l] = await Promise.all([Le(), n ? Promise.resolve(n) : p.get(e)]);
          if (!h() || o !== A) return;
          if (r && !k.has(r.id)) {
            ge();
            return;
          }
          g = i.createEditor({ F: d, kind: t, id: e, value: l, store: p, detail: L, go: W, home: ge, date: f, chat: r, friendFor: (u) => k.get(u), onSaved: () => {
            E.add(e), S();
          }, exportValue: nt, linkPicker: () => import("./links.js").then((u) => u.chooseLink(d, t)), prepareInvitation: st }), S();
        } catch (i) {
          h() && o === A && L.replaceChildren(y.error({ title: "This item could not open", body: i.message, acts: [{ label: "Try again", run: () => {
            O = null, Ye(e, { initial: n, chat: r });
          } }] }));
        }
      }
    }
  }
  async function H(e, { persist: n = t === "notes", current: r = () => h() && w } = {}) {
    if (!r()) return !1;
    if (!p.ready()) throw Error("Enable private device storage before creating an item.");
    const o = Te(), i = e || { title: t === "notes" ? "Untitled note" : "", links: [], ...t === "notes" ? { text: "", checklist: [] } : t === "people" ? { email: "", phone: "", organisation: "", details: "" } : { description: "", allDay: !1, start: (/* @__PURE__ */ new Date(f + "T09:00:00")).getTime(), end: (/* @__PURE__ */ new Date(f + "T10:00:00")).getTime(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } };
    return n && await p.save(o, i, { version: 0 }), r() && W(o, { initial: { id: o, kind: t, ...i, version: 0 } }, !0), !0;
  }
  async function at(e) {
    const { openCalendarSource: n } = await import("./connected.js");
    h() && w && n(d, e, { create: H });
  }
  async function nt(e) {
    const n = await import("./actions.js");
    if (h() && w) return n.exportValue(d, t, e);
  }
  async function st(e) {
    const n = await import("./actions.js");
    if (h() && w) return n.prepareInvitation(d, e);
  }
  const rt = () => {
    d.workspace?.changed();
    for (const e of p.snapshot()) !E.has(e.id) && e.updatedAt > Date.now() - 3e3 && E.add(e.id);
    S();
  };
  p.subscribe(rt), we.addEventListener("input", () => {
    clearTimeout(ue), ue = setTimeout(() => {
      x = we.value.trim(), D();
    }, 240);
  });
  const Ke = (e) => ({ id: t + ":" + e.id, app: t, name: e.title + (t === "calendar" ? ".ics" : ".txt"), mime: t === "calendar" ? "text/calendar" : "text/plain", category: "document", objectId: e.id, intent: "open", downloadIntent: "download", modifiedAt: e.updatedAt }), ot = d.workspace?.provide({
    snapshot: () => ({ status: J ? "error" : "ready", availability: { local: p.ready(), pending: p.pending().length, saving: p.pending().some((e) => e.state === "saving"), draft: !!g?.dirty() || p.localForms().length > 0, error: p.pending().some((e) => ["failed", "conflict"].includes(e.state)) }, actions: [{ id: "new", label: t === "calendar" ? "New event" : t === "notes" ? "New note" : "Add person", enabled: p.ready() }], files: p.snapshot().filter((e) => !e.deleted).map(Ke) }),
    async run(e, n, r = {}) {
      const o = () => h() && w && d.workspace.active() && !r.signal?.aborted && r.current?.() !== !1;
      if (!o()) return { ok: !1 };
      if (e === "handoff") {
        const i = d.workspace.handoffs?.take(n);
        if (!i || !["notes", "calendar"].includes(t) || i.kind !== (t === "notes" ? "note-draft" : "event-draft")) return { ok: !1 };
        const { openAtlasDraft: l } = await Le();
        if (!o()) return { ok: !1, cancelled: !0 };
        const u = N, a = l(d, t, i, { current: () => h() && w && N === u && d.workspace.active(), create: async (c, v) => (await g?.flush(), v() ? H(c, { persist: !0, current: v }) : !1) });
        return { ok: !!a, pending: !!a };
      }
      if (e === "new")
        return me(), { ok: !0 };
      if (!/^[a-f0-9]{32}$/.test(n || "")) return { ok: !1 };
      if (e === "open")
        return W(n), { ok: !0 };
      if (e === "download") {
        const [{ downloadValue: i }, l] = await Promise.all([import("./actions.js"), p.get(n)]);
        if (o()) return i(d, b, t, l);
      }
      return { ok: !1 };
    },
    async search(e, n = {}) {
      const r = await p.list({ q: e });
      return h() && !n.signal?.aborted && (!n.current || n.current()) ? { status: "ready", entries: r.records.slice(0, 8).map((o) => ({ title: o.title, sub: o.matchPreview || o.preview || _[t], path: "/" + t + "/#item=" + o.id })) } : { status: "error", entries: [] };
    },
    async files({ query: e = "", current: n = () => !0 } = {}) {
      const r = await p.list({ q: e });
      return h() && n() ? { status: "ready", more: !!r.cursor, files: r.records.map(Ke) } : { status: "error", files: [] };
    }
  }), lt = (e) => {
    h() && e.detail?.owner === (d.session.view?.user?.id || d.session.user?.id) && e.detail?.kind === t && (I.clear(), w && D());
  };
  window.addEventListener("inflite:organise-change", lt, { signal: j });
  const it = () => {
    w && document.visibilityState === "visible" && D();
  };
  document.addEventListener("visibilitychange", it, { signal: j });
  const Ge = () => {
    ee?.abort(), I.clear(), clearTimeout(ue), ze(), g?.destroy(), ot?.(), b.replaceChildren();
  };
  return j.addEventListener("abort", Ge, { once: !0 }), {
    show(e) {
      const n = !!b.dataset.detail;
      w = !0, N = e, U = null;
      const r = ae?.id === e.arg ? ae : void 0;
      if (ae = null, t === "people" && !te && (te = d.watchChatFriends?.(et)), t === "calendar" && e.key === "date" && /^\d{4}-\d{2}-\d{2}$/.test(e.arg || "") && (f = e.arg, P.value = f, m = "week"), ["item", "new"].includes(e.key) || (m = e.section || m), qe?.set(m), je(), (!q && !C || t === "calendar") && D(), e.key === "new") {
        H().catch((l) => d.toast(l.message));
        return;
      }
      if (e.key === "item" && /^[a-f0-9]{32}$/.test(e.arg || "")) {
        Ye(e.arg, r);
        return;
      }
      if (t === "people" && e.key === "friend" && /^[\w-]{1,40}$/.test(e.arg || "")) {
        ne(() => Je(e))();
        return;
      }
      const o = ++A, i = g;
      Promise.resolve(i?.flush()).then(() => {
        !h() || o !== A || !w || N !== e || (i?.destroy(), g = null, O = null, L.hidden = !0, delete b.dataset.detail, S(), n && ce !== null && (scrollTo(0, ce), de && V.querySelector('[data-record="' + CSS.escape(de) + '"]')?.focus({ preventScroll: !0 })));
      }).catch((l) => {
        h() && d.toast(l.message);
      });
    },
    hide() {
      w = !1, ee?.abort(), C = !1, ze(), t === "people" && S(), g?.flush().catch((e) => {
        h() && d.toast(e.message);
      });
    },
    back() {
      return g ? (g.close(), !0) : N?.key === "friend" ? (ge(), !0) : !1;
    },
    busy: () => !!g?.dirty() || p.busy(),
    flush: async () => (await g?.flush(), p.flush()),
    sendable: () => null,
    workspace: () => null,
    unmount: Ge
  };
}
export {
  mt as mountApp
};
