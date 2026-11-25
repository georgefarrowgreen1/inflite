import { createSystemClient as F } from "/roof/system-client.js";
function W(f, A, { contactsOnly: k = !1 } = {}) {
  const P = f.ui, s = P.el, S = F(f, { prefix: "/api/organise/" });
  let L, m = k ? "people" : "notes", a = null, v = null, I = null, l = 0, C = 0, n = !1, g = null;
  const q = new Promise((r) => L = r), p = s("div", { class: "org-list" }), c = s("p", { role: "status" }), i = s("input", { type: "search", maxlength: 160, "aria-label": "Find a linked item", placeholder: "Search titles" }), x = s("select", { "aria-label": "Link from app" });
  for (const [r, o] of [["notes", "Notes"], ["people", "People"], ["calendar", "Calendar"], ["files", "Files"], ["source", "App link"]]) x.append(s("option", { value: r, text: o }));
  const d = (r, o) => P.btn(r, { run: () => Promise.resolve(o()).catch((t) => {
    n || (c.textContent = t.message);
  }) }), w = d("Up a folder", () => {
    v = I, a = null, u();
  }), b = d("Show more", () => u(!0));
  w.hidden = !0, b.hidden = !0;
  function y(r) {
    n || (n = !0, l++, clearTimeout(C), g?.destroy(), L(r), E.now());
  }
  async function u(r = !1) {
    const o = ++l;
    if (!n) {
      if (c.textContent = "Loading\u2026", b.hidden = !0, r || p.replaceChildren(), m === "source") {
        i.hidden = !0, c.textContent = "Paste an InFlite conversation link, or choose an app.";
        const t = s("input", { type: "text", maxlength: 180, placeholder: "/chats/#open=\u2026", "aria-label": "InFlite link" });
        p.append(t, d("Link conversation", () => {
          let e;
          try {
            e = new URL(t.value, location.origin);
          } catch {
            throw Error("Paste a link from InFlite Chats or Mail.");
          }
          const h = /^\/(chats|mail)\/$/.exec(e.pathname), T = /^#(?:open|thread)=([\w-]{1,64})$/.exec(e.hash);
          if (e.origin !== location.origin || e.search || !h || !T || h[1] === "chats" && !e.hash.startsWith("#open=") || h[1] === "mail" && !e.hash.startsWith("#thread=")) throw Error("Paste a conversation link from this InFlite site.");
          y({ app: h[1], id: T[1] });
        }), ...["fitness", "weather", "markets"].map((e) => d("Link " + e[0].toUpperCase() + e.slice(1), () => y({ app: e }))));
        return;
      }
      i.hidden = !1;
      try {
        if (m === "files") {
          if (!g) {
            const e = await import("/roof/files-drive.js");
            if (n || o !== l) return;
            g = e.createDriveClient(f);
          }
          const t = await g.browse({ parentId: v, query: i.value.trim(), view: i.value ? "search" : "folder", cursor: r ? a : null, signal: f.signal, current: () => !n && o === l });
          if (n || o !== l) return;
          I = t.folder?.parentId || null, w.hidden = !v, a = t.cursor;
          for (const e of t.items.filter((h) => h.status === "ready" && !h.trashedAt)) p.append(d(e.kind === "folder" ? "Folder \xB7 " + e.name : e.name, () => {
            e.kind === "folder" ? (v = e.id, i.value = "", u()) : y({ app: "files", id: e.id, title: e.name });
          }));
          c.textContent = t.items.length ? "Choose a file to link." : "No files here.";
        } else {
          const t = await S.request("list", { method: "POST", body: { kind: m, q: i.value.trim(), cursor: r ? a : null } });
          if (n || o !== l) return;
          a = t.cursor;
          for (const e of t.records) p.append(d(e.title, () => y({ app: m, id: e.id, title: e.title })));
          c.textContent = t.records.length ? "Choose an item to link." : "No matching items.";
        }
        b.hidden = !a;
      } catch (t) {
        !n && o === l && (c.textContent = t.message, p.append(d("Try again", () => u())));
      }
    }
  }
  x.addEventListener("change", () => {
    m = x.value, a = v = null, i.value = "", w.hidden = !0, u();
  }), i.addEventListener("input", () => {
    clearTimeout(C), C = setTimeout(() => {
      a = null, u();
    }, 250);
  }), k && (i.setAttribute("aria-label", "Find a contact"), i.placeholder = "Search contacts");
  const E = f.sheet.open({ sheet: "organise-link", title: k ? "Choose a contact" : "Link an item", body: s("div", { class: "org" }, k ? null : x, i, w, c, p, b), onClose() {
    n || (n = !0, l++, clearTimeout(C), g?.destroy(), L(null));
  } });
  return u(), q;
}
export {
  W as chooseLink
};
