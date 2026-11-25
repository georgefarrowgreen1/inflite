import { when as D } from "./model.js";
function g(e) {
  return e.title + `

` + (e.text || "") + (e.checklist?.length ? `

` + e.checklist.map((t) => (t.done ? "[x] " : "[ ] ") + t.text).join(`
`) : "");
}
function w(e) {
  const t = (n) => String(n || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,"), a = (n) => new Date(n).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"), i = (n) => n.replace(/-/g, "");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InFlite//Calendar 4.00//EN", "BEGIN:VEVENT", "UID:" + e.id + "@inflite.ai", "DTSTAMP:" + a(Date.now()), e.allDay ? "DTSTART;VALUE=DATE:" + i(e.startDate) : "DTSTART:" + a(e.start), e.allDay ? "DTEND;VALUE=DATE:" + i(e.endDate) : "DTEND:" + a(e.end), "SUMMARY:" + t(e.title), "DESCRIPTION:" + t(e.description), "END:VEVENT", "END:VCALENDAR"].map((n) => {
    let r = "", o = "", l = 0;
    for (const p of n) {
      const s = new TextEncoder().encode(p).length;
      l + s > 75 && (r += o + `\r
 `, o = "", l = 1), o += p, l += s;
    }
    return r + o;
  }).join(`\r
`) + `\r
`;
}
function u(e, t, a) {
  const i = e === "calendar" ? ".ics" : ".txt", c = e === "calendar" ? "text/calendar" : "text/plain", n = e === "calendar" ? w(t) : e === "notes" ? g(t) : [t.title, t.organisation, t.email, t.phone, t.details].filter(Boolean).join(`
`);
  return new File([n], a + i, { type: c });
}
async function T(e, t, a) {
  if (e.signal.aborted) return;
  if (!e.workspace?.files?.save) throw Error("Files is still opening. Try again.");
  const i = a.title.replace(/[\/:\\\u0000-\u001f]/g, "-").slice(0, 120);
  return e.workspace.files.save(u(t, a, i), { title: "Save a copy to Files" });
}
function x(e, t, a, i) {
  const c = u(a, i, i.title), n = URL.createObjectURL(c), r = e.ui.el("a", { href: n, download: c.name, hidden: !0 }), o = () => {
    URL.revokeObjectURL(n), clearTimeout(l), e.signal.removeEventListener("abort", o);
  }, l = setTimeout(o, 1e3);
  return e.signal.addEventListener("abort", o, { once: !0 }), t.append(r), r.click(), r.remove(), { ok: !0 };
}
function h(e, t) {
  const a = e.ui, i = a.el, c = () => !e.signal.aborted && e.workspace?.active() !== !1, n = (s, d) => a.btn(s, { run: async () => {
    if (c())
      try {
        await d();
      } catch (f) {
        c() && e.toast(f.message);
      }
  } }), r = `${t.title}
${t.allDay ? (/* @__PURE__ */ new Date(t.startDate + "T12:00:00")).toLocaleDateString() : new Date(t.start).toLocaleString() + " \xB7 " + D(t)}
${t.description || ""}`.trim(), o = i("textarea", { rows: 6, readonly: !0, "aria-label": "Invitation text" });
  o.value = r;
  let l;
  const p = i("div", { class: "org" }, i("p", { text: "Review this invitation. Nothing is sent automatically." }), o, n("Copy invitation", async () => {
    await navigator.clipboard.writeText(r), e.toast("Invitation copied");
  }), n("Open Chats", () => {
    l.now(), e.nav.go("/chats/");
  }));
  e.workspace?.handoffs?.can("mail", "text") && p.append(n("Prepare in Mail", async () => {
    l.now();
    const s = await e.workspace.handoffs.send("mail", "text", { subject: t.title, text: r });
    s?.ok || e.toast(s?.error || "Mail could not open.");
  })), l = e.sheet.open({ sheet: "calendar-invite", title: "Prepare invitation", body: p });
}
export {
  x as downloadValue,
  w as eventICS,
  T as exportValue,
  g as noteText,
  h as prepareInvitation
};
