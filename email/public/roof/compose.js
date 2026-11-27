// Mail's compose under the roof (One roof stage 4, s4/spec S4-D4, S4-D16, S4-D18, §3.1, §4.2; app.js openCompose
// 5889–6542, ported onto a framework sheet). Lazy, kept offline (connector.lazy), so a message can be written offline.
// Frozen: openCompose(ctx, init) → sheet Handle (data-sheet=mail-compose). init = { to, cc, bcc, subject, text,
//   quote: { of, mode } | null, files: [{ ref, filename, type, size } | File], draftId, from, inReplyTo, references }
//   (also taken: snippet, the quoted message's, when the store doesn't hold its Meta). With only a draftId, the draft is
//   asked for (api.draft): its fields, its quote as { of, mode }, or quoteOld (started in Mail on its own: its quoted
//   text is added only when it's sent there; Send asks "Send Without the Quoted Text?" first, Q14).
// Send (data-act=send): the addresses checked, then ctx.outbox.send(draft, files, onProgress) (MM's outbox: save, then
//   send after the undo window, S4-D18) with the sheet up showing the upload's progress; closed once the outbox has it,
//   kept open with its words on { ok: false }. Offline with files: the sheet stays, "Files need a connection.
//   Try Again"; over Mail's 256 KB on this phone: it stays, "Couldn’t keep this on your phone. Try Again when you’re
//   online" (RI8).
// Closing never asks (S4-D18): a changed compose closed any way but Send or Delete Draft has its words written to
//   mail:unsent synchronously in onClose (outbox.keepUnsent), then a server draft (best effort, keepalive when it has
//   no file's bytes) and "Draft saved". Closed while Send is uploading: left to the outbox (no second draft). Delete
//   Draft is in the ⋯ menu. While it's open, store.compose is true (busy, S4-D13), mail:unsent is kept up to date and
//   the outbox tracks it (outbox.track), so flush (C10) saves it and hands its draft's id back; unchanged since then,
//   closing saves nothing again (sign-out: nothing written after Mail's keys are cleared).
// Words kept on this phone (mail:unsent) are dropped only once Mail has them: never by a compose closed unchanged.
//   An earlier compose's words still there when one opens are saved to Mail first (online), else reopened in a new
//   blank compose; a compose opened for something else meanwhile never writes over them. A close save that failed is
//   tried again on "online". A draft's own files ({ i }, from api.draft) are listed with every save, so it keeps them.
// A quoteOld draft: its quote key is left out of every save here (Mail keeps the quote it has); only Send, after
//   "Send Without the Quoted Text?", sends quote: null.
import { STORAGE, CAP } from "./store.js";
import { MAIL, MAIL_PAGE } from "./api.js";

const MAX = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 20; // Matches the draft and send API limit.
const TOO_MANY_FILES = `You can attach ${MAX_ATTACHMENTS} files at most.`;
const LISTS = ["to", "cc", "bcc"];
const titleOf = (c) => c.quote?.mode === "forward" ? "Forward" : c.quote ? "Reply" : "New message";
const people = (l) => (Array.isArray(l) ? l : []).filter((p) => p && p.email).map((p) => ({ name: String(p.name || ""), email: String(p.email) }));
// (the words kept on the phone and sent to Mail: never a file's bytes)
export const fieldsOf = (c) => ({ ...(c.followUpAt && {followUpAt:c.followUpAt}), from: c.from, to: c.to?.slice(), cc: c.cc?.slice(), bcc: c.bcc?.slice(), subject: c.subject, text: c.text, quote: c.quote, inReplyTo: c.inReplyTo, references: c.references, draftId: c.draftId, draftRevision: c.draftRevision, quoteOld: !!c.quoteOld });
// (words worth keeping: someone to send to, a subject or a message)
export const hasWords = (u) => !!u && !!(u.subject || String(u.text || "").trim() || [u.to, u.cc, u.bcc].some((l) => Array.isArray(l) && l.length));
const online = () => typeof navigator === "undefined" || navigator.onLine !== false;
// (which copy mail:unsent holds: its time, as the outbox stamps it)
const stamp = (u) => (u ? u.at ?? JSON.stringify(u) : null);
const isFile = (f) => typeof File !== "undefined" && f instanceof File;
// (a draft for Mail from kept words: a quote only when it's { of, mode }; none, or quoteOld, leaves the key out, so Mail
// keeps the quote the draft has; a missing key and none are the same for a new draft)
export const draftOf = (f, attachments) => ({ id: f.draftId || undefined, draftRevision: f.draftRevision || undefined, followUpAt:f.followUpAt || null, from: f.from, to: f.to || [], cc: f.cc || [], bcc: f.bcc || [], subject: f.subject || "", text: f.text || "", inReplyTo: f.inReplyTo || null, references: f.references || null, ...(f.quote?.of && !f.quoteOld && { quote: { of: f.quote.of, mode: f.quote.mode } }), attachments });
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
    if (isFile(f)) out.push({ filename: f.name, type: f.type || "application/octet-stream", size: f.size, content: await b64(f) });
    else if (f?.draftFile) out.push({ draftFile: f.draftFile });
    else if (f?.ref) out.push({ ref: f.ref });
    else throw new Error("Reopen the draft to review its attachments.");
  }
  return out;
}

