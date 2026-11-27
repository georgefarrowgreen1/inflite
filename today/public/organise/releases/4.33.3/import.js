import { operationId as x } from "/roof/system-client.js";
function y(i) {
  if (typeof i != "string" || i.length > 512 * 1024) throw Error("Choose a contacts file smaller than 512 KB.");
  const m = i.replace(/\r\n[ \t]|\n[ \t]/g, "").split(/\r?\n/), c = [];
  let t = null;
  const g = (e) => e.replace(/\\[nN]/g, `
`).replace(/\\([,;\\])/g, "$1");
  for (const e of m) {
    if (/^BEGIN:VCARD$/i.test(e)) {
      t = { title: "", email: "", phone: "", organisation: "", details: "", links: [] };
      continue;
    }
    if (/^END:VCARD$/i.test(e)) {
      if (t?.title.trim() && c.push(t), t = null, c.length > 100) throw Error("Import up to 100 contacts at a time.");
      continue;
    }
    if (!t) continue;
    const s = e.indexOf(":");
    if (s < 0) continue;
    const l = e.slice(0, s), o = l.split(";")[0].replace(/^.*\./, "").toUpperCase(), n = g(e.slice(s + 1));
    if (["FN", "N", "EMAIL", "TEL", "ORG", "NOTE"].includes(o)) {
      if (/ENCODING|CHARSET/i.test(l)) throw Error("Export this file as UTF-8 vCard 3.0 or 4.0, then try again.");
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(n)) throw Error("This file contains unsupported characters.");
      o === "FN" && (t.title = n.trim().slice(0, 160)), o === "N" && !t.title && (t.title = n.split(";").filter(Boolean).reverse().join(" ").trim().slice(0, 160)), o === "EMAIL" && !t.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n) && n.length <= 254 && (t.email = n), o === "TEL" && !t.phone && (t.phone = n.replace(/^tel:/i, "").slice(0, 40)), o === "ORG" && (t.organisation = n.replace(/;/g, " \xB7 ").slice(0, 160)), o === "NOTE" && (t.details = n.slice(0, 4e3));
    }
  }
  if (!c.length) throw Error("No named contacts found. Choose a .vcf contacts file.");
  return c;
}
function N({ F: i, store: m, onImported: c }) {
  const { el: t } = i.ui, g = i.signal;
  let e = [], s = 0, l = !1, o = !1;
  const n = () => !l && !g.aborted, u = t("input", { type: "file", accept: ".vcf,text/vcard,text/x-vcard", "aria-label": "Contacts file" }), f = t("p", { class: "org-status", role: "status" }), v = t("div", { class: "org-import-preview" }), d = i.ui.btn("Import contacts", { primary: !0, run: async () => {
    if (o || !e.length || !n()) return;
    o = !0, u.disabled = !0, d.disabled = !0;
    let a = 0;
    const p = e.length, h = [...e];
    try {
      for (const r of h) {
        if (!n()) break;
        await m.save(x(), r, { version: 0 }), e.shift(), a++, f.textContent = a + " of " + p + " kept";
      }
      n() && (f.textContent = a + " contacts added. Pending changes sync when connected.", e = [], c(), i.toast(a + " contacts added"));
    } catch (r) {
      n() && (f.textContent = r.message + " \xB7 " + a + " contacts were kept. You can retry the remaining contacts.");
    } finally {
      o = !1, n() && (u.disabled = !1, d.disabled = !e.length);
    }
  } });
  d.disabled = !0;
  const C = t("section", { class: "org" }, t("p", { class: "org-muted", text: "Choose a vCard (.vcf) file. Review the contacts, then add them to your private address book." }), t("label", { class: "org-field" }, t("span", { text: "Contacts file" }), u), f, v, d), E = i.sheet.open({ sheet: "people-import", title: "Import contacts", body: C });
  u.addEventListener("change", async () => {
    const a = ++s;
    e = [], v.replaceChildren(), d.disabled = !0;
    const p = u.files?.[0];
    if (p)
      try {
        if (p.size > 512 * 1024) throw Error("Choose a contacts file smaller than 512 KB.");
        const h = await p.text();
        if (!n() || a !== s) return;
        e = y(h), f.textContent = e.length + " contacts ready to import. Existing contacts stay as they are.";
        for (const r of e) v.append(t("div", { class: "org-import-contact" }, i.ui.avatar(r.title), t("span", {}, t("strong", { text: r.title }), t("small", { class: "org-muted", text: r.email || r.phone || r.organisation }))));
        d.disabled = !1;
      } catch (h) {
        n() && a === s && (f.textContent = h.message);
      }
  });
  const b = new MutationObserver(() => {
    C.isConnected || (l = !0, s++, e = [], b.disconnect());
  });
  b.observe(document.body, { childList: !0, subtree: !0 }), g.addEventListener("abort", () => {
    l = !0, s++, e = [], b.disconnect(), E.now();
  }, { once: !0 });
}
export {
  N as openImport,
  y as parseContacts
};
