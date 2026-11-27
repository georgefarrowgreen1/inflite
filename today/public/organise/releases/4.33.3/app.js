import { createStore as ft } from "./store.js";
import { operationId as Ne } from "/roof/system-client.js";
import { localDay as P, addDays as R, eventDay as ce, overlaps as de } from "./model.js";
const j = { calendar: "Calendar", notes: "Notes", people: "People" }, ht = { calendar: [["week", "Week"], ["agenda", "Month"]], notes: [["all", "All notes"]], people: [["contacts", "Contacts"]] };
async function yt(x, d, a) {
  const w = d.ui, s = w.el, p = await (d.workspace?.organiseStore?.(a) || ft(d, a)), F = d.signal, Qe = d.session.view?.user?.id || d.session.user?.id, m = () => !F.aborted && (d.session.view?.user?.id || d.session.user?.id) === Qe;
  let ue = null, pe = null, Ae = "", E = null, y = !1, B = !1, Pe = 0, C = "", z = null, N = /* @__PURE__ */ new Set(), h = null, M = null, G = 0, S = !1, J = "", f = P(), g = ht[a][0][0], fe = 0, ee = [], Z = "all", $ = "list", Me = 0;
  const L = /* @__PURE__ */ new Map(), O = /* @__PURE__ */ new Map();
  let te = null, Oe = "", ae = null, he = "", ge = !1, q = null, ne = null;
  x.classList.add("org"), x.dataset.organise = a, x.dataset.notesView = $;
  const re = (e) => () => {
    try {
      Promise.resolve(e()).catch((t) => {
        m() && d.toast(t.message);
      });
    } catch (t) {
      m() && d.toast(t.message);
    }
  }, I = (e, t, r = !1) => w.btn(e, { primary: r, run: re(t) }), me = () => {
    x.dataset.detail || (ue = scrollY, pe = document.activeElement?.closest("[data-record]")?.dataset.record || null);
  }, W = (e, t, r = !1) => {
    me(), ne = t ? { id: e, ...t } : null, d.nav.go("/" + a + "/#item=" + e, { replace: r });
  }, we = () => d.nav.go("/" + a + "/#" + g, { replace: !0, kind: "pop" }), ye = () => {
    me(), d.nav.go("/" + a + "/#new");
  }, U = (e, t) => m() && y && E === e && t === G;
  function se(e, t, r) {
    U(e, t) && (d.toast(r.message), h && W(M, null, !0));
  }
  const Ie = a === "calendar" ? "New event" : a === "notes" ? "New note" : "Add person", ve = s("input", { type: "search", class: "org-search", maxlength: 160, placeholder: a === "people" ? "Search contacts" : a === "notes" ? "Search notes" : "Search events", "aria-label": "Search " + j[a] }), be = s("p", { class: "org-status", role: "status" }), V = s("div", { class: "org-list" }), T = s("section", { class: "org-detail", hidden: !0, "aria-label": j[a] + " editor" }), xe = I("Show more", () => k(!0)), oe = I("Try again", () => k()), Re = s("span", { class: "org-library-count" }), Xe = w.btn(Ie, { icon: "plus", primary: !0, run: ye }), Be = s("div", { class: "org-library-caption" }, a === "calendar" ? s("h2", { text: "Schedule" }) : null, Re), Ce = s("div", { class: "org-library-head" }, Be, Xe), le = s("label", { class: "org-search-box" }, w.icon("search"), ve), ie = a === "notes" ? s("div", { class: "org-library-options" }, w.seg([["all", "All notes"], ["lists", "Checklists"]], Z, (e) => {
    Z = e, D();
  }, { label: "Notes collection" }), w.iconBtn("grid", { label: "Switch notes layout", run: () => {
    $ = $ === "list" ? "grid" : "list", x.dataset.notesView = $, D();
  } })) : null, H = a === "people" ? s("p", { class: "org-muted", hidden: !0 }) : null, Se = s("section", { class: "org-browser" }, Ce, le, be, oe, H, V, xe);
  oe.hidden = !0, Ce.hidden = le.hidden = a !== "calendar", ie && Se.insertBefore(ie, le);
  const De = s("nav", { class: "org-week-strip", "aria-label": "Choose a date" }), qe = s("h2"), ke = s("div", { class: "org-month-grid" }), A = s("input", { type: "date", value: f, "aria-label": "Calendar date" }), _e = s("label", { class: "org-date-picker" }, qe, A), Ue = (e) => {
    const t = /* @__PURE__ */ new Date(f + "T12:00:00");
    g === "week" ? f = R(f, e * 7) : (t.setDate(1), t.setMonth(t.getMonth() + e), f = P(t)), A.value = f, k();
  }, Ve = a === "calendar" ? w.seg([["agenda", "Month"], ["week", "Week"]], g, (e) => {
    g = e, d.nav.go("/calendar/#" + e);
  }, { label: "Calendar view" }) : null;
  if (a === "calendar") {
    const e = s("div", { class: "org-month-nav" }, w.iconBtn("back", { label: "Previous", run: () => Ue(-1) }), w.iconBtn("chev", { label: "Next", run: () => Ue(1) })), t = s("section", { class: "org-calendar-panel", "aria-label": "Calendar dates" }, s("div", { class: "org-month-head" }, _e, e), s("div", { class: "org-calendar-controls" }, Ve, I("Today", () => {
      f = P(), A.value = f, k();
    })), De, ke);
    Se.prepend(t), A.addEventListener("change", () => {
      A.validity.valid && A.value && (f = A.value, k());
    });
  }
  const je = s("div", { class: "org-layout" }, Se, T);
  x.replaceChildren(je);
  function Le() {
    const e = g === "week" ? f : f.slice(0, 8) + "01", t = R(e, -(((/* @__PURE__ */ new Date(e + "T12:00:00")).getDay() + 6) % 7));
    return [t, R(t, g === "week" ? 7 : 42)];
  }
  const Te = (e) => !C || [e.name, e.handle, "@" + e.handle].some((t) => t.toLocaleLowerCase().includes(C.toLocaleLowerCase())), ze = (e) => !C || N.has(e.id) || e.chatFriend && Te(e.chatFriend) || [e.title, e.preview, e.text, e.description, e.details, e.email, e.organisation, ...(e.checklist || []).map((t) => t.text)].some((t) => t?.toLocaleLowerCase().includes(C.toLocaleLowerCase()));
  function Je() {
    const e = /* @__PURE__ */ new Map(), t = new Map(p.snapshot().map((r) => [r.id, r]));
    for (const r of p.localForms()) t.set(r.id, r);
    for (const r of t.values()) for (const o of r.links || [])
      o.app === "chats" && L.has(o.id) && !e.has(o.id) && e.set(o.id, r);
    return e;
  }
  const Fe = () => {
    const e = [...p.localForms(), ...p.pending()], t = new Map([...N].map((o) => [o, p.view(o)]));
    for (const o of e) t.set(o.id, o);
    if (a === "people" && L.size) {
      const o = Je();
      for (const i of L.values()) {
        const l = o.get(i.id);
        l ? (t.has(l.id) || Te(i)) && t.set(l.id, { ...l, ...t.get(l.id), chatFriend: i }) : Te(i) && t.set("chat:" + i.id, { id: "chat:" + i.id, title: i.name, chatFriend: i, chatOnly: !0 });
      }
    }
    let r = [...t.values()].filter((o) => o && !o.deleted && ze(o));
    if (a === "calendar") {
      const [o, i] = Le();
      r = r.filter((l) => de(l, o, i)).concat(ee.filter((l) => de(l, o, i) && ze(l))), r.sort((l, u) => ce(l).localeCompare(ce(u)) || (l.start || 0) - (u.start || 0));
    } else a === "people" ? r.sort((o, i) => o.title.localeCompare(i.title)) : r.sort((o, i) => i.updatedAt - o.updatedAt);
    return a === "notes" && Z === "lists" ? r.filter((o) => (o.checkCount ?? o.checklist?.length ?? 0) > 0) : r;
  };
  function et() {
    d.header.set({ title: j[a], back: { label: ["item", "new", "friend"].includes(E?.key) ? "Back to " + (a === "people" ? "Contacts" : j[a]) : "Back" }, line: "", crumb: { text: "InFlite", app: a }, sections: null, section: g, acts: a === "calendar" ? [{ icon: "settings", label: "Connected calendars", run: () => d.workspace?.life?.calendars() }] : a === "people" ? [{ icon: "more", label: "Contacts actions", run: () => {
      const e = s("div", { class: "org" }, I("Import contacts", () => (t.now(), Ke()))), t = d.sheet.open({ sheet: "contacts-actions", title: "Contacts", body: e });
    } }] : [] });
  }
  function Y(e, t) {
    return (/* @__PURE__ */ new Date(e + "T12:00:00")).toLocaleDateString([], t);
  }
  function tt(e) {
    const t = JSON.stringify([f, g, e.map((l) => [l.id, l.start, l.end, l.startDate, l.endDate])]);
    if (Ae === t) return;
    Ae = t, qe.textContent = Y(f, { month: "long", year: "numeric" }), De.hidden = g !== "week", ke.hidden = g === "week";
    const r = x.contains(document.activeElement) ? document.activeElement?.dataset.date : null, [o] = Le(), i = g === "week" ? De : ke;
    if (i.replaceChildren(), g !== "week") for (let l = 0; l < 7; l++) i.append(s("span", { class: "org-weekday", text: Y(R("2026-11-16", l), { weekday: "short" }) }));
    for (let l = 0; l < (g === "week" ? 7 : 42); l++) {
      const u = R(o, l), v = e.filter((c) => de(c, u, R(u, 1))).length, n = s("button", { type: "button", class: "org-date", data: { date: u, outside: u.slice(0, 7) !== f.slice(0, 7), today: u === P() }, "aria-current": f === u ? "date" : null, "aria-label": Y(u, { weekday: "long", day: "numeric", month: "long" }) + " \xB7 " + v + " items", on: { click: () => {
        f = u, A.value = u, k();
      } } }, g === "week" ? s("span", { text: Y(u, { weekday: "short" }) }) : null, s("strong", { text: (/* @__PURE__ */ new Date(u + "T12:00:00")).getDate() }), s("small", { class: v ? "org-date-dot" : "", "aria-hidden": !0 }));
      i.append(n);
    }
    r && i.querySelector('[data-date="' + CSS.escape(r) + '"]')?.focus({ preventScroll: !0 });
  }
  function D() {
    if (!m()) return;
    const e = V.contains(document.activeElement) ? document.activeElement?.closest("[data-record]")?.dataset.record : null;
    be.textContent = J || (S && !B ? "Opening\u2026" : p.pending().some((n) => n.state === "conflict") ? "A change needs review. Open the marked item." : p.ready() ? "" : "Private device storage is unavailable. Editing is paused."), be.dataset.tone = J ? "error" : "", xe.hidden = !z, xe.disabled = S, oe.hidden = !J, oe.disabled = S;
    const t = Fe();
    let r = t;
    if (a === "calendar") {
      tt(t);
      const n = P(new Date(Number(f.slice(0, 4)), Number(f.slice(5, 7)), 1));
      r = t.filter((c) => de(c, f, g === "week" ? R(f, 1) : n)), Be.firstChild.textContent = g === "week" ? Y(f, { weekday: "long", day: "numeric", month: "short" }) : "Upcoming";
    }
    Re.textContent = r.length ? r.length + (z ? "+" : "") + " " + (a === "notes" ? r.length === 1 ? "note" : "notes" : a === "people" ? r.length === 1 ? "person" : "people" : r.length === 1 ? "item" : "items") : "";
    const o = B && !S && !C && !L.size && !p.snapshot().some((n) => !n.deleted) && !p.localForms().length, i = a !== "calendar" && !r.length && (o || !B && S);
    if (Ce.hidden = i, le.hidden = i, ie && (ie.hidden = i), a !== "calendar") {
      const n = JSON.stringify([C, M, $, Z, S, B, r.map((c) => [c.id, c.version, c.title, c.updatedAt, c.pending, c.state, c.formDraft, c.matchPreview, c.preview, c.checkCount, c.doneCount, c.text, c.checklist, c.organisation, c.email, c.phone, c.chatFriend, c.chatOnly])]);
      if (n === Oe) {
        h?.status();
        return;
      }
      Oe = n;
    }
    const l = V.cloneNode(!1);
    let u = "", v = l;
    if (!r.length && !S) {
      const n = !C && a !== "calendar" && (a !== "notes" || Z === "all"), c = s("section", { class: n ? "org-welcome" : "org-empty" });
      if (n) {
        const b = s("div", { class: "org-welcome-art", "aria-hidden": !0 }, a === "notes" ? s("div", { class: "org-paper org-paper-back" }) : s("div", { class: "org-portrait org-portrait-back" }, w.avatar("M")), a === "notes" ? s("div", { class: "org-paper" }, s("span", { class: "org-paper-mark" }, w.icon("file")), s("i"), s("i"), s("i")) : s("div", { class: "org-portrait" }, w.avatar("R")), s("span", { class: "org-art-badge" }, w.icon(a === "notes" ? "plus" : "person")));
        c.append(b, s("h2", { text: a === "notes" ? "No notes yet" : "No contacts yet" }), s("p", { text: a === "notes" ? "Start writing or make a checklist." : "Add someone, or bring your contacts with you." }), I(Ie, ye, !0)), a === "notes" ? c.append(I("Start a checklist", () => Q({ title: "Untitled checklist", text: "", checklist: [{ id: Ne(), text: "", done: !1 }], links: [] }))) : c.append(I("Import contacts", () => Ke()));
      } else c.append(...[s("span", { class: "org-empty-icon" }, w.icon(a === "notes" ? "file" : a === "people" ? "person" : "calendar")), s("h3", { text: C ? "No results" : a === "notes" ? "No checklists yet" : "Nothing scheduled" }), s("p", { text: C ? "Try another name or title." : a === "notes" ? "Turn your next note into a list." : g === "week" ? "Nothing scheduled for this day." : "Nothing else scheduled this month." }), a === "notes" ? I("Start a checklist", () => Q({ title: "Untitled checklist", text: "", checklist: [{ id: Ne(), text: "", done: !1 }], links: [] })) : null].filter(Boolean));
      l.append(c);
    }
    for (const n of r) {
      const c = a === "calendar" ? ce(n) < f ? f : ce(n) : a === "people" ? (n.title.trim()[0] || "#").toLocaleUpperCase() : $ === "list" ? P(n.updatedAt || Date.now()) === P() ? "Today" : P(n.updatedAt || Date.now()) === R(P(), -1) ? "Yesterday" : "Earlier" : "";
      c && c !== u && (u = c, l.append(s("h3", { class: "org-day-label", text: a === "calendar" ? Y(u, { weekday: "long", day: "numeric", month: "long" }) : u })), v = s("div", { class: "org-record-group" }), l.append(v));
      const b = s("button", { type: "button", class: "org-record", data: { record: n.id }, "aria-current": M === n.id ? "true" : null, on: { click: re(() => n.chatOnly ? nt(n.chatFriend.id) : n.source ? rt(n) : W(n.id)) } }), X = s("span", { class: "org-record-copy" }, s("strong", { text: n.title }));
      if (a === "calendar") {
        const K = n.ride ? "To plan" : n.allDay ? n.source ? "Date only" : "All day" : new Date(n.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        b.append(s("span", { class: "org-event-time" }, s("strong", { text: K }), !n.allDay && n.end - n.start > 6e4 ? s("small", { text: new Date(n.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }) : null));
        const _ = n.source ? n.ride ? "Fitness \xB7 choose a time" : n.label : n.links?.length ? n.links.length + " linked " + (n.links.length === 1 ? "item" : "items") : "";
        _ && X.append(s("span", { class: "org-muted", text: _ })), b.dataset.source = n.source?.app || "calendar";
      } else if (a === "notes") {
        b.append(s("span", { class: "org-note-symbol" }, w.icon(n.checkCount ?? n.checklist?.length ?? 0 ? "check" : "file")));
        const K = (n.matchPreview ?? n.preview ?? n.text ?? "").trim();
        X.append(s("span", { class: "org-note-preview org-muted", text: K || "No additional text" }));
        const _ = n.checkCount ?? n.checklist?.length ?? 0, ut = n.doneCount ?? n.checklist?.filter((pt) => pt.done).length ?? 0;
        X.append(s("span", { class: "org-note-meta" }, s("span", { text: n.updatedAt ? new Date(n.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" }) : "Just now" }), _ ? s("span", { text: ut + " / " + _ + " checked" }) : null));
      } else {
        b.append(s("span", { class: "org-record-avatar" }, w.avatar(n.title)));
        const K = n.organisation || n.email || n.phone || (n.chatFriend?.handle && n.title !== "@" + n.chatFriend.handle ? "@" + n.chatFriend.handle : "");
        X.append(s("span", { class: "org-muted", text: n.chatFriend ? [K, "Chat friend"].filter(Boolean).join(" \xB7 ") : K || "Contact" }));
      }
      b.append(X), a !== "notes" && b.append(w.icon("chev")), n.formDraft && b.append(s("span", { class: "org-pending", text: "Draft" })), n.pending && b.append(s("span", { class: "org-pending", text: n.state === "conflict" ? "Review" : n.state === "failed" ? "Retry" : "Saving" })), v.append(b);
    }
    (a === "calendar" || !V.isEqualNode(l)) && V.replaceChildren(...l.childNodes), e && document.activeElement?.dataset.record !== e && V.querySelector('[data-record="' + CSS.escape(e) + '"]')?.focus({ preventScroll: !0 }), h?.status();
  }
  function at(e, t, r) {
    if (!(!m() || !y)) {
      he = t, ge = !!r, L.clear();
      for (const o of e) L.set(o.id, o);
      H.hidden = !["locked", "signin", "key", "unavailable"].includes(t), H.replaceChildren(s("a", { href: "/chats/#friends", text: t === "locked" ? "Unlock Chats to see friends" : "Open Chats to see friends" })), D(), Ye(), h?.refreshFriend();
    }
  }
  function $e() {
    ae?.(), ae = null, L.clear(), he = "", ge = !1, H && (H.hidden = !0), h?.refreshFriend(), q && (q = null, T.replaceChildren());
  }
  function nt(e) {
    !L.has(e) || !y || (me(), d.nav.go(d.nav.href("friend", e)));
  }
  const Ee = () => Promise.all([import("./editor.js"), import("/roof/modules.js").then((e) => e.loadStyles(new URL("./editor.css", import.meta.url).pathname))]).then(([e]) => e);
  async function We(e) {
    const t = ++G;
    try {
      await h?.flush();
    } catch (i) {
      se(e, t, i);
      return;
    }
    if (!U(e, t)) return;
    h?.destroy(), h = null, M = "chat:" + e.arg, T.hidden = !1, x.dataset.detail = "true", T.replaceChildren(s("p", { role: "status", text: "Opening contact\u2026" }));
    const r = q = { route: e, update: null }, o = () => m() && y && E === e && q === r;
    D();
    try {
      const { openFriendProfile: i } = await Ee();
      if (!o()) return;
      r.update = i(d, { detail: T, id: e.arg, current: o, store: p, go: W, findContact: () => Je().get(e.arg)?.id }), Ye();
    } catch (i) {
      q === r && E === e && y && m() && T.replaceChildren(w.error({ title: "This contact couldn\u2019t open", body: i.message, acts: [{ label: "Try again", run: re(() => We(e)) }] }));
    }
  }
  function Ye() {
    const e = q;
    e?.update?.(L.get(e.route.arg), he, ge);
  }
  async function Ke() {
    const [e] = await Promise.all([import("./import.js"), import("/roof/modules.js").then((t) => t.loadStyles(new URL("./editor.css", import.meta.url).pathname))]);
    m() && y && e.openImport({ F: d, store: p, onImported: () => k() });
  }
  async function k(e = !1) {
    if (!m()) return;
    const t = ++Pe, r = a === "calendar" ? Le() : null, o = r && JSON.stringify([C, r]);
    te?.abort();
    const i = te = new AbortController(), l = () => m() && !i.signal.aborted && t === Pe, u = !e && O.get(o);
    u && Date.now() - u.at < 6e4 && (N = new Set(u.ids), z = u.cursor, ee = u.external, B = !0), S = !0, J = "", D();
    const v = r ? import("./connected.js").then(({ calendarSources: n }) => {
      if (!l() || !y) return null;
      const c = Date.now() - Me > 15 * 6e4;
      return Me = Date.now(), n(d, r, { current: () => y && l(), refresh: c, onRefresh: () => {
        l() && k();
      } });
    }).then((n) => ({ rows: n }), (n) => ({ error: n })) : null;
    try {
      const n = await p.list({ q: C, cursor: e ? z : null, range: r, signal: i.signal });
      if (!l() || !n) return;
      e || (N = /* @__PURE__ */ new Set());
      for (const c of n.records) N.add(c.id);
      if (z = n.cursor, B = !0, S = !1, D(), v) {
        const c = await v;
        if (!l()) return;
        if (c.error) throw c.error;
        c.rows && (ee = c.rows), O.delete(o), O.set(o, { ids: [...N], cursor: z, external: ee, at: Date.now() }), O.size > 4 && O.delete(O.keys().next().value);
      }
    } catch (n) {
      l() && (J = navigator.onLine === !1 ? "Offline \xB7 your pending changes are kept on this device." : n.message);
    } finally {
      l() && (S = !1, D());
    }
  }
  async function Ge(e, { initial: t, chat: r } = {}) {
    const o = E, i = ++G;
    if (!(M === e && h && !r)) {
      try {
        await h?.flush();
      } catch (l) {
        se(o, i, l);
        return;
      }
      if (U(o, i)) {
        h?.destroy(), h = null, M = e, T.hidden = !1, x.dataset.detail = "true", T.replaceChildren(s("p", { role: "status", text: "Opening\u2026" }));
        try {
          const [l, u] = await Promise.all([Ee(), t ? Promise.resolve(t) : p.get(e)]);
          if (!U(o, i)) return;
          if (r && !L.has(r.id)) {
            we();
            return;
          }
          h = l.createEditor({ F: d, kind: a, id: e, value: u, store: p, detail: T, go: W, home: we, date: f, chat: r, friendFor: (v) => L.get(v), onSaved: () => {
            N.add(e), D();
          }, exportValue: st, linkPicker: () => import("./links.js").then((v) => v.chooseLink(d, a)), prepareInvitation: ot }), D();
        } catch (l) {
          U(o, i) && T.replaceChildren(w.error({ title: "This item could not open", body: l.message, acts: [{ label: "Try again", run: () => {
            M = null, Ge(e, { initial: t, chat: r });
          } }] }));
        }
      }
    }
  }
  async function Q(e, { persist: t = a === "notes", current: r = () => m() && y } = {}) {
    if (!r()) return !1;
    if (!p.ready()) throw Error("Enable private device storage before creating an item.");
    const o = Ne(), i = e || { title: a === "notes" ? "Untitled note" : "", links: [], ...a === "notes" ? { text: "", checklist: [] } : a === "people" ? { email: "", phone: "", organisation: "", details: "" } : { description: "", allDay: !1, start: (/* @__PURE__ */ new Date(f + "T09:00:00")).getTime(), end: (/* @__PURE__ */ new Date(f + "T10:00:00")).getTime(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }, l = t ? await p.save(o, i, { version: 0 }) : { id: o, kind: a, ...i, version: 0 };
    return r() && W(o, { initial: l }, !0), !0;
  }
  async function rt(e) {
    const { openCalendarSource: t } = await import("./connected.js");
    m() && y && t(d, e, { create: Q });
  }
  async function st(e) {
    const t = await import("./actions.js");
    if (m() && y) return t.exportValue(d, a, e);
  }
  async function ot(e) {
    const t = await import("./actions.js");
    if (m() && y) return t.prepareInvitation(d, e);
  }
  const lt = () => {
    d.workspace?.changed();
    for (const e of p.snapshot()) !N.has(e.id) && e.updatedAt > Date.now() - 3e3 && N.add(e.id);
    D();
  };
  p.subscribe(lt), ve.addEventListener("input", () => {
    clearTimeout(fe), fe = setTimeout(() => {
      C = ve.value.trim(), k();
    }, 240);
  });
  const Ze = (e) => ({ id: a + ":" + e.id, app: a, name: e.title + (a === "calendar" ? ".ics" : ".txt"), mime: a === "calendar" ? "text/calendar" : "text/plain", category: "document", objectId: e.id, intent: "open", downloadIntent: "download", modifiedAt: e.updatedAt }), it = d.workspace?.provide({
    snapshot: () => ({ status: J ? "error" : "ready", availability: { local: p.ready(), pending: p.pending().length, saving: p.pending().some((e) => e.state === "saving"), draft: !!h?.dirty() || p.localForms().length > 0, error: p.pending().some((e) => ["failed", "conflict"].includes(e.state)) }, actions: [{ id: "new", label: a === "calendar" ? "New event" : a === "notes" ? "New note" : "Add person", enabled: p.ready() }], files: p.snapshot().filter((e) => !e.deleted).map(Ze) }),
    async run(e, t, r = {}) {
      const o = () => m() && y && d.workspace.active() && !r.signal?.aborted && r.current?.() !== !1;
      if (!o()) return { ok: !1 };
      if (e === "handoff") {
        const i = d.workspace.handoffs?.take(t);
        if (!i || !["notes", "calendar"].includes(a) || i.kind !== (a === "notes" ? "note-draft" : "event-draft")) return { ok: !1 };
        const { openAtlasDraft: l } = await Ee();
        if (!o()) return { ok: !1, cancelled: !0 };
        const u = E, n = l(d, a, i, { current: () => m() && y && E === u && d.workspace.active(), create: async (c, b) => (await h?.flush(), b() ? Q(c, { persist: !0, current: b }) : !1) });
        return { ok: !!n, pending: !!n };
      }
      if (e === "new")
        return ye(), { ok: !0 };
      if (!/^[a-f0-9]{32}$/.test(t || "")) return { ok: !1 };
      if (e === "open")
        return W(t), { ok: !0 };
      if (e === "download") {
        const [{ downloadValue: i }, l] = await Promise.all([import("./actions.js"), p.get(t)]);
        if (o()) return i(d, x, a, l);
      }
      return { ok: !1 };
    },
    async search(e, t = {}) {
      const r = await p.list({ q: e });
      return m() && !t.signal?.aborted && (!t.current || t.current()) ? { status: "ready", entries: r.records.slice(0, 8).map((o) => ({ title: o.title, sub: o.matchPreview || o.preview || j[a], path: "/" + a + "/#item=" + o.id })) } : { status: "error", entries: [] };
    },
    async files({ query: e = "", current: t = () => !0 } = {}) {
      const r = await p.list({ q: e });
      return m() && t() ? { status: "ready", more: !!r.cursor, files: r.records.map(Ze) } : { status: "error", files: [] };
    }
  }), ct = (e) => {
    m() && e.detail?.owner === (d.session.view?.user?.id || d.session.user?.id) && e.detail?.kind === a && (O.clear(), y && k());
  };
  window.addEventListener("inflite:organise-change", ct, { signal: F });
  const dt = () => {
    y && document.visibilityState === "visible" && k();
  };
  document.addEventListener("visibilitychange", dt, { signal: F });
  const He = () => {
    te?.abort(), O.clear(), clearTimeout(fe), $e(), h?.destroy(), it?.(), x.replaceChildren();
  };
  return F.addEventListener("abort", He, { once: !0 }), {
    show(e) {
      const t = !!x.dataset.detail;
      y = !0, E = e, q = null;
      const r = ne?.id === e.arg ? ne : void 0;
      if (ne = null, a === "people" && !ae && (ae = d.watchChatFriends?.(at)), a === "calendar" && e.key === "date" && /^\d{4}-\d{2}-\d{2}$/.test(e.arg || "") && (f = e.arg, A.value = f, g = "week"), ["item", "new"].includes(e.key) || (g = e.section || g), Ve?.set(g), et(), (!B && !S || a === "calendar") && k(), e.key === "new") {
        const l = ++G, u = () => U(e, l);
        Promise.resolve(h?.flush()).then(() => Q(void 0, { current: u })).catch((v) => se(e, l, v));
        return;
      }
      if (e.key === "item" && /^[a-f0-9]{32}$/.test(e.arg || "")) {
        Ge(e.arg, r);
        return;
      }
      if (a === "people" && e.key === "friend" && /^[\w-]{1,40}$/.test(e.arg || "")) {
        re(() => We(e))();
        return;
      }
      const o = ++G, i = h;
      Promise.resolve(i?.flush()).then(() => {
        U(e, o) && (i?.destroy(), h = null, M = null, T.hidden = !0, delete x.dataset.detail, D(), t && ue !== null && (scrollTo(0, ue), pe && V.querySelector('[data-record="' + CSS.escape(pe) + '"]')?.focus({ preventScroll: !0 })));
      }).catch((l) => se(e, o, l));
    },
    hide() {
      y = !1, te?.abort(), S = !1, $e(), a === "people" && D(), h?.flush().catch((e) => {
        m() && d.toast(e.message);
      });
    },
    back() {
      return h ? (h.close(), !0) : E?.key === "friend" ? (we(), !0) : !1;
    },
    busy: () => !!h?.dirty() || p.busy(),
    flush: async () => (await h?.flush(), p.flush()),
    sendable: () => null,
    workspace: () => null,
    unmount: He
  };
}
export {
  yt as mountApp
};
