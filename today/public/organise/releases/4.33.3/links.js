import { createSystemClient as j } from "/roof/system-client.js";
function z(s, x, { contactsOnly: d = !1, current: y = () => !0 } = {}) {
  const u = s.ui, o = u.el, D = j(s, { prefix: "/api/organise/" });
  let k, i = d ? "people" : "notes", a = null, h = null, w = null, c = 0, S = 0, T = !1, L = null;
  const q = new AbortController(), C = () => !T && D.live() && y();
  if (!C()) return Promise.resolve(null);
  const $ = new Promise((n) => k = n), b = o("div", { class: "org-list" }), p = o("p", { role: "status" }), r = o("input", { type: "search", maxlength: 160, "aria-label": "Find a linked item", placeholder: "Search titles" }), E = o("select", { "aria-label": "Link from app" });
  for (const [n, v] of [["notes", "Notes"], ["people", "People"], ["calendar", "Calendar"], ["files", "Files"], ["source", "App link"]]) E.append(o("option", { value: n, text: v }));
  const f = (n, v) => u.btn(n, { run: () => Promise.resolve().then(() => C() && v()).catch((l) => {
    C() && l.name !== "AbortError" && (p.textContent = l.message);
  }) }), P = f("Up a folder", () => {
    h = w, a = null, m();
  }), I = f("Show more", () => m(!0));
  P.hidden = !0, I.hidden = !0;
  const U = () => {
    N(null), W.now();
  };
  function N(n) {
    if (T) return;
    const v = C() ? n : null;
    T = !0, c++, clearTimeout(S), q.abort(), s.signal.removeEventListener("abort", U), L?.destroy(), k(v);
  }
  function A(n) {
    N(n), W.now();
  }
  async function m(n = !1) {
    const v = ++c, l = () => C() && v === c;
    if (l()) {
      if (p.textContent = "Loading\u2026", I.hidden = !0, n || b.replaceChildren(), i === "source") {
        r.hidden = !0, p.textContent = "Paste an InFlite conversation link, or choose an app.";
        const t = o("input", { type: "text", maxlength: 180, placeholder: "/chats/#open=\u2026", "aria-label": "InFlite link" });
        b.append(t, f("Link conversation", () => {
          let e;
          try {
            e = new URL(t.value, location.origin);
          } catch {
            throw Error("Paste a link from InFlite Chats or Mail.");
          }
          const g = /^\/(chats|mail)\/$/.exec(e.pathname), F = /^#(?:open|thread)=([\w-]{1,64})$/.exec(e.hash);
          if (e.origin !== location.origin || e.search || !g || !F || g[1] === "chats" && !e.hash.startsWith("#open=") || g[1] === "mail" && !e.hash.startsWith("#thread=")) throw Error("Paste a conversation link from this InFlite site.");
          A({ app: g[1], id: F[1] });
        }), ...["fitness", "weather", "markets"].map((e) => f("Link " + e[0].toUpperCase() + e.slice(1), () => A({ app: e }))));
        return;
      }
      r.hidden = !1;
      try {
        if (i === "files") {
          if (!L) {
            const e = await import("/roof/files-drive.js");
            if (!l()) return;
            L = e.createDriveClient(s);
          }
          const t = await L.browse({ parentId: h, query: r.value.trim(), view: r.value ? "search" : "folder", cursor: n ? a : null, signal: q.signal, current: l });
          if (!l()) return;
          w = t.folder?.parentId || null, P.hidden = !h, a = t.cursor;
          for (const e of t.items.filter((g) => g.status === "ready" && !g.trashedAt)) b.append(f(e.kind === "folder" ? "Folder \xB7 " + e.name : e.name, () => {
            e.kind === "folder" ? (h = e.id, r.value = "", m()) : A({ app: "files", id: e.id, title: e.name });
          }));
          p.textContent = t.items.length ? "Choose a file to link." : "No files here.";
        } else {
          const t = await D.request("list", { method: "POST", body: { kind: i, q: r.value.trim(), cursor: n ? a : null }, signal: q.signal, current: l });
          if (!l()) return;
          a = t.cursor;
          for (const e of t.records) b.append(f(e.title, () => A({ app: i, id: e.id, title: e.title })));
          p.textContent = t.records.length ? "Choose an item to link." : "No matching items.";
        }
        I.hidden = !a;
      } catch (t) {
        l() && t.name !== "AbortError" && (p.textContent = t.message, b.append(f("Try again", () => m())));
      }
    }
  }
  E.addEventListener("change", () => {
    i = E.value, a = h = null, r.value = "", P.hidden = !0, m();
  }), r.addEventListener("input", () => {
    clearTimeout(S), S = setTimeout(() => {
      a = null, m();
    }, 250);
  }), d && (r.setAttribute("aria-label", "Find a contact"), r.placeholder = "Search contacts");
  const W = s.sheet.open({ sheet: "organise-link", title: d ? "Choose a contact" : "Link an item", body: o("div", { class: "org" }, d ? null : E, r, P, p, b, I), onClose() {
    N(null);
  } });
  return s.signal.addEventListener("abort", U, { once: !0 }), m(), $;
}
async function _(s, x, { id: d, store: y, current: u }) {
  const o = await z(s, x, { current: u });
  if (!u() || !o) return;
  const { title: D, ...k } = o, i = await y.get(d);
  if (!u()) return;
  if (i.pending) throw Error("Wait for the current save before linking another item.");
  const a = x === "notes" ? ["text", "checklist"] : x === "people" ? ["email", "phone", "organisation", "details"] : ["description", "allDay", "timezone", ...i.allDay ? ["startDate", "endDate"] : ["start", "end"]], h = Object.fromEntries(["title", ...a].map((c) => [c, i[c] ?? ""])), w = i.links || [];
  if (w.length >= 12) throw Error("Link up to twelve items.");
  w.some((c) => c.app === k.app && c.id === k.id) || (await y.save(d, { ...h, links: [...w, k] }, { version: i.version }), u() && s.toast("Linked item saved for syncing"));
}
export {
  z as chooseLink,
  _ as linkItem
};
