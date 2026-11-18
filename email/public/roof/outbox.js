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
  const canDrain = () => !retired() && (!store.get || store.get().access === "ok");
  const toast = (text, o) => { try { return fw.toast(text, o) || null; } catch { return null; } };
  const mirror = () => {
    if (retired()) return;
    const list = [...items.values()].map(({ key, at, draft, state, handle }) => ({ key, at, draft, state, undoInToast: state === "waiting" && !!handle?.close }));
    store.set({ outbox: list, sending: list.filter((x) => x.state === "waiting" || x.state === "sending").length });
  };
  function storedQueue() {
    const records = local.get(STORAGE.outbox, []);
    return Array.isArray(records) ? records.filter(r => typeof r?.key === "string" && r.key && r.draft && typeof r.draft === "object") : [];
  }
  for (const r of storedQueue()) items.set(r.key, { key: r.key, at: r.at || Date.now(), draft: fieldsOf(r.draft), state: "queued" });
  let knownQueued = new Set(items.keys());
  const keepQueue = () => {
    if (retired()) return false;
    const queued = new Map([...items].filter(([,it]) => it.state === "queued"));
    const added = [...queued.keys()].filter(key => !knownQueued.has(key));
    const removed = [...knownQueued].filter(key => !queued.has(key));
    if (!added.length && !removed.length) return true;
    // Other tabs may have queued or delivered messages since this outbox opened.
    const merged = new Map(storedQueue().map(item => [item.key, item]));
    for (const key of removed) merged.delete(key);
    for (const key of added) {
      const { at, draft } = queued.get(key);
      merged.set(key, {key, at, draft});
    }
    try {
      if (merged.size) local.put(STORAGE.outbox, [...merged.values()]);
      else local.drop(STORAGE.outbox);
      knownQueued = new Set(queued.keys());
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
    it.state = "sending";
    try { it.handle?.close?.(); } catch {}
    mirror();
    try {
      await api.sendDraft(it.draft.draftId, it.key, { keepalive });
      items.delete(it.key);
      mirror();
      if (!retired()) { toast("Message Sent"); after(); }
    } catch (e) {
      // (Mail refused it, 4xx: it's still in Drafts, to change there; no answer: Try Again asks whether it went first)
      const refused = e.status >= 400 && e.status < 500 && e.status !== 401;
      if (refused) items.delete(it.key);
      else it.state = "failed";
      mirror();
      if (!retired()) toast(refused ? "Couldn’t send. It’s in Drafts" : e.message || "Couldn’t send", refused ? undefined : { action: { label: "Try Again", run: () => retry(it.key) } });
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
      if (!saved?.id || retired()) throw new Error("Mail did not confirm the draft");
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
    if (draining || !canDrain() || !online()) return draining;
    const q = [...items.values()].filter((x) => x.state === "queued");
    if (!q.length) return null;
    draining = (async () => {
      let went = [];
      try { went = (await api.sent(q.map((x) => x.key)))?.sent || []; } catch {}
      for (const it of q) {
        if (!canDrain()) break;
        if (went.includes(it.key)) { items.delete(it.key); continue; }
        try {
          const saved = await api.saveDraft(await payload(it.draft, []));
          if (!saved?.id || retired()) break;
          it.draft = { ...it.draft, draftId: saved.id };
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
      const result = await api.saveDraft(await payload(draft, files), null, { keepalive });
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
    if (retired()) throw new Error("Mail was closed");
    const result = await api.saveDraft(await payload(draft, files), null, { keepalive });
    if (!result?.id) throw new Error("Mail did not confirm the draft");
    if (!retired() && JSON.stringify(unsent()) === JSON.stringify(kept)) dropUnsent();
  }

  async function flush({ keepalive = false, draftsOnly = false } = {}) {
    if (retired()) return { lost: 0 };
    let lost = 0;
    const jobs = [];
    for (const it of draftsOnly?[]:[...items.values()]) {
      if (it.state === "waiting") jobs.push(go(it, { keepalive }));
      else if (it.state === "queued") jobs.push(api.saveDraft(await payload(it.draft, []), null, { keepalive }).then(() => { items.delete(it.key); }, () => { lost++; }));
    }
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
  if (store.on) offs.push(store.on("access", () => drain()));
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
      dead = true;clearInterval(draftTimer);
      for (const it of items.values()) { clearTimeout(it.timer); it.handle?.close?.(); }
      for (const f of offs.splice(0)) try { f(); } catch {}
    },
  };
}
