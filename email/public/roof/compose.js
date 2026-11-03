// Mail's compose under the roof (One roof stage 4, s4/spec S4-D4, S4-D16, S4-D18, §3.1, §4.2; app.js openCompose
// 5889–6542, ported onto a framework sheet). Lazy, kept offline (connector.lazy), so a message can be written offline.
// Frozen: openCompose(ctx, init) → sheet Handle (data-sheet=mail-compose). init = { to, cc, bcc, subject, text,
//   quote: { of, mode } | null, files: [{ ref, filename, type, size } | File], draftId, from, inReplyTo, references }
//   (also taken: snippet, the quoted message's, when the store doesn't hold its Meta). With only a draftId, the draft is
//   asked for (api.draft): its fields, its quote as { of, mode }, or quoteOld (started in Mail on its own: its quoted
//   text is added only when it's sent there; Send asks "Send Without the Quoted Text?" first, Q14).
// Send (data-act=send): the addresses checked, then the sheet closed and ctx.outbox.send(draft, files, onProgress): save,
//   then send after the undo window (S4-D18, MM's outbox). Offline with files: the sheet stays, "Files need a connection.
//   Try Again"; over Mail's 256 KB on this phone: it stays, "Couldn’t keep this on your phone. Try Again when you’re
//   online" (RI8).
// Closing never asks (S4-D18): a changed compose closed any way but Send or Delete Draft has its words written to
//   mail:unsent synchronously in onClose (outbox.keepUnsent), then a server draft (best effort) and "Draft saved".
//   Delete Draft is in the ⋯ menu. While it's open, store.compose is true (busy, S4-D13) and mail:unsent is kept up
//   to date, so flush (C10) has the words.
import { STORAGE, CAP } from "./store.js";
import { MAIL } from "./api.js";

const MAX = 20 * 1024 * 1024;
const LISTS = ["to", "cc", "bcc"];
const titleOf = (c) => c.subject.trim() || (c.quote?.mode === "forward" ? "Forward" : c.quote ? "Reply" : "New Message");
const people = (l) => (Array.isArray(l) ? l : []).filter((p) => p && p.email).map((p) => ({ name: String(p.name || ""), email: String(p.email) }));
// (the words kept on the phone and sent to Mail: never a file's bytes)
export const fieldsOf = (c) => ({ from: c.from, to: c.to, cc: c.cc, bcc: c.bcc, subject: c.subject, text: c.text, quote: c.quote, inReplyTo: c.inReplyTo, references: c.references, draftId: c.draftId });
const sizeOf = (s) => (typeof s === "string" ? s.length * 2 : 0);
// (whether these words fit beside what Mail already keeps on this phone: all mail:* at most CAP)
export function fits(fields) {
  let n = sizeOf(JSON.stringify(fields));
  try { for (const k of Object.values(STORAGE)) if (k !== STORAGE.unsent) n += sizeOf(localStorage.getItem(k)); } catch (_) {}
  return n <= CAP;
}
const b64 = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => no(r.error); r.readAsDataURL(file); });
// a draft's files for Mail: a file picked, its bytes; one forwarded, its ref; one kept with the draft, as Mail gave it
async function draftFiles(files) {
  const out = [];
  for (const f of files) {
    if (typeof File !== "undefined" && f instanceof File) out.push({ filename: f.name, type: f.type || "application/octet-stream", size: f.size, content: await b64(f) });
    else if (f.ref) out.push({ ref: f.ref });
    else if (f.i != null) out.push({ i: f.i });
  }
  return out;
}

