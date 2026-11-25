// Mail's module: sending (One roof stage 4, spec S4-D16, S4-D18, C9, C10; app.js 5796–5888, 6543–6697).
// Send = save, then send: a server draft first (POST /api/drafts, files uploaded with progress, or { ref } to Mail's own
// copy), then "Sending… · Undo" for UNDO_MS (the framework toast's own time), then POST /api/send { draftId, key }: Mail
// sends the stored draft and deletes it. The toast is closed by its handle (C9) the moment the send starts; an Undo after
// that says "Already sent". Undo before then keeps the draft and opens it again in compose. "Did it go?" asks
// /api/sends with the key, as app.js does. Offline: a message with files isn't taken ("Files need a connection. Try
// Again"); one without is kept in mail:outbox (its words only, never file bytes) and sent, save then send with no second
// undo window, on "online" or the next "visible". Active Mail records share the cap enforced by the local store.
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
import { STORAGE, CAP, privateJournal } from "./store.js";

export const UNDO_MS = 6000;
export const FLUSH_MS = 2000;
export const FULL = "Couldn’t keep this on your phone. Try Again when you’re online";
export const NEEDS = "Files need a connection. Try Again";
export { CAP };
const LOCKED = "Confirm it’s you to use Mail.";

const FIELDS = ["from", "to", "cc", "bcc", "subject", "text", "quote", "quoteOld", "inReplyTo", "references", "threadId", "draftId"];
const fieldsOf = (c = {}) => ({ ...Object.fromEntries(FIELDS.map((k) => [k, c[k] ?? null])), ...(c.followUpAt && {followUpAt:c.followUpAt}) });
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
  const owner = fw.session?.user?.id;
  const retired = () => dead || fw.signal?.aborted || fw.session?.user?.id !== owner;
  const journal = privateJournal(owner, () => !retired());
  const canRecover = () => journal.available() && ctx.canDraft?.() !== false;
  const canDrain = () => canRecover() && (!store.get || store.get().access === "ok");
  const serialized = run => globalThis.navigator?.locks?.request ? navigator.locks.request(STORAGE.outbox, run) : run();
  const toast = (text, o) => { try { return fw.toast(text, o) || null; } catch { return null; } };
  const mirror = () => {
    if (retired()) return;
    const list = canRecover() ? [...items.values()].map(({ key, at, draft, state, handle, retrying }) => ({
      key, at, draft, state, checking: state === "failed" && !!retrying, undoInToast: state === "waiting" && !!handle?.close,
    })) : [];
    store.set({ outbox: list, sending: list.filter((x) => x.state === "waiting" || x.state === "sending").length });
  };
  function storedQueue() {
    const records = journal.get(STORAGE.outbox, []);
    return Array.isArray(records) ? records.filter(r => typeof r?.key === "string" && r.key && r.draft && typeof r.draft === "object") : [];
  }
  const recordOf = it => ({ key: it.key, at: it.at, draft: it.draft,
    ...(it.saved && { saved: true }), ...(it.state === "failed" && { failed: true }) });
  for (const r of storedQueue()) items.set(r.key, { key: r.key, at: r.at || Date.now(), draft: fieldsOf(r.draft),
    stored: true, saved: r.saved === true && !!r.draft.draftId, state: r.failed && r.saved && r.draft.draftId ? "failed" : "queued" });
  let knownQueued = new Map([...items].map(([key, it]) => [key, JSON.stringify(recordOf(it))]));
  const keepQueue = () => {
    if (retired()) return false;
    const queued = new Map([...items].filter(([,it]) => it.stored).map(([key, it]) => [key, recordOf(it)]));
    const next = new Map([...queued].map(([key, entry]) => [key, JSON.stringify(entry)]));
    const changed = [...next.keys()].filter(key => next.get(key) !== knownQueued.get(key));
    const removed = [...knownQueued.keys()].filter(key => !queued.has(key));
    if (!changed.length && !removed.length) return true;
    // Other tabs may have queued or delivered messages since this outbox opened.
    const merged = new Map(storedQueue().map(item => [item.key, item]));
    for (const key of removed) merged.delete(key);
    for (const key of changed) merged.set(key, queued.get(key));
    try {
      if (merged.size) {
        if (!journal.put(STORAGE.outbox, [...merged.values()])) return false;
      } else journal.drop(STORAGE.outbox);
      knownQueued = next;
      return true;
    } catch { return false; }
  };

  const payload = async (d, files = []) => {
    const attachments = [];
    for (const f of files || []) {
      if (f?.ref) attachments.push({ ref: f.ref });
      else if (Number.isInteger(f?.i)) attachments.push({ i: f.i });   // (a stored draft's own file, by its index: kept)
      else if (f && typeof f.arrayBuffer === "function") attachments.push({ filename: f.name || "file", type: f.type || "application/octet-stream", size: f.size, content: await b64(f) });
    }
    return { ...(d.draftId && { id: d.draftId }), followUpAt:d.followUpAt || null, from: d.from, to: d.to || [], cc: d.cc || [], bcc: d.bcc || [], subject: d.subject || "", text: d.text || "", inReplyTo: d.inReplyTo || null, references: d.references || null, ...(d.quoteOld ? {} : { quote: d.quote || null }), attachments };   // (an old draft's quote left as Mail has it)
  };
  const after = () => { ctx.actions?.counts?.(); ctx.actions?.load?.({ quiet: true }); };

  async function go(it, { keepalive = false } = {}) {
    if (retired() || it.state === "sending" || !items.has(it.key)) return;
    clearTimeout(it.timer);
    // The server has the draft. Keep the same send key across a lost response or a reload.
    it.saved = it.stored = true;
    it.state = canDrain() && online() ? "sending" : "queued";
    keepQueue();
    try { it.handle?.close?.(); } catch {}
    mirror();
    if (it.state === "queued") return;
    try {
      await api.sendDraft(it.draft.draftId, it.key, { keepalive });
      items.delete(it.key);
      mirror();
      if (canDrain()) { toast("Message Sent"); after(); }
    } catch (e) {
      // (Mail refused it, 4xx: it's still in Drafts, to change there; no answer: Try Again asks whether it went first)
      const refused = e.status >= 400 && e.status < 500 && ![401, 408, 429].includes(e.status);
      if (refused) items.delete(it.key);
      else it.state = online() ? "failed" : "queued";
      mirror();
      if (canDrain() && it.state !== "queued") toast(refused ? "Couldn’t send. It’s in Drafts" : "Send unconfirmed", refused ? undefined : { action: { label: "Try Again", run: () => retry(it.key) } });
    } finally {
      keepQueue();
    }
  }

  async function send(draft = {}, files = [], onProgress) {
    const d = fieldsOf(draft);
    const access = store.get?.().access;
    if (!canRecover() || access && access !== "ok") return { ok: false, error: LOCKED };
    if (!online()) {
      if ((files || []).length) return { ok: false, offline: true, error: NEEDS };
      const it = { key: keyOf(), at: Date.now(), draft: d, state: "queued", stored: true };
      items.set(it.key, it);
      if (!keepQueue()) { items.delete(it.key); return { ok: false, offline: true, error: FULL }; }
      mirror();
      toast("You’re offline. It goes when you’re back online");
      return { ok: true, key: it.key, draftId: null, queued: true };
    }
    let saved;
    try {
      const body = await payload(d, files);
      if (!canDrain()) throw new Error(LOCKED);
      saved = await api.saveDraft(body, onProgress);
      if (!saved?.id || !canDrain()) throw new Error("Mail did not confirm the draft");
    } catch (e) {
      return { ok: false, error: e.message || "Couldn’t send", offline: !e.status && !online() };
    }
    const it = { key: keyOf(), at: Date.now(), draft: { ...d, draftId: saved?.id || d.draftId }, files: (files || []).length, state: "waiting", timer: 0, handle: null };
    items.set(it.key, it);
    it.handle = toast("Sending…", {
      action: { label: "Undo", run: () => undo(it.key) },
      onClose: () => {
        it.handle = null;
        if (!dead && it.state === "waiting" && items.has(it.key)) mirror();
      },
    });
    mirror();
    it.timer = setTimeout(() => go(it), UNDO_MS);
    return { ok: true, key: it.key, draftId: it.draft.draftId };
  }

  function undo(key) {
    if (!canDrain()) return false;
    const it = items.get(key);
    if (!it || it.state !== "waiting") { toast("Already sent"); return false; }
    clearTimeout(it.timer);
    items.delete(key);
    mirror();
    try { it.handle?.close?.(); } catch {}
    ctx.open?.compose?.(it.files && it.draft.draftId ? { draftId: it.draft.draftId } : { ...it.draft });
    return true;
  }

  function retry(key) {
    const it = items.get(key);
    if (!it || !canDrain() || !online()) return;
    if (it.state === "queued") return drain();
    if (it.state !== "failed") return;
    const resend = async () => {
      if (!canDrain()) return;
      let sent;
      try { sent = (await api.sent([key]))?.sent; } catch {}
      if (!Array.isArray(sent) || !canDrain() || items.get(key) !== it) return;
      if (sent.includes(key)) { items.delete(key); keepQueue(); mirror(); toast("Message Sent"); after(); return; }
      await go(it);
    };
    if (!it.retrying) {
      it.retrying = (it.stored ? serialized(resend) : resend()).finally(() => { it.retrying = null; mirror(); });
      mirror();
    }
    return it.retrying;
  }

  async function saveQueued(it, keepalive = false) {
    if (it.saved) return;
    // Reuse the queue key for a new draft, including if its first save response was lost.
    it.saving ||= (async () => {
      const body = await payload({ ...it.draft, draftId: it.draft.draftId || it.key });
      if (!canDrain()) throw new Error(LOCKED);
      const saved = await api.saveDraft(body, null, { keepalive });
      if (!saved?.id || retired()) throw new Error("Mail did not confirm the draft");
      it.draft = { ...it.draft, draftId: saved.id };
      it.saved = true;
      keepQueue();
    })().finally(() => { it.saving = null; });
    await it.saving;
  }

  // (sends made offline: saved, then sent, as the connection comes back; asked first whether any went already)
  let draining = null;
  function drain() {
    if (draining || !canDrain() || !online()) return draining;
    const q = [...items.values()].filter((x) => x.state === "queued");
    if (!q.length) return null;
    draining = serialized(async () => {
      if (!canDrain()) return;
      let went;
      try { went = (await api.sent(q.map((x) => x.key)))?.sent; } catch {}
      if (!Array.isArray(went)) return;
      let confirmed = 0;
      for (const it of q) {
        if (!canDrain()) break;
        if (items.get(it.key) !== it || it.state !== "queued") continue;
        if (went.includes(it.key)) { items.delete(it.key); confirmed++; continue; }
        try {
          await saveQueued(it);
          if (!canDrain()) break;
          await go(it);
        } catch { it.state = "queued"; break; }
      }
      keepQueue();
      mirror();
      if (confirmed && canDrain()) { toast(confirmed === 1 ? "Message Sent" : "Messages sent"); after(); }
    }).finally(() => { draining = null; });
    return draining;
  }

  function keepUnsent(fields) {
    if (retired()) return false;
    try { return journal.put(STORAGE.unsent, { ...fieldsOf(fields), at: Date.now() }); } catch { return false; }
  }
  const keptUnsent = () => { const u = journal.get(STORAGE.unsent); return u && typeof u === "object" ? u : null; };
  const unsent = () => canRecover() ? keptUnsent() : null;
  const dropUnsent = () => journal.drop(STORAGE.unsent);
  let draftTimer=0, recovering=null;
  function track(fn, onSaved) {
    const state = { onSaved, id:null, sig:null, saving:null };
    tracked.set(fn, state);
    if(!draftTimer)draftTimer=setInterval(()=>{if(!dead&&online())flush({draftsOnly:true}).catch(()=>{})},5000);
    const stop = () => {
      tracked.delete(fn);
      if (!tracked.size) { clearInterval(draftTimer); draftTimer = 0; }
      return state.saving;
    };
    stop.pending = () => state.saving;
    return stop;
  }

  async function saveTracked(fn, state, keepalive, draftsOnly) {
    if (state.saving) {
      if (draftsOnly) return state.saving;
      await state.saving;
      if (!tracked.has(fn)) return true;
      return saveTracked(fn, state, keepalive, draftsOnly);
    }
    const snapshot = fn();
    if (!snapshot) return true;
    const draft = fieldsOf(snapshot), files = snapshot.files || [];
    draft.draftId ||= state.id;
    if (draftsOnly && files.some(file => file instanceof Blob)) return true;
    const signature = id => JSON.stringify([{ ...draft, draftId: id }, files.map(f => f?.ref ?? f?.i ?? [f?.name, f?.size])]);
    if (state.sig === signature(draft.draftId)) return true;
    const kept = unsent();
    state.saving = (async () => {
      const body = await payload(draft, files);
      if (!canDrain()) return false;
      const result = await api.saveDraft(body, null, { keepalive });
      if (!result?.id) return false;
      state.id = result.id;
      state.sig = signature(result.id);
      const latest = fn();
      if (!retired() && latest && kept && JSON.stringify(unsent()) === JSON.stringify(kept) &&
          JSON.stringify(fieldsOf(kept)) === JSON.stringify(fieldsOf(snapshot)) &&
          JSON.stringify(fieldsOf(latest)) === JSON.stringify(fieldsOf(snapshot))) dropUnsent();
      state.onSaved?.(result.id, snapshot);
      return true;
    })().catch(() => false).finally(() => { state.saving = null; });
    return state.saving;
  }

  async function recoverDraft(kept, keepalive) {
    const draft = fieldsOf(kept);
    let files = [];
    if (draft.draftId) {
      try {
        files = (await api.draft(draft.draftId)).compose.files;
        if (!Array.isArray(files)) throw new Error("Mail did not return the draft attachments");
      } catch (error) {
        if (error?.status !== 404) throw error;
        draft.draftId = null;
      }
    }
    if (!canDrain()) throw new Error(LOCKED);
    const result = await api.saveDraft(await payload(draft, files), null, { keepalive });
    if (!result?.id) throw new Error("Mail did not confirm the draft");
    if (!retired() && JSON.stringify(unsent()) === JSON.stringify(kept)) dropUnsent();
  }

  async function flush({ keepalive = false, draftsOnly = false } = {}) {
    if (retired()) return { lost: 0 };
    if (!canDrain()) return { lost: draftsOnly ? 0 : Number(!!keptUnsent()) + [...items.values()].filter(it => it.state === "queued" && !it.saved).length };
    let lost = 0;
    const jobs = [], queued = [];
    for (const it of draftsOnly?[]:[...items.values()]) {
      if (it.state === "waiting") jobs.push(go(it, { keepalive }));
      else if (it.state === "queued") queued.push(it);
    }
    if (queued.length) jobs.push(serialized(async () => {
      const records = new Map(storedQueue().map(record => [record.key, record]));
      await Promise.all(queued.map(async it => {
        if (items.get(it.key) !== it || it.state !== "queued") return;
        if (!canDrain()) { lost++; return; }
        const record = records.get(it.key);
        try {
          if (record && !(record.saved && record.draft.draftId)) await saveQueued(it, keepalive);
          items.delete(it.key);
        } catch { lost++; }
      }));
      keepQueue();
      mirror();
    }));
    for (const [fn, state] of tracked) {
      jobs.push(saveTracked(fn, state, keepalive, draftsOnly).then(ok => { if (!ok) lost++; }));
    }
    const u = !draftsOnly && !tracked.size && unsent();
    if (u && (u.subject || u.text || u.to?.length || u.cc?.length || u.bcc?.length)) {
      recovering ||= recoverDraft(u, keepalive).finally(() => { recovering = null; });
      jobs.push(recovering.catch(() => { lost++; }));
    }
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
  const refresh = () => { mirror(); return drain(); };
  if (store.on) offs.push(store.on("access", refresh));
  on(globalThis, "offline", mirror);
  on(globalThis, "online", refresh);
  offs.push(fw.on?.("visible", () => drain()) || (() => {}));
  // (put away during the undo window: it goes at once, as app.js's sendNow)
  on(globalThis, "pagehide", () => { for (const it of items.values()) if (it.state === "waiting") go(it, { keepalive: true }); });
  mirror();
  if (online()) queueMicrotask(() => drain());

  return {
    send, retry, undo, keepUnsent, unsent, dropUnsent, track, flush, refresh,
    pending: () => canRecover() ? [...items.values()].map(({ key, at, draft, state }) => ({ key, at, draft, state })) : [],
    destroy() {
      dead = true;clearInterval(draftTimer);
      for (const it of items.values()) { clearTimeout(it.timer); it.handle?.close?.(); }
      for (const f of offs.splice(0)) try { f(); } catch {}
    },
  };
}
