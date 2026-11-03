// Mail's module: sending (One roof stage 4, spec S4-D16, S4-D18, C9, C10; app.js 5796–5888, 6543–6697).
// Send = save, then send: a server draft first (POST /api/drafts, files uploaded with progress, or { ref } to Mail's own
// copy), then "Sending… · Undo" for UNDO_MS (the framework toast's own time), then POST /api/send { draftId, key }: Mail
// sends the stored draft and deletes it. The toast is closed by its handle (C9) the moment the send starts; an Undo after
// that says "Already sent". Undo before then keeps the draft and opens it again in compose. "Did it go?" asks
// /api/sends with the key, as app.js does. Offline: a message with files isn't taken ("Files need a connection. Try
// Again"); one without is kept in mail:outbox (its words only, never file bytes) and sent, save then send with no second
// undo window, on "online" or the next "visible". Every mail:* key together ≤ CAP (store.local.put refuses past it).
// createOutbox(ctx) → {
//   send(draft, files, onProgress) → Promise<{ ok: true, key, draftId, queued? } | { ok: false, error, offline? }>
//       draft: compose's fields { from, to, cc, bcc, subject, text, quote, inReplyTo, references, draftId };
//       files: [File | { ref, filename, type, size }]. Resolves once the draft is saved (or queued): compose closes on ok.
//   retry(key), pending() → OutboxItem[], undo(key) → boolean
//   keepUnsent(fields) → boolean (false over CAP or on QuotaExceededError: compose says FULL), unsent(), dropUnsent()
//   track(fields, onSaved) → off   (MM's addition) an open compose: fields() → its live fields | null (nothing to keep),
//       with files: [File | { ref }] when it has any (a draft's own files are { ref }: listed, so a save keeps them);
//       flush() saves them as a server draft (with fields().draftId when it has one, else the id an earlier flush got)
//       and hands the id back, onSaved(id), so compose's own save on closing updates that draft instead of making a
//       second (compose sets its draftId from it). Unchanged since the last flush save: not saved again (so the flush
//       of unmount, after sign-out, asks nothing).
//   flush({ keepalive }) → Promise<{ lost }>   ≤ FLUSH_MS: sends waiting out their Undo go now, queued ones and an open
//       compose are saved as server drafts; lost = what couldn't be. An untracked compose's mail:unsent copy is saved the
//       same way and then dropped (so a second flush finds nothing).
//   undo(key): the draft opened again in compose. A message without files: its fields (compose shows them at once, no
//       files key). One with files: { draftId } alone, so compose asks Mail for the draft (api.draft) and keeps its
//       files as Mail has them ({ ref }); never files: [] (a save with that id would drop them).
//   destroy()
// }
// OutboxItem = { key, at, draft: { from, to, cc, bcc, subject, text, quote, draftId }, state: "waiting" | "sending" |
//   "queued" | "failed" }; the store's outbox mirrors pending() (list.js shows each with its Undo or Try Again).
import { STORAGE, CAP, local } from "./store.js";

export const UNDO_MS = 6000;
export const FLUSH_MS = 2000;
export const FULL = "Couldn’t keep this on your phone. Try Again when you’re online";
export const NEEDS = "Files need a connection. Try Again";
export { CAP };

