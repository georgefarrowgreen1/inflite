import { createSystemClient as Ee, operationId as Le } from "/roof/system-client.js";
import { addDays as F, localDay as Ae, localInput as j, parseLocal as le, zone as G, pathOf as ce } from "./model.js";
function Pe(o, n, s, { current: i, create: m }) {
  if (!["notes", "calendar"].includes(n) || s?.kind !== (n === "notes" ? "note-draft" : "event-draft") || !i()) return null;
  const { el: f, btn: L } = o.ui, B = o.session.view?.user?.id || o.session.user?.id;
  if (!B || o.signal.aborted) return null;
  let h, g = !1, I = !1;
  const w = () => !g && !o.signal.aborted && (o.session.view?.user?.id || o.session.user?.id) === B && i() && !h?.closed && !h?.el?.classList?.contains("closing"), D = f("form", { class: "org-form" }), d = f("p", { class: "org-status", role: "status" }), t = (u, O, A, c, ee = !1) => {
    const x = f(O === "textarea" ? "textarea" : "input", { ...O === "textarea" ? { rows: n === "notes" ? 10 : 4 } : { type: O }, maxlength: c, required: ee, "aria-label": u });
    return x.value = A ?? "", D.append(f("label", { class: "org-field" }, f("span", { text: u }), x)), x;
  }, T = t("Title", "text", s.title, 160, !0), k = t(n === "notes" ? "Note" : "Description", "textarea", n === "notes" ? s.text : s.description, n === "notes" ? 64e3 : 4e3);
  let l, N;
  n === "calendar" && (l = t("Starts", "datetime-local", Number.isFinite(s.start) ? j(s.start) : "", null, !0), N = t("Ends", "datetime-local", Number.isFinite(s.end) ? j(s.end) : "", null, !0), D.append(f("p", { class: "org-muted", text: "Times shown in " + G() + ". Choose the date and time before creating this event." })));
  const S = s.source?.app === "mail" && /^[A-Za-z0-9_-]{1,64}$/.test(s.source.threadId || "") ? [{ app: "mail", id: s.source.threadId }] : [];
  S.length && D.append(f("p", { class: "org-muted", text: "The original Mail conversation will be linked to this " + (n === "notes" ? "note." : "event.") }));
  const y = L("Cancel", { run: () => {
    g = !0, h?.now();
  } }), v = L(n === "notes" ? "Create note" : "Create event", { primary: !0, run: b });
  async function b() {
    if (!(!w() || I)) {
      d.textContent = "";
      try {
        if (!D.checkValidity() || !T.value.trim() || T.value.length > 160 || k.value.length > (n === "notes" ? 64e3 : 4e3))
          throw D.reportValidity(), Error("Check the required fields before creating this " + (n === "notes" ? "note." : "event."));
        const u = { title: T.value.trim(), links: structuredClone(S) };
        if (n === "notes") Object.assign(u, { text: k.value, checklist: [] });
        else {
          const A = Number.isFinite(s.start) && l.value === j(s.start) ? s.start : le(l.value), c = Number.isFinite(s.end) && N.value === j(s.end) ? s.end : le(N.value);
          if (c <= A || c - A > 366 * 864e5) throw Error("Choose an end time after the start, within one year.");
          Object.assign(u, { description: k.value, allDay: !1, start: A, end: c, timezone: A === s.start && c === s.end ? s.timezone || G() : G() });
        }
        I = !0, v.disabled = y.disabled = !0, h?.setBusy(!0), await m(u, w) && w() && (g = !0, h.now());
      } catch (u) {
        w() && (d.textContent = u.message);
      } finally {
        I = !1, v.disabled = y.disabled = !1, w() && h?.setBusy(!1);
      }
    }
  }
  D.addEventListener("submit", (u) => {
    u.preventDefault(), b();
  });
  const p = f("section", { class: "org" }, f("p", { class: "org-muted", text: n === "notes" ? "Review the Atlas draft. Creating it adds it to your Notes." : "Review the Atlas draft. Creating it adds an event to your Calendar." }), D, d, f("div", { class: "org-toolbar" }, y, v));
  return h = o.sheet.open({ sheet: "atlas-" + n + "-draft", title: n === "notes" ? "Create a note from Atlas" : "Create an event from Atlas", body: p, focus: T, onClose: () => {
    g = !0;
  } }), h;
}
function Te(o, n, { value: s, handle: i, chat: m, edit: f, saveState: L }) {
  const { avatar: B, btn: h, el: g } = n.ui;
  o.classList.add("org-person");
  const I = g(
    "div",
    { class: "org-person-identity" },
    B(s.title),
    g("div", {}, g("h2", { text: s.title }), L)
  ), w = n.workspace?.handoffs, D = s.email ? "mailto:" + encodeURIComponent(s.email) : "", d = g(
    "div",
    { class: "org-person-actions" },
    m ? h("Message", { icon: "bubble", primary: !0, run: m }) : null,
    D ? h("Email", { icon: "mail", ...w?.can("mail", "text") ? { run: () => w.send("mail", "text", { subject: "Hello " + s.title, text: "", to: s.email }) } : { href: D } }) : null,
    h(f.label, { icon: "pen", primary: !m && !L, run: f.run })
  ), t = [
    ["Email", s.email],
    ["Phone", s.phone ? g("a", { href: "tel:" + encodeURIComponent(s.phone), text: s.phone }) : null],
    ["Organisation", s.organisation],
    ["Chat handle", i && s.title !== "@" + i ? "@" + i : null],
    ["Contact notes", s.details]
  ], T = g(
    "dl",
    { class: "org-person-details", "aria-label": "Contact details" },
    t.filter(([, k]) => k).map(([k, l]) => g("div", {}, g("dt", { text: k }), g("dd", {}, l)))
  );
  o.replaceChildren(I, d, T.childElementCount ? T : g("p", { class: "org-muted org-person-empty", text: "No contact details yet." }));
}
function Ue(o, { detail: n, id: s, current: i, store: m, go: f, findContact: L }) {
  const B = o.ui, h = B.el, g = { id: s }, I = Ee(o, { prefix: "/api/organise/" });
  let w;
  async function D(d) {
    const t = L();
    if (t) return t;
    const { records: T } = await I.request("list", { method: "POST", body: { kind: "people", related: { app: "chats", id: s }, limit: 1 }, current: d });
    return T.find((k) => k.links?.some((l) => l.app === "chats" && l.id === s))?.id;
  }
  return (d, t, T) => {
    if (!i()) return;
    const k = d ? JSON.stringify([d.name, d.handle]) : "missing:" + (T ? "loaded" : t);
    if (k === w) return;
    if (w = k, !d) {
      const p = !T && (!t || t === "ready");
      n.replaceChildren(p ? h("p", { role: "status", text: "Opening contact\u2026" }) : B.empty({
        title: t === "locked" ? "Chats is locked" : "Chat friend unavailable",
        body: t === "locked" ? "Unlock Chats to view this profile." : "Open Chats to check your friends.",
        acts: [{ label: "Open Chats", href: "/chats/#friends" }]
      }));
      return;
    }
    const l = h("section", { class: "org-profile" }), N = h("details", { class: "org-extra org-people-extra" }, h("summary", { text: "More actions" })), S = h("p", { class: "org-status", role: "status" }), y = () => i() && n.contains(l);
    let v = !1;
    async function b(p) {
      if (!(!y() || v)) {
        v = !0, l.setAttribute("aria-busy", "true"), S.textContent = "";
        try {
          const u = await D(y);
          if (!y()) return;
          if (u) {
            f(u, null, !0);
            return;
          }
          if (p) {
            const { chooseLink: O } = await import("./links.js");
            if (!y()) return;
            const A = await O(o, "chats", { contactsOnly: !0 });
            A && y() && f(A.id, { chat: g }, !0);
          } else {
            if (!m.ready()) throw Error("Private device storage is unavailable. Try again before adding details.");
            const O = Le();
            f(O, { chat: g, initial: { id: O, kind: "people", title: d.name, links: [], version: 0 } }, !0);
          }
        } catch (u) {
          y() && (S.textContent = u.message);
        } finally {
          v = !1, l.removeAttribute("aria-busy");
        }
      }
    }
    Te(l, o, {
      value: { title: d.name },
      handle: d.handle,
      edit: { label: "Add details", run: () => b(!1) },
      chat: () => {
        y() && o.nav.go(ce({ app: "chats", id: s }));
      }
    }), N.append(h("div", { class: "org-toolbar" }, B.btn("Link to existing contact", { icon: "link", run: () => b(!0) }))), n.replaceChildren(l, S, N);
  };
}
function Ie({ F: o, kind: n, id: s, value: i, store: m, detail: f, home: L, onSaved: B, exportValue: h, linkPicker: g, prepareInvitation: I, chat: w, friendFor: D }) {
  const d = o.ui, t = d.el, T = o.signal;
  let k = !1, l = !!i.formDraft, N = !!i.formDraft, S = 0, y = 0, v = i.version || 0, b = Promise.resolve(), p = structuredClone(i.links || []), u = structuredClone(i.checklist || []), O = new Map((i.linkedLabels || []).map((e) => [e.app + ":" + e.id, e.unavailable ? "Unavailable " + e.app : e.title || e.app]));
  if (w && !p.some((e) => e.app === "chats" && e.id === w.id)) {
    if (p.length >= 12) throw Error("Remove a linked item before linking this Chat friend.");
    p.push({ app: "chats", id: w.id }), l = !0, N = !1;
  }
  const A = o.session.view?.user?.id || o.session.user?.id, c = () => !k && !T.aborted && (o.session.view?.user?.id || o.session.user?.id) === A, ee = (e) => () => {
    try {
      Promise.resolve(e()).catch((a) => {
        c() && (q.textContent = a.message);
      });
    } catch (a) {
      c() && (q.textContent = a.message);
    }
  }, x = (e, a, r = !1) => d.btn(e, { primary: r, run: ee(a) }), q = t("p", { role: "status", class: "org-status" }), te = t("span", { class: "org-save-state", role: "status" }), C = t("form", { class: "org-form" }), R = (e, a, r, E, U = !1) => {
    const ve = t(a === "textarea" ? "textarea" : "input", { ...a === "textarea" ? { rows: e === "Note" ? 12 : 3 } : { type: a }, maxlength: E, required: U, "aria-label": e });
    return ve.value = r ?? "", C.append(t("label", { class: "org-field" }, t("span", { text: e }), ve)), ve;
  }, P = R(n === "people" ? "Name" : "Title", "text", i.title, 160, !0);
  P.autocomplete = n === "people" ? "name" : "off", P.placeholder = n === "people" ? "Full name" : n === "notes" ? "Title" : "Event title";
  let K, ae, ne, de, se, z, Q, W, V, Y, Z = null;
  if (n === "notes" && (K = R("Note", "textarea", i.text || "", 64e3), K.classList.add("org-note-body"), K.placeholder = "Start writing\u2026", Z = t("div", { class: "org-checklist" }), C.append(Z), pe(), C.append(x("Add checklist item", () => {
    if (u.length >= 200) throw Error("Use up to 200 items.");
    u.push({ id: Le(), text: "", done: !1 }), pe(), M(), Z.lastElementChild?.querySelector("input[type=text]")?.focus();
  }))), n === "people" && (w && C.append(t("p", { class: "org-muted", text: "These details are private to your InFlite account." })), de = R("Organisation", "text", i.organisation, 160), ae = R("Email", "email", i.email, 254), ae.autocomplete = "email", ne = R("Phone", "tel", i.phone, 40), ne.autocomplete = "tel", K = R("Contact notes", "textarea", i.details, 4e3)), n === "calendar") {
    se = R("Description", "textarea", i.description, 4e3), z = t("input", { type: "checkbox", checked: i.allDay, "aria-label": "All-day event" }), C.append(t("label", { class: "org-check" }, z, t("span", { text: "All day" })));
    const e = i.allDay ? i.startDate : Ae(i.start), a = i.allDay ? i.endDate : F(e, 1);
    Q = R("Starts", "datetime-local", i.startLocal ?? j(i.start || (/* @__PURE__ */ new Date(e + "T09:00:00")).getTime())), W = R("Ends", "datetime-local", i.endLocal ?? j(i.end || (/* @__PURE__ */ new Date(e + "T10:00:00")).getTime())), V = R("First day", "date", i.firstDay ?? e), Y = R("Last day", "date", i.lastDay ?? F(a, -1)), C.append(se.closest("label")), C.append(t("p", { class: "org-muted", text: "Times shown in " + G() + ". All-day dates stay on the selected days." }));
    const r = () => {
      Q.closest("label").hidden = W.closest("label").hidden = z.checked, V.closest("label").hidden = Y.closest("label").hidden = !z.checked;
    };
    z.addEventListener("change", r), r();
  }
  const _ = t("div", { class: "org-links" });
  C.append(t("div", { class: "org-toolbar" }, t("h3", { text: "Linked items" }), x("Link an item", async () => {
    const e = await g();
    if (!c() || !e) return;
    if (p.length >= 12) throw Error("Link up to twelve items.");
    const { title: a, ...r } = e;
    a && O.set(r.app + ":" + r.id, a), p.some((E) => JSON.stringify(E) === JSON.stringify(r)) || p.push(r), ue(), M();
  })), _), ue();
  function pe() {
    if (Z) {
      Z.replaceChildren();
      for (const e of u) {
        const a = t("input", { type: "checkbox", checked: e.done, "aria-label": "Complete checklist item" }), r = t("input", { type: "text", maxlength: 500, "aria-label": "Checklist item" });
        r.value = e.text, a.addEventListener("change", () => {
          e.done = a.checked, M();
        }), r.addEventListener("input", () => {
          e.text = r.value, M();
        }), Z.append(t("div", { class: "org-check-row" }, a, r, d.iconBtn("x", { label: "Remove checklist item", run: () => {
          u = u.filter((E) => E !== e), pe(), M();
        } })));
      }
    }
  }
  function ue() {
    _.replaceChildren(), p.length || _.append(t("p", { class: "org-muted", text: "Link a file, note, person, event or app source." }));
    for (const e of p) {
      const a = t("span", { text: O.get(e.app + ":" + e.id) || e.app[0].toUpperCase() + e.app.slice(1) }), r = x("Open", () => e.app === "files" ? o.workspace?.openReference(e) : o.nav.go(ce(e))), E = d.iconBtn("x", { label: "Remove link to " + e.app, run: () => {
        p = p.filter((U) => U !== e), ue(), M();
      } });
      _.append(t("div", { class: "org-link" }, d.icon(e.app === "files" ? "file" : "open"), a, r, E));
    }
  }
  function J() {
    const e = { title: P.value.trim(), links: structuredClone(p) };
    if (n === "notes" && Object.assign(e, { text: K.value, checklist: structuredClone(u) }), n === "people" && Object.assign(e, { email: ae.value.trim(), phone: ne.value.trim(), organisation: de.value, details: K.value }), n === "calendar") {
      if (Object.assign(e, { description: se.value, allDay: z.checked, timezone: G() }), e.allDay) {
        if (!V.value || !Y.value || Y.value < V.value) throw Error("Check the event dates.");
        e.startDate = V.value, e.endDate = F(Y.value, 1);
      } else if (e.start = Number.isFinite(i.start) && Q.value === j(i.start) ? i.start : le(Q.value), e.end = Number.isFinite(i.end) && W.value === j(i.end) ? i.end : le(W.value), e.start === i.start && e.end === i.end && (e.timezone = i.timezone || G()), e.end <= e.start) throw Error("The end time must follow the start time.");
    }
    return e;
  }
  function X() {
    if (!c()) return;
    const e = m.view(s);
    e?.version && (v = e.version), he.hidden = !v;
    const a = e?.pending;
    te.textContent = l ? n === "notes" ? "Saving on this device\u2026" : N ? "Draft kept on this device" : "Unsaved changes" : a ? e.state === "conflict" ? "Needs review" : e.state === "failed" ? "Kept on this device \xB7 retry needed" : navigator.onLine === !1 ? "Kept on this device" : "Saving\u2026" : l ? n === "notes" ? "Saving\u2026" : "Unsaved changes" : v ? "Saved to your account" : "Not saved yet", be.hidden = !a || !["failed", "conflict"].includes(e.state), xe.hidden = e?.state === "conflict", we.hidden = e?.state !== "conflict", a && e.error && (q.textContent = e.error);
  }
  async function ie() {
    if (!c() || !l) return;
    if (clearTimeout(y), !P.value.trim() || !C.checkValidity())
      throw n !== "notes" && C.reportValidity(), Error("Check the required fields before saving.");
    const e = J(), a = S;
    await m.save(s, e, { version: v }), n !== "notes" && (a === S ? await m.dropForm(s) : await fe()), c() && (l = a !== S, q.textContent = "", B(), X(), n !== "notes" && !l && oe(!1));
  }
  async function fe() {
    const e = S, a = { ...i, title: P.value, links: structuredClone(p), ...n === "people" ? { email: ae.value, phone: ne.value, organisation: de.value, details: K.value } : { description: se.value, allDay: z.checked, startLocal: Q.value, endLocal: W.value, firstDay: V.value, lastDay: Y.value } };
    await m.keepForm(s, a, v), c() && e === S && (N = !0, X());
  }
  function M() {
    N = !1, S++, l = !0, q.textContent = "", X(), o.workspace?.changed(), n === "notes" ? (clearTimeout(y), y = setTimeout(() => {
      b = b.catch(() => {
      }).then(ie), b.catch((e) => {
        c() && (q.textContent = e.message);
      });
    }, 250)) : (clearTimeout(y), y = setTimeout(() => {
      b = b.catch(() => {
      }).then(fe), b.catch((e) => {
        c() && (q.textContent = e.message);
      });
    }, 250));
  }
  C.addEventListener("input", (e) => {
    e.target.closest(".org-checklist") || M();
  }), C.addEventListener("change", (e) => {
    e.target === z && M();
  }), C.addEventListener("submit", (e) => {
    e.preventDefault(), ee(ie)();
  });
  async function $() {
    clearTimeout(y), n === "notes" && l ? (b = b.catch(() => {
    }).then(ie), await b.catch((e) => {
      c() && (q.textContent = e.message);
    })) : (await b.catch(() => {
    }), n !== "notes" && l && await fe());
  }
  function Se() {
    if (n === "notes") {
      $().then(() => {
        l || L();
      });
      return;
    }
    if (!l) return L();
    const e = o.sheet.open({ sheet: "organise-unsaved", title: "Keep editing?", body: t("p", { text: "This item has changes that have not been saved." }), acts: [{ label: "Keep editing", run: () => e.now() }, { label: "Keep draft & close", run: async () => {
      e.setBusy(!0);
      try {
        await $(), e.now(), L();
      } catch (a) {
        o.toast(a.message);
      } finally {
        e.setBusy(!1);
      }
    } }, { label: "Discard changes", destructive: !0, run: async () => {
      clearTimeout(y), await m.dropForm(s), l = !1, e.now(), L();
    } }] });
  }
  const xe = x("Retry save", () => m.retry(s)), we = x("Review account version", async () => {
    let e = null;
    try {
      e = await m.remote(s);
    } catch (r) {
      if (r.status !== 404) throw r;
    }
    if (!c()) return;
    const a = o.sheet.open({ sheet: "organise-conflict", title: "Review conflicting changes", body: t("div", { class: "org" }, t("p", { text: m.view(s)?.unpersisted ? "Your edits are still open in this tab. Save a copy to keep them." : "Your local work is kept. Choose which copy to continue with." }), t("h3", { text: "On this device" }), t("pre", { class: "org-conflict", text: JSON.stringify(J(), null, 2) }), t("h3", { text: "In your account" }), t("pre", { class: "org-conflict", text: e ? JSON.stringify(e, null, 2) : "This item was deleted." }), x("Save my work as a new copy", async () => {
      await $();
      const r = await m.copy(s);
      l = !1, a.now(), o.nav.go("/" + n + "/#item=" + r);
    }), x("Use account version", async () => {
      await m.discard(s), a.now(), l = !1, L();
    })) });
  }), be = t("div", { class: "org-recovery", hidden: !0 }, xe, we), he = x("Delete", () => {
    const e = o.sheet.open({ sheet: "organise-delete", title: "Delete this " + (n === "notes" ? "note" : n === "people" ? "person" : "event") + "?", body: t("p", { text: "Linked files and items in other apps will stay in place." }), acts: [{ label: "Cancel", run: () => e.now() }, { label: "Delete", destructive: !0, run: async () => {
      try {
        if (await $(), m.view(s)?.pending) throw Error("Finish or review the pending save before deleting.");
        v && await m.save(s, J(), { version: v, deleted: !0 }), l = !1, e.now(), L();
      } catch (a) {
        o.toast(a.message);
      }
    } }] });
  });
  he.hidden = !v;
  const Ce = x("Save", ie, !0), me = n === "calendar" ? x("Edit event", () => oe(!0)) : null, ge = t("div", { class: "org-toolbar org-editor-tools" }, te, me, n === "notes" ? null : Ce), Oe = x("Use in another app", async () => {
    await $(), c() && await o.workspace?.life?.share({ app: n, id: s });
  }), H = t("section", { class: "org-profile" });
  let ye;
  function De(e) {
    if (!e.length) return;
    const a = t("div", { class: "org-profile-links org-related" }, t("h3", { text: "Linked items" }));
    for (const r of e) a.append(x(O.get(r.app + ":" + r.id) || r.app[0].toUpperCase() + r.app.slice(1), () => r.app === "files" ? o.workspace?.openReference(r) : o.nav.go(ce(r))));
    H.append(a);
  }
  function ke() {
    const e = p.find((a) => a.app === "chats");
    ye = e && D?.(e.id)?.handle, Te(H, o, {
      value: J(),
      handle: ye,
      saveState: te,
      edit: { label: "Edit contact", run: () => oe(!0) },
      chat: e ? () => o.nav.go(ce(e)) : null
    }), De(p.filter((a) => a !== e));
  }
  function oe(e) {
    if (C.hidden = !e, H.hidden = e, Ce.hidden = !e, me && (me.hidden = e), n === "people" && (ge.hidden = !e, e ? ge.prepend(te) : ke()), e)
      queueMicrotask(() => {
        c() && o.workspace?.active() && P.focus({ preventScroll: !0 });
      });
    else {
      if (n === "people") return;
      const a = J(), r = t("div", { class: "org-contact-details" }), E = a.allDay ? /* @__PURE__ */ new Date(a.startDate + "T12:00:00") : new Date(a.start), U = a.allDay ? /* @__PURE__ */ new Date(F(a.endDate, -1) + "T12:00:00") : new Date(a.end);
      r.append(...[t("div", {}, t("small", { text: a.allDay ? "Date" : "Starts" }), t("span", { text: E.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + (a.allDay ? " \xB7 All day" : " \xB7 " + E.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) })), !a.allDay || a.endDate > F(a.startDate, 1) ? t("div", {}, t("small", { text: "Ends" }), t("span", { text: U.toLocaleDateString([], { day: "numeric", month: "long" }) + (a.allDay ? "" : " \xB7 " + U.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) })) : null].filter(Boolean)), a.description && r.append(t("div", {}, t("small", { text: "Details" }), t("span", { text: a.description }))), H.replaceChildren(t("span", { class: "org-empty-icon" }, d.icon("calendar")), t("h2", { text: a.title }), r), De(p);
    }
  }
  const Ne = t("div", { class: "org-toolbar org-editor-footer" }, Oe, x("Save a copy to Files", () => {
    if (!P.value.trim()) throw Error("Add a title first.");
    return h({ ...J(), id: s });
  }), he), re = t("details", { class: n === "people" ? "org-extra org-people-extra" : "org-extra" }, t("summary", { text: n === "notes" ? "Linked items & actions" : "More actions" }));
  if (n === "notes") {
    const e = _.previousElementSibling;
    re.append(e, _);
  }
  if (re.append(Ne), f.replaceChildren(...[ge, H, C, q, be, n === "calendar" ? x("Prepare invitation", () => I({ ...J(), id: s })) : null, re].filter(Boolean)), n !== "notes" ? oe(!v || l) : H.hidden = !0, n === "people" && v) {
    const e = t("section", { class: "org-related", hidden: !0 }, t("h3", { text: "Related notes and events" }));
    f.insertBefore(e, re);
    const a = Ee(o, { prefix: "/api/organise/" });
    Promise.all(["notes", "calendar"].map((r) => a.request("list", { method: "POST", body: { kind: r, related: { app: "people", id: s }, limit: 12 } }).then((E) => E.records))).then((r) => {
      if (!c()) return;
      const E = r.flat();
      e.hidden = !E.length;
      for (const U of E) e.append(x(U.title, () => o.nav.go("/" + U.kind + "/#item=" + U.id)));
    }).catch(() => {
      c() && (e.hidden = !1, e.append(t("p", { class: "org-muted", text: "Related items couldn\u2019t load." })));
    });
  }
  return X(), queueMicrotask(() => {
    c() && o.workspace?.active() && !C.hidden && (!v || n !== "notes") && (P.focus({ preventScroll: !0 }), n === "notes" && P.value === "Untitled note" && P.select());
  }), { status: X, close: Se, flush: $, dirty: () => l, refreshFriend() {
    if (n !== "people" || !c() || H.hidden) return;
    const e = p.find((a) => a.app === "chats");
    ye !== (e && D?.(e.id)?.handle) && ke();
  }, destroy() {
    k = !0, clearTimeout(y), f.replaceChildren();
  } };
}
export {
  Ie as createEditor,
  Pe as openAtlasDraft,
  Ue as openFriendProfile,
  Te as renderPersonProfile
};
