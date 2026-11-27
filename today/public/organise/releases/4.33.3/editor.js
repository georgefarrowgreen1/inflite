import { createSystemClient as Be, operationId as Ae } from "/roof/system-client.js";
import { addDays as ae, localDay as Me, localInput as J, parseLocal as ce, zone as X, pathOf as de } from "./model.js";
function Je(o, n, s, { current: i, create: f }) {
  if (!["notes", "calendar"].includes(n) || s?.kind !== (n === "notes" ? "note-draft" : "event-draft") || !i()) return null;
  const { el: h, btn: L } = o.ui, P = o.session.view?.user?.id || o.session.user?.id;
  if (!P || o.signal.aborted) return null;
  let m, g = !1, q = !1;
  const b = () => !g && !o.signal.aborted && (o.session.view?.user?.id || o.session.user?.id) === P && i() && !m?.closed && !m?.el?.classList?.contains("closing"), E = h("form", { class: "org-form" }), p = h("p", { class: "org-status", role: "status" }), t = (l, D, N, z, d = !1) => {
    const Z = h(D === "textarea" ? "textarea" : "input", { ...D === "textarea" ? { rows: n === "notes" ? 10 : 4 } : { type: D }, maxlength: z, required: d, "aria-label": l });
    return Z.value = N ?? "", E.append(h("label", { class: "org-field" }, h("span", { text: l }), Z)), Z;
  }, T = t("Title", "text", s.title, 160, !0), c = t(n === "notes" ? "Note" : "Description", "textarea", n === "notes" ? s.text : s.description, n === "notes" ? 64e3 : 4e3);
  let w, u;
  n === "calendar" && (w = t("Starts", "datetime-local", Number.isFinite(s.start) ? J(s.start) : "", null, !0), u = t("Ends", "datetime-local", Number.isFinite(s.end) ? J(s.end) : "", null, !0), E.append(h("p", { class: "org-muted", text: "Times shown in " + X() + ". Choose the date and time before creating this event." })));
  const A = s.source?.app === "mail" && /^[A-Za-z0-9_-]{1,64}$/.test(s.source.threadId || "") ? [{ app: "mail", id: s.source.threadId }] : [];
  A.length && E.append(h("p", { class: "org-muted", text: "The original Mail conversation will be linked to this " + (n === "notes" ? "note." : "event.") }));
  const y = L("Cancel", { run: () => {
    g = !0, m?.now();
  } }), C = L(n === "notes" ? "Create note" : "Create event", { primary: !0, run: S });
  async function S() {
    if (!(!b() || q)) {
      p.textContent = "";
      try {
        if (!E.checkValidity() || !T.value.trim() || T.value.length > 160 || c.value.length > (n === "notes" ? 64e3 : 4e3))
          throw E.reportValidity(), Error("Check the required fields before creating this " + (n === "notes" ? "note." : "event."));
        const l = { title: T.value.trim(), links: structuredClone(A) };
        if (n === "notes") Object.assign(l, { text: c.value, checklist: [] });
        else {
          const N = Number.isFinite(s.start) && w.value === J(s.start) ? s.start : ce(w.value), z = Number.isFinite(s.end) && u.value === J(s.end) ? s.end : ce(u.value);
          if (z <= N || z - N > 366 * 864e5) throw Error("Choose an end time after the start, within one year.");
          Object.assign(l, { description: c.value, allDay: !1, start: N, end: z, timezone: N === s.start && z === s.end ? s.timezone || X() : X() });
        }
        q = !0, C.disabled = y.disabled = !0, m?.setBusy(!0), await f(l, b) && b() && (g = !0, m.now());
      } catch (l) {
        b() && (p.textContent = l.message);
      } finally {
        q = !1, C.disabled = y.disabled = !1, b() && m?.setBusy(!1);
      }
    }
  }
  E.addEventListener("submit", (l) => {
    l.preventDefault(), S();
  });
  const O = h("section", { class: "org" }, h("p", { class: "org-muted", text: n === "notes" ? "Review the Atlas draft. Creating it adds it to your Notes." : "Review the Atlas draft. Creating it adds an event to your Calendar." }), E, p, h("div", { class: "org-toolbar" }, y, C));
  return m = o.sheet.open({ sheet: "atlas-" + n + "-draft", title: n === "notes" ? "Create a note from Atlas" : "Create an event from Atlas", body: O, focus: T, onClose: () => {
    g = !0;
  } }), m;
}
function Re(o, n, { value: s, handle: i, chat: f, edit: h, saveState: L }) {
  const { avatar: P, btn: m, el: g } = n.ui;
  o.classList.add("org-person");
  const q = g(
    "div",
    { class: "org-person-identity" },
    P(s.title),
    g("div", {}, g("h2", { text: s.title }), L)
  ), b = n.workspace?.handoffs, E = s.email ? "mailto:" + encodeURIComponent(s.email) : "", p = g(
    "div",
    { class: "org-person-actions" },
    f ? m("Message", { icon: "bubble", primary: !0, run: f }) : null,
    E ? m("Email", { icon: "mail", ...b?.can("mail", "text") ? { run: () => b.send("mail", "text", { subject: "Hello " + s.title, text: "", to: s.email }) } : { href: E } }) : null,
    m(h.label, { icon: "pen", primary: !f && !L, run: h.run })
  ), t = [
    ["Email", s.email],
    ["Phone", s.phone ? g("a", { href: "tel:" + encodeURIComponent(s.phone), text: s.phone }) : null],
    ["Organisation", s.organisation],
    ["Chat handle", i && s.title !== "@" + i ? "@" + i : null],
    ["Contact notes", s.details]
  ], T = g(
    "dl",
    { class: "org-person-details", "aria-label": "Contact details" },
    t.filter(([, c]) => c).map(([c, w]) => g("div", {}, g("dt", { text: c }), g("dd", {}, w)))
  );
  o.replaceChildren(q, p, T.childElementCount ? T : g("p", { class: "org-muted org-person-empty", text: "No contact details yet." }));
}
function Ve(o, { detail: n, id: s, current: i, store: f, go: h, findContact: L }) {
  const P = o.ui, m = P.el, g = { id: s }, q = Be(o, { prefix: "/api/organise/" });
  let b;
  async function E(p) {
    const t = L();
    if (t) return t;
    const { records: T } = await q.request("list", { method: "POST", body: { kind: "people", related: { app: "chats", id: s }, limit: 1 }, current: p });
    return T.find((c) => c.links?.some((w) => w.app === "chats" && w.id === s))?.id;
  }
  return (p, t, T) => {
    if (!i()) return;
    const c = p ? JSON.stringify([p.name, p.handle]) : "missing:" + (T ? "loaded" : t);
    if (c === b) return;
    if (b = c, !p) {
      const O = !T && (!t || t === "ready");
      n.replaceChildren(O ? m("p", { role: "status", text: "Opening contact\u2026" }) : P.empty({
        title: t === "locked" ? "Chats is locked" : "Chat friend unavailable",
        body: t === "locked" ? "Unlock Chats to view this profile." : "Open Chats to check your friends.",
        acts: [{ label: "Open Chats", href: "/chats/#friends" }]
      }));
      return;
    }
    const w = m("section", { class: "org-profile" }), u = m("details", { class: "org-extra org-people-extra" }, m("summary", { text: "More actions" })), A = m("p", { class: "org-status", role: "status" }), y = () => i() && n.contains(w);
    let C = !1;
    async function S(O) {
      if (!(!y() || C)) {
        C = !0, w.setAttribute("aria-busy", "true"), A.textContent = "";
        try {
          const l = await E(y);
          if (!y()) return;
          if (l) {
            h(l, null, !0);
            return;
          }
          if (O) {
            const { chooseLink: D } = await import("./links.js");
            if (!y()) return;
            const N = await D(o, "chats", { contactsOnly: !0 });
            N && y() && h(N.id, { chat: g }, !0);
          } else {
            if (!f.ready()) throw Error("Private device storage is unavailable. Try again before adding details.");
            const D = Ae();
            h(D, { chat: g, initial: { id: D, kind: "people", title: p.name, links: [], version: 0 } }, !0);
          }
        } catch (l) {
          y() && (A.textContent = l.message);
        } finally {
          C = !1, w.removeAttribute("aria-busy");
        }
      }
    }
    Re(w, o, {
      value: { title: p.name },
      handle: p.handle,
      edit: { label: "Add details", run: () => S(!1) },
      chat: () => {
        y() && o.nav.go(de({ app: "chats", id: s }));
      }
    }), u.append(m("div", { class: "org-toolbar" }, P.btn("Link to existing contact", { icon: "link", run: () => S(!0) }))), n.replaceChildren(w, A, u);
  };
}
function He({ F: o, kind: n, id: s, value: i, store: f, detail: h, home: L, onSaved: P, exportValue: m, linkPicker: g, prepareInvitation: q, chat: b, friendFor: E }) {
  const p = o.ui, t = p.el, T = o.signal, c = f.editBase(i);
  let w = !1, u = !!i.formDraft, A = !!i.formDraft, y = !1, C = 0, S = 0, O = Promise.resolve(), l = structuredClone(i.links || []), D = structuredClone(i.checklist || []), N = new Map((i.linkedLabels || []).map((e) => [e.app + ":" + e.id, e.unavailable ? "Unavailable " + e.app : e.title || e.app]));
  if (b && !l.some((e) => e.app === "chats" && e.id === b.id)) {
    if (l.length >= 12) throw Error("Remove a linked item before linking this Chat friend.");
    l.push({ app: "chats", id: b.id }), u = !0, A = !1;
  }
  const z = o.session.view?.user?.id || o.session.user?.id, d = () => !w && !T.aborted && (o.session.view?.user?.id || o.session.user?.id) === z, Z = (e) => () => {
    try {
      Promise.resolve(e()).catch((a) => {
        d() && (M.textContent = a.message);
      });
    } catch (a) {
      d() && (M.textContent = a.message);
    }
  }, B = (e, a, r = !1) => p.btn(e, { primary: r, run: Z(a) }), M = t("p", { role: "status", class: "org-status" }), ne = t("span", { class: "org-save-state", role: "status" }), k = t("form", { class: "org-form" }), R = (e, a, r, x, v = !1) => {
    const I = t(a === "textarea" ? "textarea" : "input", { ...a === "textarea" ? { rows: e === "Note" ? 12 : 3 } : { type: a }, maxlength: x, required: v, "aria-label": e });
    return I.value = r ?? "", k.append(t("label", { class: "org-field" }, t("span", { text: e }), I)), I;
  }, U = R(n === "people" ? "Name" : "Title", "text", i.title, 160, !0);
  U.autocomplete = n === "people" ? "name" : "off", U.placeholder = n === "people" ? "Full name" : n === "notes" ? "Title" : "Event title";
  let V, se, ie, pe, oe, j, F, ee, _, $, G = null;
  if (n === "notes" && (V = R("Note", "textarea", i.text || "", 64e3), V.classList.add("org-note-body"), V.placeholder = "Start writing\u2026", G = t("div", { class: "org-checklist" }), k.append(G), ue(), k.append(B("Add checklist item", () => {
    if (D.length >= 200) throw Error("Use up to 200 items.");
    D.push({ id: Ae(), text: "", done: !1 }), ue(), K(), G.lastElementChild?.querySelector("input[type=text]")?.focus();
  }))), n === "people" && (b && k.append(t("p", { class: "org-muted", text: "These details are private to your InFlite account." })), pe = R("Organisation", "text", i.organisation, 160), se = R("Email", "email", i.email, 254), se.autocomplete = "email", ie = R("Phone", "tel", i.phone, 40), ie.autocomplete = "tel", V = R("Contact notes", "textarea", i.details, 4e3)), n === "calendar") {
    oe = R("Description", "textarea", i.description, 4e3), j = t("input", { type: "checkbox", checked: i.allDay, "aria-label": "All-day event" }), k.append(t("label", { class: "org-check" }, j, t("span", { text: "All day" })));
    const e = i.allDay ? i.startDate : Me(i.start), a = i.allDay ? i.endDate : ae(e, 1);
    F = R("Starts", "datetime-local", i.startLocal ?? J(i.start || (/* @__PURE__ */ new Date(e + "T09:00:00")).getTime())), ee = R("Ends", "datetime-local", i.endLocal ?? J(i.end || (/* @__PURE__ */ new Date(e + "T10:00:00")).getTime())), _ = R("First day", "date", i.firstDay ?? e), $ = R("Last day", "date", i.lastDay ?? ae(a, -1)), k.append(oe.closest("label")), k.append(t("p", { class: "org-muted", text: "Times shown in " + X() + ". All-day dates stay on the selected days." }));
    const r = () => {
      F.closest("label").hidden = ee.closest("label").hidden = j.checked, _.closest("label").hidden = $.closest("label").hidden = !j.checked;
    };
    j.addEventListener("change", r), r();
  }
  const Q = t("div", { class: "org-links" });
  k.append(t("div", { class: "org-toolbar" }, t("h3", { text: "Linked items" }), B("Link an item", async () => {
    const e = await g();
    if (!d() || !e) return;
    if (l.length >= 12) throw Error("Link up to twelve items.");
    const { title: a, ...r } = e;
    a && N.set(r.app + ":" + r.id, a), l.some((x) => JSON.stringify(x) === JSON.stringify(r)) || l.push(r), fe(), K();
  })), Q), fe();
  function ue() {
    if (G) {
      G.replaceChildren();
      for (const e of D) {
        const a = t("input", { type: "checkbox", checked: e.done, "aria-label": "Complete checklist item" }), r = t("input", { type: "text", maxlength: 500, "aria-label": "Checklist item" });
        r.value = e.text, a.addEventListener("change", () => {
          e.done = a.checked, K();
        }), r.addEventListener("input", () => {
          e.text = r.value, K();
        }), G.append(t("div", { class: "org-check-row" }, a, r, p.iconBtn("x", { label: "Remove checklist item", run: () => {
          D = D.filter((x) => x !== e), ue(), K();
        } })));
      }
    }
  }
  function fe() {
    Q.replaceChildren(), l.length || Q.append(t("p", { class: "org-muted", text: "Link a file, note, person, event or app source." }));
    for (const e of l) {
      const a = t("span", { text: N.get(e.app + ":" + e.id) || e.app[0].toUpperCase() + e.app.slice(1) }), r = B("Open", () => e.app === "files" ? o.workspace?.openReference(e) : o.nav.go(de(e))), x = p.iconBtn("x", { label: "Remove link to " + e.app, run: () => {
        l = l.filter((v) => v !== e), fe(), K();
      } });
      Q.append(t("div", { class: "org-link" }, p.icon(e.app === "files" ? "file" : "open"), a, r, x));
    }
  }
  function H() {
    const e = { title: U.value.trim(), links: structuredClone(l) };
    if (n === "notes" && Object.assign(e, { text: V.value, checklist: structuredClone(D) }), n === "people" && Object.assign(e, { email: se.value.trim(), phone: ie.value.trim(), organisation: pe.value, details: V.value }), n === "calendar") {
      if (Object.assign(e, { description: oe.value, allDay: j.checked, timezone: X() }), e.allDay) {
        if (!_.value || !$.value || $.value < _.value) throw Error("Check the event dates.");
        e.startDate = _.value, e.endDate = ae($.value, 1);
      } else if (e.start = Number.isFinite(i.start) && F.value === J(i.start) ? i.start : ce(F.value), e.end = Number.isFinite(i.end) && ee.value === J(i.end) ? i.end : ce(ee.value), e.start === i.start && e.end === i.end && (e.timezone = i.timezone || X()), e.end <= e.start) throw Error("The end time must follow the start time.");
    }
    return e;
  }
  function Y() {
    if (!d()) return;
    const e = f.view(s);
    me.hidden = !c.version;
    const a = e?.pending;
    ne.textContent = u ? y ? "Changes kept in this tab" : n === "notes" ? "Saving on this device\u2026" : A ? "Draft kept on this device" : "Unsaved changes" : a ? e.state === "conflict" ? "Needs review" : e.state === "failed" ? "Kept on this device \xB7 retry needed" : navigator.onLine === !1 ? "Kept on this device" : "Saving\u2026" : c.version ? "Saved to your account" : "Not saved yet", Le.hidden = !a || !["failed", "conflict"].includes(e.state), ke.hidden = e?.state === "conflict", Ee.hidden = e?.state !== "conflict", !y && a && e.error && (M.textContent = e.error);
  }
  function we() {
    if (!U.value.trim() || !k.checkValidity())
      throw n !== "notes" && k.reportValidity(), Error("Check the required fields before saving.");
    return H();
  }
  async function he() {
    if (!d() || !u) return;
    clearTimeout(S);
    const e = we(), a = C;
    await f.save(s, e, { version: c.version, editorBase: c }), n !== "notes" && (a === C ? await f.dropForm(s) : await be()), d() && (u = a !== C, y = !1, M.textContent = "", P(), Y(), n !== "notes" && !u && re(!1));
  }
  async function be() {
    const e = C, a = { ...i, title: U.value, links: structuredClone(l), ...n === "people" ? { email: se.value, phone: ie.value, organisation: pe.value, details: V.value } : { description: oe.value, allDay: j.checked, startLocal: F.value, endLocal: ee.value, firstDay: _.value, lastDay: $.value } };
    await f.keepForm(s, a, c.version), d() && e === C && (A = !0, y = !1, Y());
  }
  const Ce = () => n === "notes" ? he() : be();
  function De(e) {
    d() && (y = !0, Y(), M.textContent = e.message);
  }
  function K() {
    A = !1, y = !1, C++, u = !0, M.textContent = "", Y(), o.workspace?.changed(), clearTimeout(S), S = setTimeout(() => {
      O = O.catch(() => {
      }).then(Ce), O.catch(De);
    }, 250);
  }
  k.addEventListener("input", (e) => {
    e.target.closest(".org-checklist") || K();
  }), k.addEventListener("change", (e) => {
    e.target === j && K();
  }), k.addEventListener("submit", (e) => {
    e.preventDefault(), Z(he)();
  });
  async function te() {
    clearTimeout(S), O = O.catch(() => {
    }).then(async () => {
      for (; d() && u && (n === "notes" || !A); )
        clearTimeout(S), await Ce();
    });
    try {
      await O;
    } catch (e) {
      throw De(e), e;
    }
  }
  function Pe() {
    if (n === "notes") {
      te().then(() => {
        d() && !u && L();
      }, () => {
      });
      return;
    }
    if (!u) return L();
    const e = o.sheet.open({ sheet: "organise-unsaved", title: "Keep editing?", body: t("p", { text: "This item has changes that have not been saved." }), acts: [{ label: "Keep editing", run: () => e.now() }, { label: "Keep draft & close", run: async () => {
      e.setBusy(!0);
      try {
        await te(), e.now(), L();
      } catch (a) {
        o.toast(a.message);
      } finally {
        e.setBusy(!1);
      }
    } }, { label: "Discard changes", destructive: !0, run: async () => {
      clearTimeout(S), await f.dropForm(s), u = !1, e.now(), L();
    } }] });
  }
  async function Ue() {
    let e = null;
    try {
      e = await f.remote(s);
    } catch (I) {
      if (I.status !== 404) throw I;
    }
    if (!d()) return;
    const a = t("p", { class: "org-status", role: "status" });
    let r = !1;
    const x = async (I) => {
      if (!(r || !d() || v.closed)) {
        r = !0, a.textContent = "", v.setBusy(!0);
        try {
          await I();
        } catch (xe) {
          d() && !v.closed && (a.textContent = xe.message);
        } finally {
          r = !1, v.setBusy(!1);
        }
      }
    }, v = o.sheet.open({ sheet: "organise-conflict", title: "Review conflicting changes", body: t(
      "div",
      { class: "org" },
      t("p", { text: f.view(s)?.unpersisted ? "Your edits are still open in this tab. Save a copy to keep them." : "Your local work is kept. Choose which copy to continue with." }),
      t("h3", { text: "On this device" }),
      t("pre", { class: "org-conflict", text: JSON.stringify(H(), null, 2) }),
      t("h3", { text: "In your account" }),
      t("pre", { class: "org-conflict", text: e ? JSON.stringify(e, null, 2) : "This item was deleted." }),
      a
    ), acts: [
      { label: "Save my work as a new copy", run: () => x(async () => {
        if (clearTimeout(S), await O.catch(() => {
        }), !d() || v.closed) return;
        const I = we(), xe = C, Ne = () => d() && xe === C, ze = await f.copy(s, I, Ne);
        Ne() && (u = y = !1, M.textContent = "", Y(), v.closed || (v.now(), o.nav.go("/" + n + "/#item=" + ze)));
      }) },
      { label: "Use account version", run: () => x(async () => {
        await f.discard(s), v.now(), u = !1, L();
      }) }
    ] });
  }
  const ke = B("Retry save", () => f.retry(s)), Ee = B("Review account version", Ue), Le = t("div", { class: "org-recovery", hidden: !0 }, ke, Ee), me = B("Delete", () => {
    const e = o.sheet.open({ sheet: "organise-delete", title: "Delete this " + (n === "notes" ? "note" : n === "people" ? "person" : "event") + "?", body: t("p", { text: "Linked files and items in other apps will stay in place." }), acts: [{ label: "Cancel", run: () => e.now() }, { label: "Delete", destructive: !0, run: async () => {
      try {
        if (await te(), f.view(s)?.pending) throw Error("Finish or review the pending save before deleting.");
        c.version && await f.save(s, H(), { version: c.version, deleted: !0 }), u = !1, e.now(), L();
      } catch (a) {
        o.toast(a.message);
      }
    } }] });
  });
  me.hidden = !c.version;
  const Te = B("Save", he, !0), ge = n === "calendar" ? B("Edit event", () => re(!0)) : null, ye = t("div", { class: "org-toolbar org-editor-tools" }, ne, ge, n === "notes" ? null : Te), Ie = B("Use in another app", async () => {
    await te(), d() && await o.workspace?.life?.share({ app: n, id: s });
  }), W = t("section", { class: "org-profile" });
  let ve;
  function Se(e) {
    if (!e.length) return;
    const a = t("div", { class: "org-profile-links org-related" }, t("h3", { text: "Linked items" }));
    for (const r of e) a.append(B(N.get(r.app + ":" + r.id) || r.app[0].toUpperCase() + r.app.slice(1), () => r.app === "files" ? o.workspace?.openReference(r) : o.nav.go(de(r))));
    W.append(a);
  }
  function Oe() {
    const e = l.find((a) => a.app === "chats");
    ve = e && E?.(e.id)?.handle, Re(W, o, {
      value: H(),
      handle: ve,
      saveState: ne,
      edit: { label: "Edit contact", run: () => re(!0) },
      chat: e ? () => o.nav.go(de(e)) : null
    }), Se(l.filter((a) => a !== e));
  }
  function re(e) {
    if (k.hidden = !e, W.hidden = e, Te.hidden = !e, ge && (ge.hidden = e), n === "people" && (ye.hidden = !e, e ? ye.prepend(ne) : Oe()), e)
      queueMicrotask(() => {
        d() && o.workspace?.active() && U.focus({ preventScroll: !0 });
      });
    else {
      if (n === "people") return;
      const a = H(), r = t("div", { class: "org-contact-details" }), x = a.allDay ? /* @__PURE__ */ new Date(a.startDate + "T12:00:00") : new Date(a.start), v = a.allDay ? /* @__PURE__ */ new Date(ae(a.endDate, -1) + "T12:00:00") : new Date(a.end);
      r.append(...[t("div", {}, t("small", { text: a.allDay ? "Date" : "Starts" }), t("span", { text: x.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + (a.allDay ? " \xB7 All day" : " \xB7 " + x.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) })), !a.allDay || a.endDate > ae(a.startDate, 1) ? t("div", {}, t("small", { text: "Ends" }), t("span", { text: v.toLocaleDateString([], { day: "numeric", month: "long" }) + (a.allDay ? "" : " \xB7 " + v.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) })) : null].filter(Boolean)), a.description && r.append(t("div", {}, t("small", { text: "Details" }), t("span", { text: a.description }))), W.replaceChildren(t("span", { class: "org-empty-icon" }, p.icon("calendar")), t("h2", { text: a.title }), r), Se(l);
    }
  }
  const qe = t("div", { class: "org-toolbar org-editor-footer" }, Ie, B("Save a copy to Files", () => {
    if (!U.value.trim()) throw Error("Add a title first.");
    return m({ ...H(), id: s });
  }), me), le = t("details", { class: n === "people" ? "org-extra org-people-extra" : "org-extra" }, t("summary", { text: n === "notes" ? "Linked items & actions" : "More actions" }));
  if (n === "notes") {
    const e = Q.previousElementSibling;
    le.append(e, Q);
  }
  if (le.append(qe), h.replaceChildren(...[ye, W, k, M, Le, n === "calendar" ? B("Prepare invitation", () => q({ ...H(), id: s })) : null, le].filter(Boolean)), n !== "notes" ? re(!c.version || u) : W.hidden = !0, n === "people" && c.version) {
    const e = t("section", { class: "org-related", hidden: !0 }, t("h3", { text: "Related notes and events" }));
    h.insertBefore(e, le);
    const a = Be(o, { prefix: "/api/organise/" });
    Promise.all(["notes", "calendar"].map((r) => a.request("list", { method: "POST", body: { kind: r, related: { app: "people", id: s }, limit: 12 } }).then((x) => x.records))).then((r) => {
      if (!d()) return;
      const x = r.flat();
      e.hidden = !x.length;
      for (const v of x) e.append(B(v.title, () => o.nav.go("/" + v.kind + "/#item=" + v.id)));
    }).catch(() => {
      d() && (e.hidden = !1, e.append(t("p", { class: "org-muted", text: "Related items couldn\u2019t load." })));
    });
  }
  return Y(), queueMicrotask(() => {
    d() && o.workspace?.active() && !k.hidden && (!i.version || n !== "notes") && (U.focus({ preventScroll: !0 }), n === "notes" && U.value === "Untitled note" && U.select());
  }), { status: Y, close: Pe, flush: te, dirty: () => u, refreshFriend() {
    if (n !== "people" || !d() || W.hidden) return;
    const e = l.find((a) => a.app === "chats");
    ve !== (e && E?.(e.id)?.handle) && Oe();
  }, destroy() {
    w = !0, clearTimeout(S), h.replaceChildren();
  } };
}
export {
  He as createEditor,
  Je as openAtlasDraft,
  Ve as openFriendProfile,
  Re as renderPersonProfile
};