const FIELDS = ["from", "to", "cc", "bcc", "subject", "text", "quote", "quoteOld", "inReplyTo", "references", "threadId", "draftId"];
const fieldsOf = (c = {}) => Object.fromEntries(FIELDS.map((k) => [k, c[k] ?? null]));
const keyOf = () => `ifl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const online = () => globalThis.navigator?.onLine !== false;
const b64 = (blob) => blob.arrayBuffer().then((buf) => {
  let s = "";
  const a = new Uint8Array(buf);
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
});

export function createOutbox(ctx) {
  const { store, api, fw } = ctx;
  const items = new Map();
  const tracked = new Map();
  const offs = [];
  let dead = false;
  const toast = (text, o) => { try { return fw.toast(text, o) || null; } catch { return null; } };
  const mirror = () => {
    const list = [...items.values()].map(({ key, at, draft, state }) => ({ key, at, draft, state }));
    store.set({ outbox: list, sending: list.filter((x) => x.state === "waiting" || x.state === "sending").length });
  };
  const keepQueue = () => {
    const q = [...items.values()].filter((x) => x.state === "queued").map(({ key, at, draft }) => ({ key, at, draft }));
    if (!q.length) { local.drop(STORAGE.outbox); return true; }
    try { return local.put(STORAGE.outbox, q); } catch { return false; }
  };
  // (what was queued offline before: kept again from storage)
  for (const r of local.get(STORAGE.outbox, []) || []) if (r?.key && r.draft) items.set(r.key, { key: r.key, at: r.at || Date.now(), draft: fieldsOf(r.draft), state: "queued" });

  const payload = async (d, files = []) => {
    const attachments = [];
    for (const f of files || []) {
      if (f?.ref) attachments.push({ ref: f.ref });
      else if (Number.isInteger(f?.i)) attachments.push({ i: f.i });   // (a stored draft's own file, by its index: kept)
      else if (f && typeof f.arrayBuffer === "function") attachments.push({ filename: f.name || "file", type: f.type || "application/octet-stream", size: f.size, content: await b64(f) });
    }
    return { ...(d.draftId && { id: d.draftId }), from: d.from, to: d.to || [], cc: d.cc || [], bcc: d.bcc || [], subject: d.subject || "", text: d.text || "", inReplyTo: d.inReplyTo || null, references: d.references || null, ...(d.quoteOld ? {} : { quote: d.quote || null }), attachments };   // (an old draft's quote left as Mail has it)
  };
  const after = () => { ctx.actions?.counts?.(); ctx.actions?.load?.({ quiet: true }); };

  async function go(it, { keepalive = false } = {}) {
    if (it.state === "sending" || !items.has(it.key)) return;
    clearTimeout(it.timer);
    it.state = "sending";
    try { it.handle?.close?.(); } catch {}
    mirror();
    try {
      await api.sendDraft(it.draft.draftId, it.key, { keepalive });
      items.delete(it.key);
      mirror();
      if (!dead) { toast("Message Sent"); after(); }
    } catch (e) {
      // (Mail refused it, 4xx: it's still in Drafts, to change there; no answer: Try Again asks whether it went first)
      const refused = e.status >= 400 && e.status < 500 && e.status !== 401;
      if (refused) items.delete(it.key);
      else it.state = "failed";
      mirror();
      if (!dead) toast(refused ? "Couldn’t send. It’s in Drafts" : e.message || "Couldn’t send", refused ? undefined : { action: { label: "Try Again", run: () => retry(it.key) } });
    }
  }

  async function send(draft = {}, files = [], onProgress) {
    const d = fieldsOf(draft);
    if (!online()) {
      if ((files || []).length) return { ok: false, offline: true, error: NEEDS };
      const it = { key: keyOf(), at: Date.now(), draft: d, state: "queued" };
      items.set(it.key, it);
      if (!keepQueue()) { items.delete(it.key); return { ok: false, offline: true, error: FULL }; }
      mirror();
      toast("You’re offline. It goes when you’re back online");
      return { ok: true, key: it.key, draftId: null, queued: true };
    }
    let saved;
    try {
      saved = await api.saveDraft(await payload(d, files), onProgress);
    } catch (e) {
      return { ok: false, error: e.message || "Couldn’t send", offline: !e.status && !online() };
    }
    const it = { key: keyOf(), at: Date.now(), draft: { ...d, draftId: saved?.id || d.draftId }, files: (files || []).length, state: "waiting", timer: 0, handle: null };
    items.set(it.key, it);
    mirror();
    it.handle = toast("Sending…", { action: { label: "Undo", run: () => undo(it.key) } });
    it.timer = setTimeout(() => go(it), UNDO_MS);
    return { ok: true, key: it.key, draftId: it.draft.draftId };
  }

  function undo(key) {
    const it = items.get(key);
    if (!it || it.state !== "waiting") { toast("Already sent"); return false; }
    clearTimeout(it.timer);
    items.delete(key);
    mirror();
    try { it.handle?.close?.(); } catch {}
    ctx.open?.compose?.(it.files && it.draft.draftId ? { draftId: it.draft.draftId } : { ...it.draft });
    return true;
  }

  async function retry(key) {
    const it = items.get(key);
    if (!it) return;
    if (it.state === "queued") return drain();
    try {
      const { sent } = await api.sent([key]);
      if ((sent || []).includes(key)) { items.delete(key); mirror(); toast("Message Sent"); after(); return; }
    } catch {}
    it.state = "waiting";
    return go(it);
  }

  // (sends made offline: saved, then sent, as the connection comes back; asked first whether any went already)
  let draining = null;
  function drain() {
    if (draining || !online()) return draining;
    const q = [...items.values()].filter((x) => x.state === "queued");
    if (!q.length) return null;
    draining = (async () => {
      let went = [];
      try { went = (await api.sent(q.map((x) => x.key)))?.sent || []; } catch {}
      for (const it of q) {
        if (went.includes(it.key)) { items.delete(it.key); continue; }
        try {
          const saved = await api.saveDraft(await payload(it.draft, []));
          it.draft = { ...it.draft, draftId: saved?.id || it.draft.draftId };
          it.state = "waiting";
          await go(it);
        } catch { it.state = "queued"; break; }
      }
      keepQueue();
      mirror();
    })().finally(() => { draining = null; });
    return draining;
  }

  function keepUnsent(fields) {
    try { return local.put(STORAGE.unsent, { ...fieldsOf(fields), at: Date.now() }); } catch { return false; }
  }
  const unsent = () => { const u = local.get(STORAGE.unsent, null); return u && typeof u === "object" ? u : null; };
  const dropUnsent = () => local.drop(STORAGE.unsent);
  function track(fn, onSaved) {
    tracked.set(fn, { onSaved: typeof onSaved === "function" ? onSaved : null, id: null, sig: null });
    return () => tracked.delete(fn);
  }

  async function flush({ keepalive = false } = {}) {
    let lost = 0;
    const jobs = [];
    for (const it of [...items.values()]) {
      if (it.state === "waiting") jobs.push(go(it, { keepalive }));
      else if (it.state === "queued") jobs.push(api.saveDraft(await payload(it.draft, []), null, { keepalive }).then(() => { items.delete(it.key); }, () => { lost++; }));
    }
    for (const [fn, t] of tracked) {
      let f = null;
      try { f = fn(); } catch {}
      if (!f) continue;
      const d = fieldsOf(f);
      d.draftId ||= t.id;
      const files = Array.isArray(f.files) ? f.files : [];
      const sigOf = (id) => JSON.stringify([{ ...d, draftId: id }, files.map((x) => x?.ref || `${x?.name}:${x?.size}`)]);
      if (sigOf(d.draftId) === t.sig) continue;
      jobs.push(api.saveDraft(await payload(d, files), null, { keepalive }).then((r) => {
        t.id = r?.id || d.draftId || null;
        t.sig = sigOf(t.id);
        dropUnsent();
        if (t.id) try { t.onSaved?.(t.id); } catch {}
      }, () => { lost++; }));
    }
    const u = !tracked.size && unsent();
    if (u && (u.subject || u.text || u.to?.length)) jobs.push(api.saveDraft(await payload(fieldsOf(u), []), null, { keepalive }).then(() => dropUnsent(), () => { lost++; }));
    const n = jobs.length;
    let done = 0;
    let cap = 0;
    await Promise.race([Promise.all(jobs.map((j) => Promise.resolve(j).finally(() => done++))), new Promise((ok) => { cap = setTimeout(ok, FLUSH_MS); })]);
    clearTimeout(cap);
    if (done < n) lost += n - done;
    keepQueue();
    mirror();
    return { lost };
  }

  const on = (t, ev, fn) => { t?.addEventListener?.(ev, fn); offs.push(() => t?.removeEventListener?.(ev, fn)); };
  on(globalThis, "online", () => drain());
  offs.push(fw.on?.("visible", () => drain()) || (() => {}));
  // (put away during the undo window: it goes at once, as app.js's sendNow)
  on(globalThis, "pagehide", () => { for (const it of items.values()) if (it.state === "waiting") go(it, { keepalive: true }); });
  mirror();
  if (online()) queueMicrotask(() => drain());

  return {
    send, retry, undo, keepUnsent, unsent, dropUnsent, track, flush,
    pending: () => [...items.values()].map(({ key, at, draft, state }) => ({ key, at, draft, state })),
    destroy() {
      dead = true;
      for (const it of items.values()) clearTimeout(it.timer);
      for (const f of offs.splice(0)) try { f(); } catch {}
    },
  };
}