// ---- words left on this phone (mail:unsent): one save at a time, after any close save still going; dropped only if
// what's there is still what was saved
const recoveries = new WeakMap();
function recoveryFor(ctx) {
  if (!recoveries.has(ctx)) recoveries.set(ctx, { closing: null, leftJob: null, armed: false });
  return recoveries.get(ctx);
}
function saveLeft(ctx) {
  const state = recoveryFor(ctx);
  if (state.leftJob) return state.leftJob;
  state.leftJob = (async () => {
    await state.closing?.catch(() => {});
    if (ctx.fw.signal?.aborted) return false;
    const u = ctx.outbox.unsent();
    if (!hasWords(u)) return true;
    if (!online()) return false;
    try {
      // The local copy has words only. Keep the attachments from its original saved version.
      const draft = { ...draftOf(u, []), ...(u.draftId && { keepAttachments: true }) };
      if (ctx.fw.signal?.aborted) return false;
      const saved = await ctx.api.saveDraft(draft, null);
      if (!saved?.id || ctx.fw.signal?.aborted) return false;
      if (stamp(ctx.outbox.unsent()) === stamp(u)) ctx.outbox.dropUnsent();
      ctx.fw.toast("Your unsent message is in Drafts");
      return true;
    } catch (_) { return false; }
  })().finally(() => { state.leftJob = null; });
  return state.leftJob;
}
// (kept here after a save that failed: tried again when the connection's back)
function retryOnline(ctx) {
  const state = recoveryFor(ctx), signal = ctx.fw.signal;
  if (state.armed || signal?.aborted || typeof addEventListener !== "function") return;
  state.armed = true;
  const clear = () => {
    removeEventListener("online", go);
    signal?.removeEventListener("abort", clear);
    state.armed = false;
  };
  const go = () => { clear(); saveLeft(ctx); };
  signal?.addEventListener("abort", clear, { once: true });
  addEventListener("online", go, { once: true });
}