export function openCompose(ctx, init = {}) {
  const { fw, api, store, logic } = ctx, ui = fw.ui, el = ui.el;
  const me = store.get().me || {};
  const sigFor = (from) => (me.addresses || []).find((a) => a.email === String(from || "").toLowerCase())?.signature || me.signature || "";
  const c = {
    from: init.from || me.defaultFrom || "", to: people(init.to), cc: people(init.cc), bcc: people(init.bcc),
    subject: String(init.subject || ""), text: String(init.text || ""), quote: init.quote?.of ? { of: String(init.quote.of), mode: init.quote.mode } : null,
    inReplyTo: init.inReplyTo || null, references: init.references || null, draftId: init.draftId || null,
    files: (init.files || []).slice(), quoteOld: !!init.quoteOld,
  };
  const loading = !!c.draftId && !init.to && !init.subject && !init.text;
  if (!c.draftId && !c.text) { const s = sigFor(c.from); if (s) c.text = `\n\n${s}`; }
  let snap = JSON.stringify([fieldsOf(c), c.files.length]), ended = null, keepT = 0, h = null;
  const dirty = () => JSON.stringify([fieldsOf(c), c.files.length]) !== snap;
  const EMAIL_RE = logic.EMAIL_RE || /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ---- To, Cc, Bcc: each person a chip; what's typed made one at a comma, Return or on leaving; suggestions by POST
  const fields = {};
  const sugg = el("div", { class: "mc-sugg", role: "listbox", "aria-label": "Suggestions" });
  let asked = 0, suggFor = null;
  function tokens(key, label) {
    const box = el("div", { class: "mc-chips" });
    const input = el("input", { type: "email", inputmode: "email", autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "next", "aria-label": label, data: { key } });
    const draw = () => box.replaceChildren(...c[key].map((p, i) => {
      const b = el("button", { type: "button", class: `mc-chip${EMAIL_RE.test(p.email) ? "" : " bad"}`, "aria-label": `Remove ${p.name || p.email}`, title: p.email, text: p.name || p.email });
      b.addEventListener("click", () => { c[key].splice(i, 1); draw(); changed(); });
      return b;
    }), input);
    const commit = () => {
      const parts = input.value.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return false;
      for (const s of parts) { const p = logic.parseAddress?.(s) || { name: "", email: s }; c[key].push({ name: p.name || "", email: p.email || s }); }
      input.value = ""; draw(); changed(); clear();
      return true;
    };
    input.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === "," || e.key === ";") && commit()) e.preventDefault();
      else if (e.key === "Backspace" && !input.value && c[key].length) { c[key].pop(); draw(); changed(); }
    });
    input.addEventListener("input", () => { if (/[,;]/.test(input.value)) commit(); else suggest(key, input.value.trim()); });
    input.addEventListener("blur", () => setTimeout(() => { if (!sugg.contains(document.activeElement)) commit(); }, 150));
    draw();
    fields[key] = { input, draw, commit };
    return el("label", { class: "mc-row", data: { k: key } }, el("span", { class: "mc-k", text: `${label}:` }), box);
  }
  const clear = () => { suggFor = null; sugg.replaceChildren(); };
  let suggT = 0;
  function suggest(key, q) {
    clearTimeout(suggT);
    if (!q || !api.findContacts) return clear();
    suggT = setTimeout(async () => {
      const n = ++asked;
      try {
        const { contacts = [] } = await api.findContacts(q);
        if (n !== asked) return;
        const taken = new Set(LISTS.flatMap((k) => c[k].map((p) => p.email.toLowerCase())));
        suggFor = key;
        sugg.replaceChildren(...contacts.filter((p) => p?.email && !taken.has(p.email.toLowerCase())).slice(0, 5).map((p) => {
          const b = el("button", { type: "button", role: "option", class: "mc-opt" }, ui.avatar(p.name || p.email), el("span", {}, el("b", { text: p.name || p.email }), p.name ? el("small", { text: p.email }) : null));
          b.addEventListener("pointerdown", (e) => e.preventDefault());
          b.addEventListener("click", () => { c[suggFor].push({ name: p.name || "", email: p.email }); fields[suggFor].input.value = ""; fields[suggFor].draw(); fields[suggFor].input.focus(); clear(); changed(); });
          return b;
        }));
      } catch (_) {}
    }, 160);
  }

  // ---- the rest of the sheet
  const ids = me.identities || [];
  const from = ids.length > 1 ? el("select", { class: "mc-from", "aria-label": "From" }, ids.map((a) => el("option", { value: a, text: a }))) : null;
  if (from) {
    from.value = c.from;
    from.addEventListener("change", () => {
      const was = sigFor(c.from), next = sigFor(from.value);
      if (was !== next && (!was || c.text.endsWith(`\n\n${was}`))) { c.text = (was ? c.text.slice(0, -was.length - 2) : c.text.trimEnd()) + (next ? `\n\n${next}` : ""); text.value = c.text; }
      c.from = from.value; changed();
    });
  }
  const ccRow = el("div", { class: "mc-cc" }, tokens("cc", "Cc"), tokens("bcc", "Bcc"));
  ccRow.hidden = !(c.cc.length || c.bcc.length);
  const subject = el("input", { type: "text", class: "mc-subject", placeholder: "Subject", autocomplete: "off", enterkeyhint: "next", "aria-label": "Subject", data: { key: "subject" } });
  subject.value = c.subject;
  subject.addEventListener("input", () => { c.subject = subject.value; changed(); });
  const text = el("textarea", { class: "mc-text", placeholder: "Message", "aria-label": "Message", data: { key: "text" } });
  text.value = c.text;
  text.addEventListener("input", () => { c.text = text.value; changed(); });
  const filesEl = el("div", { class: "mc-files" });
  const drawFiles = () => filesEl.replaceChildren(...c.files.map((f, i) => {
    const name = f.name || f.filename || "File";
    const x = el("button", { type: "button", class: "mc-file", "aria-label": `Remove ${name}` }, ctx.icon("attachment"), el("span", { text: name }));
    x.addEventListener("click", () => { c.files.splice(i, 1); drawFiles(); changed(); });
    return x;
  }));
  const pick = el("input", { type: "file", multiple: true, class: "vh", "aria-label": "Add Files", tabindex: "-1" });
  pick.addEventListener("change", () => {
    for (const f of pick.files) {
      if (c.files.reduce((n, x) => n + (x.size || 0), 0) + f.size > MAX) { fw.toast("Files are limited to 20 MB"); break; }
      c.files.push(f);
    }
    pick.value = ""; drawFiles(); changed();
  });
  const snippetOf = () => (c.quote && (store.get().thread?.metas?.[c.quote.of]?.snippet || init.snippet)) || "";
  const quoteEl = el("div", { class: "mc-quote" });
  const drawQuote = () => {
    quoteEl.hidden = !c.quote && !c.quoteOld;
    if (c.quoteOld) quoteEl.replaceChildren(el("p", { text: "This draft was started in Mail on its own. Its quoted text is added only when you send it there." }), ui.btn("Open Mail", { small: true, href: `${MAIL}/`, act: "open-mail" }));
    else if (c.quote) quoteEl.replaceChildren(el("b", { class: "mc-qk", text: "Quoted below" }), el("p", { class: "mc-qs", text: snippetOf() }));
    const a = quoteEl.querySelector("a");
    a?.setAttribute("target", "_blank");
    a?.setAttribute("rel", "noopener");
  };
  const more = el("div", { class: "mc-more" });
  more.hidden = true;
  more.append(ui.btn("Delete Draft", { destructive: true, small: true, act: "delete-draft", run: () => end("delete") }));
  const moreBtn = ui.iconBtn("more", { label: "More", act: "more", run: () => { more.hidden = !more.hidden; } });
  const tools = el("div", { class: "mc-tools" },
    ui.btn("Cc/Bcc", { small: true, act: "cc", run: () => { ccRow.hidden = !ccRow.hidden; if (!ccRow.hidden) fields.cc.input.focus(); } }),
    ui.btn("Add Files", { small: true, act: "files", run: () => pick.click() }),
    moreBtn);
  moreBtn.replaceChildren(ctx.icon("more"));
  const body = el("div", { class: "mc" }, el("div", { class: "mc-head" }, tokens("to", "To"), from), sugg, ccRow, subject, text, filesEl, quoteEl, tools, more, pick);
  drawFiles(); drawQuote();
  ccRow.after(sugg);

  function changed() {
    if (ended) return;
    const t = h?.el.querySelector(".ifs-head h2");
    if (t) t.textContent = titleOf(c);
    clearTimeout(keepT);
    keepT = setTimeout(() => { if (!ended && dirty()) ctx.outbox.keepUnsent(fieldsOf(c)); }, 800);
  }

  // ---- closing: Send, Delete Draft, or any other way (kept, S4-D18)
  function end(how) {
    ended = how;
    h.close();
  }
  function closed() {
    clearTimeout(keepT); clearTimeout(suggT);
    store.set({ compose: false }, "compose");
    if (ended === "send") return;
    if (ended === "delete") {
      ctx.outbox.dropUnsent();
      if (c.draftId) api.remove(c.draftId).catch(() => {});
      return;
    }
    ended = "close";
    for (const k of LISTS) fields[k].commit();
    clearTimeout(keepT);
    if (!dirty()) { if (!c.draftId) ctx.outbox.dropUnsent(); return; }
    const f = fieldsOf(c);
    const kept = ctx.outbox.keepUnsent(f);
    (async () => {
      const { id } = await api.saveDraft({ id: c.draftId || undefined, from: c.from, to: c.to, cc: c.cc, bcc: c.bcc, subject: c.subject, text: c.text, inReplyTo: c.inReplyTo, references: c.references, quote: c.quote, attachments: await draftFiles(c.files) });
      if (id) c.draftId = id;
      ctx.outbox.dropUnsent();
      fw.toast("Draft saved");
    })().catch(() => fw.toast(kept ? "Kept on this phone. It’s saved to Mail when you’re back online." : "Couldn’t keep this on your phone. Try Again when you’re online"));
  }

  async function send() {
    for (const k of LISTS) fields[k].commit();
    const all = LISTS.flatMap((k) => c[k]), bad = all.find((p) => !EMAIL_RE.test(p.email));
    if (!all.length || bad) return fw.toast(bad ? `“${bad.email}” isn’t a valid address` : "Add a recipient");
    if (!c.subject.trim() && !(await ctx.open.confirm({ title: "No Subject", text: "This message has no subject.", yes: "Send Anyway", no: "Cancel" }))) return subject.focus();
    if (c.quoteOld && !(await ctx.open.confirm({ title: "Send Without the Quoted Text?", text: "This draft was started in Mail on its own. Sent from here, it goes without the message it quotes.", yes: "Send", no: "Cancel" }))) return;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (offline && c.files.length) return fw.toast("Files need a connection. Try Again");
    const f = fieldsOf(c);
    if (offline && !fits(f)) return fw.toast("Couldn’t keep this on your phone. Try Again when you’re online");
    ctx.outbox.dropUnsent();
    end("send");
    return ctx.outbox.send(f, c.files.slice(), init.onProgress);
  }

  h = fw.sheet.open({
    sheet: "mail-compose", title: titleOf(c), body,
    acts: [{ label: "Send", primary: true, act: "send", run: () => send() }],
    focus: c.to.length ? text : fields.to.input,
    onClose: closed,
  });
  store.set({ compose: true }, "compose");

  // a draft opened from Drafts: its fields from Mail (drafts only; no body of anyone else's, §3.1)
  if (loading) {
    h.setBusy(true);
    api.draft(c.draftId).then(({ compose: d = {}, quoteOld }) => {
      if (ended) return;
      Object.assign(c, { from: d.from || c.from, to: people(d.to), cc: people(d.cc), bcc: people(d.bcc), subject: String(d.subject || ""), text: String(d.text || ""), inReplyTo: d.inReplyTo || null, references: d.references || null,
        quote: d.quote?.of ? { of: String(d.quote.of), mode: d.quote.mode } : null, quoteOld: !!quoteOld, files: Array.isArray(d.files) ? d.files.slice() : [] });
      for (const k of LISTS) fields[k].draw();
      ccRow.hidden = !(c.cc.length || c.bcc.length);
      subject.value = c.subject; text.value = c.text; if (from) from.value = c.from;
      drawFiles(); drawQuote(); changed();
      snap = JSON.stringify([fieldsOf(c), c.files.length]);
      h.setBusy(false);
    }, () => { if (!ended) { h.setBusy(false); fw.toast("Couldn’t open that draft. Try again in a moment."); } });
  }
  return h;
}