export function openCompose(ctx, init = {}) {
  const { fw, api, store, logic } = ctx, ui = fw.ui, el = ui.el;
  const restoring = init.restoreLocal === true;
  if (restoring) init = { ...(ctx.outbox.unsent() || {}), restoreLocal: true };
  const me = store.get().me || {}, owner = fw.session.user.id, fileDialog = new AbortController();
  const sigFor = (from) => (me.addresses || []).find((a) => a.email === String(from || "").toLowerCase())?.signature || me.signature || "";
  const c = {
    followUpAt:init.followUpAt || null, from: init.from || me.defaultFrom || "", to: people(init.to), cc: people(init.cc), bcc: people(init.bcc),
    subject: String(init.subject || ""), text: String(init.text || ""), quote: init.quote?.of ? { of: String(init.quote.of), mode: init.quote.mode } : null,
    inReplyTo: init.inReplyTo || null, references: init.references || null, draftId: init.draftId || null, draftRevision: init.draftRevision || null,
    files: (init.files || []).slice(), quoteOld: !!init.quoteOld,
  };
  const loading = !restoring && !!c.draftId && !init.to && !init.cc && !init.bcc && !init.subject && !init.text;
  const blank = !c.draftId && !c.quote && !c.quoteOld && !c.subject && !c.text && !c.files.length && !LISTS.some((k) => c[k].length);
  if (!c.draftId && (!c.text || init.quickSelection)) { const s = sigFor(c.from); if (s) c.text += `\n\n${s}`; }
  const sigOf = (draft = c) => JSON.stringify([fieldsOf(draft), draft.files.map((f) => (isFile(f) ? `${f.name}:${f.size}` : f?.draftFile || f?.ref))]);
  let snap = init.quickSelection && init.text ? null : sigOf(), saved = null, ended = null, keepT = 0, h = null, sending = false, wrote = false, off = null;
  const dirty = () => sigOf() !== snap;
  // (an earlier compose's words still only on this phone: this one never writes over them while they're there)
  let leftAt = null;
  const held = () => leftAt != null && stamp(ctx.outbox.unsent()) === leftAt;
  // (reopened from this phone's copy of a draft: the draft's own files not known yet, so listed from Mail before any save)
  let unknown = false;
  async function filesReady() {
    if (!unknown || !c.draftId) return;
    const draft = await api.draft(c.draftId);
    if (!c.draftRevision || draft?.revision !== c.draftRevision) {
      throw Object.assign(new Error("This draft changed in another window. Reopen it to review its latest version."), { status: 409 });
    }
    const got = draft.compose?.files;
    if (!Array.isArray(got)) throw new Error("Missing draft attachments");
    if (!unknown) return;
    unknown = false;
    c.files = [...got, ...c.files];
    if (!ended) drawFiles();
  }
  let quickOwned = init.onQuickOwned;
  const claimQuick = () => { quickOwned?.(); quickOwned = null; };
  const keep = () => { if (held()) return false; const k = ctx.outbox.keepUnsent(fieldsOf(c)); if (k) { wrote = true; claimQuick(); } return k; };
  const EMAIL_RE = logic.EMAIL_RE || /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ---- To, Cc, Bcc: each person a chip; what's typed made one at a comma, Return or on leaving; suggestions by POST
  const fields = {};
  const sugg = el("div", { class: "mc-sugg", role: "listbox", "aria-label": "Suggestions" });
  let asked = 0, suggFor = null;
  const recipientDetails = el("div", { class: "mc-recipient-details", hidden: true, tabindex: "-1", role: "group", "aria-label": "Recipient details" });
  let activeRecipient = null;
  function closeRecipient() {
    activeRecipient?.setAttribute("aria-expanded", "false");
    activeRecipient = null;
    recipientDetails.hidden = true;
    recipientDetails.replaceChildren();
  }
  recipientDetails.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    activeRecipient?.focus({ preventScroll: true });
    closeRecipient();
  });
  function tokens(key, label) {
    const box = el("div", { class: "mc-chips" });
    const input = el("input", { type: "email", inputmode: "email", autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "next", "aria-label": label, data: { key } });
    // Keep the input mounted so committing an address retains the keyboard.
    const chips = new Map();
    box.append(input);
    const draw = () => {
      input.placeholder = c[key].length ? " " : "Name or email";
      for (const [p, node] of chips) if (!c[key].includes(p)) {
        if (activeRecipient === node) closeRecipient();
        node.remove();
        chips.delete(p);
      }
      let previous = null;
      for (const p of c[key]) {
        let node = chips.get(p);
        if (!node) {
          const valid = EMAIL_RE.test(p.email);
          node = el("button", { type: "button", class: valid ? "mc-chip" : "mc-chip bad", "aria-expanded": "false", title: p.email },
            ctx.icon(valid ? "recipient" : "invalid-address"), el("span", { text: p.name || p.email }));
          node.addEventListener("click", () => {
            const alreadyOpen = activeRecipient === node;
            closeRecipient();
            if (alreadyOpen) return;
            activeRecipient = node;
            node.setAttribute("aria-expanded", "true");
            const remove = ui.iconBtn("trash", { label: `Remove ${p.email}`, run: () => {
              const i = c[key].indexOf(p);
              if (i < 0) return;
              c[key].splice(i, 1);
              draw();
              changed();
              input.focus({ preventScroll: true });
            } });
            remove.replaceChildren(ctx.icon("trash"));
            recipientDetails.replaceChildren(el("span", {}, el("small", { text: valid ? "Email address" : "Invalid address" }), el("b", { text: p.email })), remove);
            row.after(recipientDetails);
            recipientDetails.hidden = false;
            recipientDetails.focus({ preventScroll: true });
          });
          chips.set(p, node);
          if (previous) previous.after(node); else box.prepend(node);
        }
        previous = node;
      }
    };
    // (all: at a comma, Return or Send, everything typed; on leaving the field, only whole addresses, so a name half
    // typed stays as it was typed, not a red chip of a letter or two)
    const commit = (all = true) => {
      const parts = input.value.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean), left = [];
      let made = 0;
      for (const s of parts) {
        const p = logic.parseAddress?.(s) || { name: "", email: s }, email = p.email || s;
        if (!all && !EMAIL_RE.test(email)) { left.push(s); continue; }
        c[key].push({ name: p.name || "", email }); made++;
      }
      if (!made) return false;
      input.value = left.join(", "); draw(); changed(); clear();
      return true;
    };
    input.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if ((e.key === "Enter" || e.key === "," || e.key === ";") && commit()) e.preventDefault();
      else if (e.key === "Enter" && !input.value.trim()) {
        e.preventDefault();
        const next = key === "cc" ? fields.bcc.input : key === "to" && !ccRow.hidden ? fields.cc.input : subject;
        next.focus();
      }
      else if (e.key === "Backspace" && !input.value && c[key].length) { c[key].pop(); draw(); changed(); }
    });
    input.addEventListener("input", () => { if (/[,;]/.test(input.value)) commit(); else suggest(key, input.value.trim()); });
    input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== input && !sugg.contains(document.activeElement)) { commit(false); if (suggFor === key) clear(); } }, 150));
    draw();
    fields[key] = { input, draw, commit };
    const caption = el("span", { class: "mc-k", text: label });
    const row = el("div", { class: "mc-row", data: { k: key } }, caption, box);
    row.addEventListener("click", (e) => { if (e.target === row || e.target === caption || e.target === box) input.focus({ preventScroll: true }); });
    return row;
  }
  let suggT = 0;
  const clear = () => { asked++; clearTimeout(suggT); suggFor = null; sugg.replaceChildren(); };
  function suggest(key, q) {
    clear();
    if (!q || !api.findContacts) return;
    const n = asked;
    suggT = setTimeout(async () => {
      try {
        const { contacts = [] } = await api.findContacts(q);
        if (n !== asked || ended || fw.signal?.aborted || fields[key].input.value.trim() !== q || document.activeElement !== fields[key].input) return;
        const taken = new Set(LISTS.flatMap((k) => c[k].map((p) => p.email.toLowerCase())));
        suggFor = key;
        sugg.replaceChildren(...contacts.filter((p) => p?.email && !taken.has(p.email.toLowerCase())).slice(0, 5).map((p) => {
          const b = el("button", { type: "button", role: "option", class: "mc-opt" }, ui.avatar(p.name || p.email), el("span", {}, el("b", { text: p.name || p.email }), p.name ? el("small", { text: p.email }) : null));
          b.addEventListener("pointerdown", (e) => e.preventDefault());
          b.addEventListener("click", () => { if (suggFor !== key) return; c[key].push({ name: p.name || "", email: p.email }); fields[key].input.value = ""; fields[key].draw(); fields[key].input.focus(); clear(); changed(); });
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
      if (was !== next && (!was || c.text.endsWith(`\n\n${was}`))) { c.text = (was ? c.text.slice(0, -was.length - 2) : c.text.trimEnd()) + (next ? `\n\n${next}` : ""); }
      c.from = from.value; showText(); changed();
    });
  }
  const ccRow = el("div", { class: "mc-cc" }, tokens("cc", "Cc"), tokens("bcc", "Bcc"));
  ccRow.hidden = !(c.cc.length || c.bcc.length);
  const subject = el("input", { type: "text", class: "mc-subject", placeholder: "Add a subject", autocomplete: "off", enterkeyhint: "next", "aria-label": "Subject", data: { key: "subject" } });
  subject.value = c.subject;
  subject.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); text.focus(); }
  });
  subject.addEventListener("input", () => { c.subject = subject.value; changed(); });
  const text = el("textarea", { class: "mc-text", placeholder: "Write your message…", "aria-label": "Message", data: { key: "text" } });
  let signatureTail = "";
  const signature = el("button", { type: "button", class: "mc-signature", "aria-label": "Edit signature in this message" });
  const signatureName = el("strong");
  const footer = el("div", { class:"mc-signoff" }, signatureName,
    el("small", {}, "Sent with InFlite", el("img", { src:"/icon-192.png", alt:"", width:17, height:17 })),
    signature);
  function drawSignOff() {
    const name = me.addresses?.find(a => a.email === c.from)?.name || me.displayName || "";
    signatureName.textContent = name || c.from;
  }
  signature.addEventListener("click", () => {
    const start = text.value.length + 2;
    signatureTail = "";
    signature.hidden = true;
    drawSignOff();
    text.value = c.text;
    text.focus();
    text.setSelectionRange(start, c.text.length);
  });
  function showText() {
    const current = sigFor(c.from);
    signatureTail = current && c.text.endsWith("\n\n" + current) ? "\n\n" + current : "";
    text.value = signatureTail ? c.text.slice(0, -signatureTail.length) : c.text;
    signature.textContent = current;
    signature.setAttribute("aria-description", current);
    signature.hidden = !signatureTail;
    drawSignOff();
  }
  function editText() { c.text = text.value + signatureTail; changed(); }
  showText();
  text.addEventListener("input", editText);
  const filesEl = el("div", { class: "mc-files" });
  const drawFiles = () => filesEl.replaceChildren(...c.files.map((f, i) => {
    const name = f.name || f.filename || "File";
    const x = el("button", { type: "button", class: "mc-file", "aria-label": `Remove ${name}` }, ctx.icon("attachment"), el("span", { text: name }));
    x.addEventListener("click", () => { c.files.splice(i, 1); drawFiles(); changed(); });
    if (isFile(f) && /\.vcf$/i.test(name)) {
      const edit = ui.btn("Edit shared details", {small:true,run:()=>openCards(edit,f)});
      const identity=el("span",{class:"mail-card-identity"},ctx.icon("recipient"),el("span",{},el("small",{text:"Contact card"}),el("strong",{text:name.replace(/\.vcf$/i,"")}),el("small",{text:f.contactSummary||name})));
      x.textContent="Remove";
      return el("div",{class:"mail-vcard"},identity,el("div",{class:"mail-card-actions"},edit,x));
    }
    return x;
  }));
  function addFiles(files, replaced = null) {
    const i = replaced ? c.files.indexOf(replaced) : -1;
    if (replaced && i < 0) return;
    if (i < 0 && c.files.length + files.length > MAX_ATTACHMENTS) throw new Error(TOO_MANY_FILES);
    if (files.some((file) => !isFile(file))) throw new Error("Those files couldn’t attach.");
    const next = c.files.slice();
    if (i >= 0) next.splice(i, 1, ...files);
    else next.push(...files);
    if (next.reduce((n, file) => n + (file.size || 0), 0) > MAX) throw new Error("Files are limited to 20 MB");
    c.files = next;
    drawFiles(); changed();
  }
  const pick = el("input", { type: "file", multiple: true, hidden: true, "aria-label": "Add Files", tabindex: "-1" });
  pick.addEventListener("change", () => {
    try { if (pick.files.length) addFiles([...pick.files]); }
    catch (error) { fw.toast(error.message); }
    finally { pick.value = ""; }
  });
  const snippetOf = () => (c.quote && (store.get().thread?.metas?.[c.quote.of]?.snippet || init.snippet)) || "";
  const quoteEl = el("div", { class: "mc-quote" });
  const drawQuote = () => {
    quoteEl.hidden = !c.quote && !c.quoteOld;
    if (c.quoteOld) quoteEl.replaceChildren(el("p", { text: "This draft was started in Mail on its own. Its quoted text is added only when you send it there." }), ui.btn("Open Mail", { small: true, href: `${MAIL_PAGE}/`, act: "open-mail" }));
    else if (c.quote) {
      const meta = store.get().thread?.metas?.[c.quote.of];
      const sender = meta?.from?.name || meta?.from?.email || "Original message";
      quoteEl.replaceChildren(el("details", {}, el("summary", {}, ui.avatar(sender), el("span", {}, el("b", { text: sender }), el("small", { text: snippetOf() || "Quoted message" }))), el("b", { class: "mc-qk", text: "Quoted below" }), el("p", { text: snippetOf() || "Original message included when sent." })));
    }
    const a = quoteEl.querySelector("a");
    a?.setAttribute("target", "_blank");
    a?.setAttribute("rel", "noopener");
  };
  const due = el("input", { type: "datetime-local", "aria-label": "Follow up in People if unanswered" });
  const clearDue = ui.btn("Clear", { small: true, label: "Clear follow-up time", run: () => {
    c.followUpAt = null;
    drawDue();
    changed();
    showFollowUp(false);
    followButton.focus();
  } });
  const follow = el("div", { class: "mc-time", hidden: true }, due, clearDue);
  const followButton = ui.iconBtn("later", { label: "Follow up if unanswered", act: "more", run: () => showFollowUp(follow.hidden) });
  followButton.replaceChildren(ctx.icon("later"));
  followButton.setAttribute("aria-expanded", "false");
  function showFollowUp(open) {
    follow.hidden = !open;
    followButton.setAttribute("aria-expanded", String(open));
    if (open) {
      formatting.hidden = true;
      formatButton.setAttribute("aria-expanded", "false");
      due.focus();
    }
  }
  const weekdays = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  let suggestedAt = null;
  const followHint = ui.btn("", {small:true, run:() => {
    if (!suggestedAt) return;
    c.followUpAt = suggestedAt;
    drawDue();
    changed();
    showFollowUp(true);
  }});
  followHint.hidden = true;
  function suggestFollowUp() {
    // An explicit deadline offers one local time. The user can edit it before sending.
    const mentions = [...text.value.matchAll(/\bby (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi)];
    followHint.hidden = !!c.followUpAt || mentions.length !== 1;
    suggestedAt = null;
    if (followHint.hidden) return;
    const target = weekdays.findIndex(name => name.toLowerCase() === mentions[0][1].toLowerCase());
    const date = new Date();
    date.setHours(17,0,0,0);
    date.setDate(date.getDate() + (target - date.getDay() + 7) % 7);
    if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 7);
    suggestedAt = date.getTime();
    followHint.textContent = "Follow up " + date.toLocaleString(undefined,{weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}) + " if unanswered";
  }
  const drawDue = () => {
    const d = new Date(c.followUpAt);
    const label = c.followUpAt ? "Follow up if unanswered, " + d.toLocaleString(undefined, {dateStyle: "medium", timeStyle: "short"}) : "Follow up if unanswered";
    followButton.title = label;
    followButton.setAttribute("aria-label", label);
    followButton.classList.toggle("scheduled", !!c.followUpAt);
    clearDue.hidden = !c.followUpAt;
    due.value = c.followUpAt ? new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16) : "";
  };
  drawDue();
  due.addEventListener("change",()=>{
    const at = new Date(due.value).getTime();
    if (due.value && (!(at > Date.now()) || at > Date.now()+366*86400000)) { drawDue(); fw.toast("Choose a future time within a year"); return; }
    c.followUpAt = due.value ? at : null; drawDue(); changed();
  });
  const removeDraft = ui.iconBtn("trash", { label: "Delete draft", act: "delete-draft", run: async () => {
    if (await ctx.open.confirm({ title: "Delete draft?", yes: "Delete draft", no: "Keep writing", danger: true }) && !h.closed) end("delete");
  } });
  removeDraft.replaceChildren(ctx.icon("trash"));
  const to = tokens("to", "To");
  const ccButton = ui.btn("Cc/Bcc", { small: true, act: "cc", run: () => {
    ccRow.hidden = !ccRow.hidden;
    ccButton.setAttribute("aria-expanded", String(!ccRow.hidden));
    if (!ccRow.hidden) fields.cc.input.focus();
  } });
  ccButton.setAttribute("aria-expanded", String(!ccRow.hidden));
  to.append(ccButton);
  const formatting = el("div", { class: "mc-format", hidden: true });
  const formatButton = ui.btn("Aa", { small: true, label: "Text tools", act: "format", run: () => {
    showFollowUp(false);
    formatting.hidden = !formatting.hidden;
    formatButton.setAttribute("aria-expanded", String(!formatting.hidden));
  } });
  formatButton.setAttribute("aria-expanded", "false");
  formatButton.setAttribute("aria-label", "Text tools");
  for (const [label, prefix] of [["Bullet list", "• "], ["Numbered list", "1. "], ["Quote", "> "]]) {
    formatting.append(ui.btn(label, { small: true, run: () => {
      const start = text.value.slice(0, text.selectionStart).lastIndexOf("\n") + 1;
      const end = text.selectionEnd;
      const lines = text.value.slice(start, end).split("\n");
      text.setRangeText(lines.map((line, i) => (prefix === "1. " ? (i + 1) + ". " : prefix) + line).join("\n"), start, end, "end");
      formatting.hidden = true;
      formatButton.setAttribute("aria-expanded", "false");
      text.focus(); editText();
    } }));
  }
  async function openCards(anchor, initial) {
    const current = () => !ended && !sending && !h?.closed && !fw.signal.aborted && fw.session.user.id === owner && store.get().access === "ok";
    try {
      if (!current()) return;
      await ctx.open.contactCard({anchor,base:MAIL,owner,current,me,from:c.from,initial,pickFile:()=>pick.click(),attach(file){
        if (!current()) return;
        addFiles([file], initial);
      }});
    } catch { if(current())fw.toast("Couldn’t open attachments. Try again."); }
  }
  const attach = ui.iconBtn("attachment", { label: "Add Files", act: "files", run: () => openCards(attach) });
  attach.replaceChildren(ctx.icon("attachment"));
  const status = el("small", { class: "mc-status", role: "status" });
  const group = el("div", { class: "mc-toolgroup", role: "group", "aria-label": "Message tools" }, attach, formatButton);
  if (fw.workspace?.files?.open) {
    const drive = ui.iconBtn("folder", { label: "Attach from InFlite Files", act: "drive-files", run: async () => {
      const current = () => !ended && !sending && !h?.closed && !fw.signal.aborted && fw.session.user.id === owner && store.get().access === "ok";
      if (!current() || h.el.getAttribute("aria-busy") === "true") return;
      drive.focus({ preventScroll: true });
      try {
        if (c.files.length >= MAX_ATTACHMENTS) return fw.toast(TOO_MANY_FILES);
        const left = MAX - c.files.reduce((n, item) => n + (item.size || 0), 0);
        if (left <= 0) return fw.toast("Files are limited to 20 MB");
        const picked = await fw.workspace.files.open({ title: "Attach from InFlite Files", multiple: true, maxBytes: left, current, signal: fileDialog.signal });
        if (!current() || !picked) return;
        if (picked.length) addFiles(picked);
      } catch (error) { if (current() && error?.name !== "AbortError") fw.toast(error?.message || "Those files couldn’t attach."); }
    } });
    drive.replaceChildren(ctx.icon("folder"));
    group.append(drive);
  }
  group.append(followButton, removeDraft);
  const tools = el("div", { class: "mc-tools" }, group, status);
  const prog = el("p", { class: "mc-prog", "aria-live": "polite" });
  const identity = el("span", { class: "mc-identity" }, from || el("span", { text: c.from || "Default address" }));
  const sender = el("label", { class: "mc-sender" }, ctx.icon("envelope"),
    el("span", { class: "mc-account" }, el("small", { text: "From" }), identity));
  const letter = el("div", { class: "mc-letter" }, to, ccRow, sugg, subject, text, footer, filesEl, quoteEl);
  const body = el("div", { class: "mc" }, sender, letter, el("div", { class: "mc-accessories" }, followHint, formatting, follow, prog, tools), pick);
  const dismissRecipient = event => {
    if (activeRecipient && !activeRecipient.contains(event.target) && !recipientDetails.contains(event.target)) closeRecipient();
  };
  body.addEventListener("focusin", dismissRecipient);
  body.addEventListener("click", dismissRecipient);
  body.addEventListener("keydown", event => {
    if (activeRecipient === event.target && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeRecipient();
    }
  });
  if (fw.workspace?.files?.fromDrop) {
    const isDriveDrop = event => [...(event.dataTransfer?.types || [])].includes("application/x-inflite-files-token");
    body.addEventListener("dragover", event => { if (isDriveDrop(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } });
    let receiving = false;
    body.addEventListener("drop", async event => {
      if (!isDriveDrop(event)) return; event.preventDefault(); event.stopPropagation();
      const current = () => !ended && !sending && !h?.closed && !fw.signal.aborted && fw.session.user.id === owner && store.get().access === "ok";
      if (!current() || receiving) return; receiving = true;
      try {
        const left = MAX - c.files.reduce((n, item) => n + (item.size || 0), 0);
        const files = await fw.workspace.files.fromDrop(event.dataTransfer, { maxBytes: Math.max(0, left), current, signal: fileDialog.signal });
        if (!current() || !files) return;
        if (files.length) addFiles(files);
      } catch (error) { if (current() && error?.name !== "AbortError") fw.toast(error?.message || "Those files couldn’t attach."); }
      finally { receiving = false; }
    });
  }
  drawFiles(); drawQuote();


  function redraw() {
    for (const k of LISTS) fields[k].draw();
    ccRow.hidden = !(c.cc.length || c.bcc.length);
    ccButton.setAttribute("aria-expanded", String(!ccRow.hidden));
    subject.value = c.subject; drawDue(); showText(); if (from) from.value = c.from; else identity.firstChild.textContent = c.from || "Default address";
    drawFiles(); drawQuote(); changed();
  }
  function changed() {
    if (ended) return;
    suggestFollowUp();
    const t = h?.el.querySelector(".ifs-head h2");
    if (t) t.textContent = titleOf(c);
    clearTimeout(keepT);
    status.textContent = "";
    keepT = setTimeout(() => {
      if (ended || !dirty()) return;
      const kept = keep();
      status.textContent = kept ? (c.files.some(isFile) ? "Text saved on device" : "Saved on device") : "Draft not saved";
    }, 800);
  }

  // ---- closing: Send, Delete Draft, or any other way (kept, S4-D18)
  function end(how) {
    ended = how;
    if (how === "delete" || how === "send") claimQuick();
    h.close();
  }
  function closed() {
    fileDialog.abort();
    clearTimeout(keepT); clearTimeout(suggT);
    const pendingSave = off?.();
    store.set({ compose: false }, "compose");
    // (closed while Send is saving it: the outbox has it; send() lets the phone's copy go once it answers)
    if (sending) { ended = "send"; return; }
    if (ended === "send") return;
    if (ended === "delete") {
      if (!held()) ctx.outbox.dropUnsent();
      const remove = () => c.draftId && api.remove(c.draftId).catch(() => {});
      if (pendingSave?.then) pendingSave.then(remove); else remove();
      return;
    }
    ended = "close";
    for (const k of LISTS) fields[k].commit();
    clearTimeout(keepT);
    // (unchanged, or unchanged since flush saved it: nothing to save; only this compose's own copy let go)
    if (!dirty() || sigOf() === saved) { if (wrote && !held()) ctx.outbox.dropUnsent(); return; }
    const kept = keep();
    const at = kept ? stamp(ctx.outbox.unsent()) : null;
    const bytes = c.files.some(isFile);
    if (ctx.canRead?.() === false) {
      if (kept && bytes) fw.toast("Draft text kept on this device. Add its files again after signing in.");
      return;
    }
    const job = (async () => {
      if (pendingSave) await pendingSave;
      await filesReady();
      const r = await api.saveDraft(draftOf(fieldsOf(c), await draftFiles(c.files)), null, { keepalive: !bytes });
      if (!r?.id) throw new Error("Mail did not confirm the draft");
      c.draftId = r.id;
      c.draftRevision = r.revision;
      claimQuick();
      if (kept && stamp(ctx.outbox.unsent()) === at) ctx.outbox.dropUnsent();
      fw.toast("Draft saved");
    })();
    const state = recoveryFor(ctx);
    state.closing = job;
    job.catch((error) => {
      if (error?.status === 409) {
        return fw.toast(kept ? `${error.message} Your draft text is kept on this device.` : error.message,
          { action: { label: "Open edits", run: () => ctx.open.compose({ ...c, resumeConflict: true }) } });
      }
      if (kept) retryOnline(ctx);
      fw.toast(!kept ? "Couldn’t keep this on your phone. Try Again when you’re online"
        : bytes ? "Kept on this phone, without its files. It’s saved to Mail when you’re back online."
        : "Kept on this phone. It’s saved to Mail when you’re back online.");
    }).finally(() => { if (state.closing === job) state.closing = null; });
  }

  async function send() {
    if (sending || h.el.getAttribute("aria-busy") === "true" || store.get().access && ctx.canRead?.() === false) return;
    for (const k of LISTS) fields[k].commit();
    const all = LISTS.flatMap((k) => c[k]), bad = all.find((p) => !EMAIL_RE.test(p.email));
    if (!all.length || bad) return fw.toast(bad ? `“${bad.email}” isn’t a valid address` : "Add a recipient");
    if (!c.subject.trim() && !(await ctx.open.confirm({ title: "No Subject", text: "This message has no subject.", yes: "Send Anyway", no: "Cancel" }))) return h.closed ? undefined : subject.focus();
    if (h.closed) return;
    if (c.quoteOld && !(await ctx.open.confirm({ title: "Send Without the Quoted Text?", text: "This draft was started in Mail on its own. Sent from here, it goes without the message it quotes.", yes: "Send", no: "Cancel" }))) return;
    if (h.closed) return;
    const offline = !online();
    if (offline && (c.files.length || unknown)) return fw.toast(c.files.length ? "Files need a connection. Try Again" : "This draft needs a connection. Try Again");
    try { await filesReady(); } catch (error) { return fw.toast(error?.status === 409 ? error.message : "Couldn’t reach Mail. Try Again"); }
    if (h.closed || sending) return;
    if (c.files.length > MAX_ATTACHMENTS) return fw.toast(TOO_MANY_FILES);
    // (a quoteOld draft goes without its quote, as "Send Without the Quoted Text?" said: quote null, not left out)
    if (offline && !fits(fieldsOf(c))) return fw.toast("Couldn’t keep this on your phone. Try Again when you’re online");
    // (saved first, the sheet up meanwhile with the upload's progress; closed once the outbox has it, S4-D18)
    sending = true;
    h.setBusy(true);
    let r;
    try {
      const pendingSave = off?.pending?.();
      if (pendingSave) await pendingSave;
      r = await ctx.outbox.send({...fieldsOf(c), quoteOld:false}, c.files.slice(), (x) => { prog.textContent = `Sending… ${Math.round(x * 100)}%`; });
    }
    catch (e) { r = { ok: false, error: e?.message }; }
    sending = false;
    prog.textContent = "";
    if (h.closed) {
      // (closed while it was saving: the outbox has it, or, refused, its words kept here and said so)
      if (r?.ok) { if (wrote && !held()) ctx.outbox.dropUnsent(); }
      else if (keep()) { retryOnline(ctx); fw.toast("Couldn’t send. It’s kept on this phone"); }
      else fw.toast(r?.error || "Couldn’t send. Try Again");
      return r;
    }
    h.setBusy(false);
    if (!r?.ok) { fw.toast(r?.error || "Couldn’t send. Try Again"); return r; }
    if (!held()) ctx.outbox.dropUnsent();
    end("send");
    return r;
  }

  h = fw.sheet.open({
    sheet: "mail-compose", title: titleOf(c), body,
    acts: [{ label: "Send", primary: true, act: "send", run: () => send() }],
    focus: c.to.length ? text : fields.to.input,
    onClose: closed,
  });
  const sendButton = h.el.querySelector('[data-act="send"]');
  const sheetHead = h.el.querySelector(".ifs-head");
  if (sendButton && sheetHead) {
    sendButton.setAttribute("aria-label", "Send");
    sendButton.dataset.sheetAction = "";
    sendButton.replaceChildren(ctx.icon("send-up"));
    sheetHead.append(sender, sendButton);
    h.el.querySelector(".ifs-acts")?.remove();
  }
  store.set({ compose: true }, "compose");
  // Save this app's bounded draft synchronously before a browser can suspend
  // the page. File bytes remain with the existing upload/draft workflow.
  const preserve = () => {
    if (ended || sending || fw.signal?.aborted || fw.session.user.id !== owner) return;
    for (const key of LISTS) fields[key].commit();
    clearTimeout(keepT);
    if (dirty()) keep();
  };
  const hidden = () => { if (document.visibilityState === "hidden") preserve(); };
  globalThis.addEventListener("pagehide", preserve);
  document.addEventListener("visibilitychange", hidden);
  fileDialog.signal.addEventListener("abort", () => { globalThis.removeEventListener("pagehide", preserve); document.removeEventListener("visibilitychange", hidden); }, { once: true });
  // (flush, C10: saves these words as a draft and hands its id back; unchanged since, it isn't saved again)
  off = ctx.outbox.track?.(() => (!ended && !sending && !unknown && dirty() && sigOf() !== saved ? { ...fieldsOf(c), files: c.files.slice() } : null),
    (id, snapshot = c, revision) => {
      c.draftId = id;
      c.draftRevision = revision;
      saved = sigOf({ ...snapshot, draftId: id, draftRevision: revision });
      if (!ended && !held() && dirty() && sigOf() !== saved) keep();
    }) || null;

  // words an earlier compose left on this phone: saved to Mail first, else (offline) reopened here when this one's blank
  const left = init.resumeConflict ? null : ctx.outbox.unsent?.();
  const ready = !restoring && hasWords(left) ? saveLeft(ctx) : Promise.resolve(true);
  if (restoring && c.draftId) {
    unknown = true;
    filesReady().catch((error) => {
      if (!ended && !fw.signal?.aborted) fw.toast(error?.status === 409 ? error.message : "Existing attachments need a connection before sending.");
    });
  }
  if (!restoring && hasWords(left)) {
    leftAt = stamp(left);
    ready.then((ok) => {
      if (ok || ended || !held()) return;
      if (blank && !dirty()) {
        leftAt = null;
        Object.assign(c, { followUpAt:left.followUpAt || null, from: left.from || c.from, to: people(left.to), cc: people(left.cc), bcc: people(left.bcc), subject: String(left.subject || ""), text: String(left.text || ""),
          quote: left.quote?.of ? { of: String(left.quote.of), mode: left.quote.mode } : null, quoteOld: !!left.quoteOld, inReplyTo: left.inReplyTo || null, references: left.references || null, draftId: left.draftId || null, draftRevision: left.draftRevision || null });
        redraw();
        wrote = true;
        // (a draft it was: its own files asked of Mail once there's a connection, before it's saved or sent)
        if (c.draftId) { unknown = true; if (typeof addEventListener === "function") addEventListener("online", () => filesReady().catch(() => {}), { once: true, signal: fileDialog.signal }); }
        fw.toast("Here’s what you were writing. It’s kept on this phone.");
      } else {
        retryOnline(ctx);
        fw.toast("Your earlier message is kept on this phone. It’s saved to Mail when you’re back online.");
      }
    });
  }

  // a draft opened from Drafts: its fields from Mail (drafts only; no body of anyone else's, §3.1)
  if (loading) {
    h.setBusy(true);
    // (after any words left on this phone are saved: they may be this very draft's)
    ready.then(() => api.draft(c.draftId)).then(({ compose: d = {}, quoteOld, revision }) => {
      if (ended) return;
      Object.assign(c, { draftRevision: revision, followUpAt:d.followUpAt || null, from: d.from || c.from, to: people(d.to), cc: people(d.cc), bcc: people(d.bcc), subject: String(d.subject || ""), text: String(d.text || ""), inReplyTo: d.inReplyTo || null, references: d.references || null,
        quote: d.quote?.of ? { of: String(d.quote.of), mode: d.quote.mode } : null, quoteOld: !!quoteOld, files: Array.isArray(d.files) ? d.files.slice() : [] });
      redraw();
      snap = sigOf();
      h.setBusy(false);
    }, () => { if (!ended) { h.setBusy(false); fw.toast("Couldn’t open that draft. Try again in a moment."); } });
  }
  if (init.quickSelection) {
    text.setSelectionRange(...init.quickSelection);
    if (init.text) ready.then(() => { if (!ended && !held()) keep(); });
  }
  return h;
}
