// Mail's module: what's done to conversations, and the list asked of Mail (One roof stage 4, spec §4.1, S4-D18; app.js
// act/actionToast/markAllRead/emptyTrash/loadList 3535–3600, 4410–4560). Optimistic: the store changes at once (a row
// that no longer belongs in the list shown, logic.inView, leaves it), then Mail is asked, always through
// api.batch (POST /api/threads/batch, one preflight for a whole visit, S4-D2); on an error the rows are put back.
// createActions(ctx) → {
//   act(ids, action, opts) → Promise   action: done | inbox | read | unread | flag | unflag | trash | restore | category |
//       snooze | unsnooze | delete; opts { category, sender, until, undo = true, say } (say: the toast's words instead);
//       Undo (the framework toast's action) sends the inverse.
//   batch(body) → Promise               api.batch(body), then the counts and the list asked for again, quietly
//   load({ more, quiet }) → Promise<bool>   the list for where the module is (store lens/filter/address/box/query):
//       GET /api/threads, or a search by POST /api/threads/search (never a URL); more: the next page; quiet: in place
//   counts() → Promise                  /api/counts into the store (logic.countsOf)
//   markAllRead(), emptyTrash()         from the Views sheet
// }   (load, counts, markAllRead and emptyTrash are MM's additions to B0-b's two.)
// An action that takes the open conversation (store threadId) out of the list shown, any but read, calls
// ctx.leave(id, nextId) first (mail.js's: a phone goes back to the list, an iPad's pane opens the next row, else the one
// before, else nothing).
const INVERSE = { done: "inbox", trash: "restore", flag: "unflag", unflag: "flag", read: "unread", unread: "read" };
const SAY = { done: "Done", inbox: "Back in Inbox", trash: "Moved to Trash", restore: "Restored", unsnooze: "Back in Inbox", flag: "Flagged", unflag: "Unflagged", read: "Marked as Read", unread: "Marked as Unread", delete: "Deleted" };

export function createActions(ctx) {
  const { store, api, logic, fw } = ctx;
  let token = 0, edits = 0, acting = 0, again = false;
  const toast = (text, o) => { try { return fw.toast(text, o) || null; } catch { return null; } };
  const setList = (patch) => store.set({ list: { ...store.get().list, ...patch } });
  const lastRows = new Map();

  async function counts() {
    try {
      const was = JSON.stringify(store.get().counts), c = logic.countsOf(await api.counts());
      store.set({ counts: c, offline: false });
      // (Today's Mail card shows these numbers: asked for again on its next show)
      if (was !== "null" && was !== JSON.stringify(c)) try { fw.changed?.(); } catch {}
    } catch (e) { if (!e.status) store.set({ offline: navigator.onLine === false }); }
  }

  // → true once what Mail answered is what's shown
  async function load({ more = false, quiet = false } = {}) {
    const s0 = store.get();
    if (more && (s0.list.loading || !s0.list.more)) return false;
    if (s0.access && s0.access !== "ok") return false;
    const my = ++token, e0 = edits;
    const ask = logic.askOf(s0), seen = JSON.stringify(ask);
    // (a view switched back to: the list it last had, shown at once while Mail's asked again, never an empty screen first;
    // only for this page's memory, never kept anywhere)
    if (!quiet) setList({ loading: true, err: more ? s0.list.err : null, rows: more ? s0.list.rows : lastRows.get(seen) || [] });
    const last = s0.list.rows[s0.list.rows.length - 1];
    const before = more && last ? last.sort ?? last.date : undefined;
    try {
      const res = ask.q
        ? await api.search({ q: ask.q, view: ask.view === "trash" ? "trash" : "all", category: null, address: ask.address, before })
        : await api.threads({ view: ask.view, category: ask.category, address: ask.address, before });
      if (my !== token) return false;
      // (something changed here while it was on its way: asked for again once Mail has it)
      if (quiet && !more && edits !== e0) {
        if (!acting) return load({ quiet });
        again = true;
        return false;
      }
      const s = store.get();
      let rows;
      if (s.box === "drafts") rows = (res.drafts || []).map((d) => ({ ...d, draft: true }));
      else if (more) rows = s.list.rows.concat(res.threads || []);
      else {
        // (older pages already loaded are kept, but not one that's now in this page)
        const got = res.threads || [], oldest = got[got.length - 1], fresh = new Set(got.map((t) => t.id));
        const older = quiet && oldest && res.hasMore ? s.list.rows.filter((t) => !t.draft && !fresh.has(t.id) && (t.sort ?? t.date) < (oldest.sort ?? oldest.date)) : [];
        rows = got.concat(older);
      }
      if (!more) { lastRows.set(seen, rows.slice(0, 60)); if (lastRows.size > 12) lastRows.delete(lastRows.keys().next().value); }
      store.set({ list: { rows, more: s.box === "drafts" ? false : !!res.hasMore, loading: false, err: null }, updatedAt: Date.now(), offline: false });
      return true;
    } catch (e) {
      if (my !== token) return false;
      const off = !e.status && navigator.onLine === false;
      if (off) store.set({ offline: true });
      if (more || (quiet && store.get().list.rows.length)) { setList({ loading: false }); if (!quiet) toast(e.message); }
      else setList({ loading: false, err: e.status === 401 ? null : e.message || "Couldn’t load your mail." });
      return false;
    }
  }

  async function batch(body, { reload = true } = {}) {
    edits++; acting++;
    try {
      return await api.batch(body);
    } finally {
      acting--;
      if (reload) { counts(); if (!acting && again) { again = false; load({ quiet: true }); } }
    }
  }

  async function act(ids, action, opts = {}) {
    ids = [].concat(ids).filter((x) => typeof x === "string" && x);
    if (!ids.length) return { ok: false };
    const { category, sender, until, undo = true, say } = opts;
    const extra = { ...(category && { category }), ...(sender && { sender: true }), ...(until && { until }) };
    const patch = action === "delete" ? null : logic.patchOf(action, extra);
    const s = store.get(), ask = logic.askOf(s), was = s.list.rows;
    const at = new Map(was.map((r, i) => [r.id, i]));
    const t0 = was.find((r) => ids.includes(r.id)) || (ids.includes(s.thread?.t?.id) ? s.thread.t : null);
    const wasDone = !!t0?.done;
    // (the conversation that's open, read by opening it, stays till the list's next asked for)
    const rows = was.flatMap((r) => {
      if (!ids.includes(r.id)) return [r];
      if (!patch) return [];
      const n = { ...r, ...patch };
      return logic.inView(n, ask) || (action === "read" && r.id === s.threadId) ? [n] : [];
    });
    const thread = s.thread?.t && ids.includes(s.thread.t.id) && patch ? { ...s.thread, t: { ...s.thread.t, ...patch } } : s.thread;
    // (the open conversation no longer where the list is: left first, as app.js's leaveThread; the next row, else the one
    // before, for an iPad's pane)
    const open = s.threadId && ids.includes(s.threadId) ? s.threadId : null;
    const leaving = open && action !== "read" && (!patch || (at.has(open) ? !rows.some((r) => r.id === open) : !logic.inView({ ...(t0 || {}), ...patch }, ask)));
    if (leaving) {
      const i = at.has(open) ? at.get(open) : -1, rest = (k) => was.slice(k).find((r) => !ids.includes(r.id));
      const next = i < 0 ? null : (rest(i + 1) || [...was.slice(0, i)].reverse().find((r) => !ids.includes(r.id)) || null);
      try { ctx.leave?.(open, next?.id || null); } catch (e) { console.error(e); }
    }
    store.set({ list: { ...s.list, rows }, thread }, action);
    // (Undo: the inverse, Later from Done back to Done)
    const back = action === "snooze" ? (wasDone ? "done" : "unsnooze") : INVERSE[action];
    const words = say || (action === "snooze" ? `Later: ${logic.fmtWhen(until)}` : action === "category"
      ? (sender && t0?.from ? `${logic.displayName(t0.from)} will always show in ${category === "people" ? "People" : "Updates"}` : `Moved to ${category === "people" ? "People" : "Updates"}`)
      : SAY[action]);
    const undoable = undo && back && ["done", "trash", "snooze"].includes(action);
    if (words) toast(words, undoable ? { action: { label: "Undo", run: () => act(ids, back, { undo: false }) } } : undefined);
    try {
      await batch({ ids, action, ...extra });
      // (back where it was, after an undo: in the list again)
      if (["inbox", "restore", "unsnooze", "done", "category"].includes(action) && !was.some((r) => ids.includes(r.id))) load({ quiet: true });
      return { ok: true };
    } catch (e) {
      // put back: each row where it was
      const now = store.get(), keep = now.list.rows.filter((r) => !ids.includes(r.id));
      for (const r of was.filter((x) => ids.includes(x.id)).sort((a, b) => at.get(a.id) - at.get(b.id))) keep.splice(Math.min(at.get(r.id), keep.length), 0, r);
      store.set({ list: { ...now.list, rows: keep }, thread: now.thread?.t && ids.includes(now.thread.t.id) && t0 ? { ...now.thread, t: { ...now.thread.t, ...pick(t0, patch) } } : now.thread }, "put back");
      toast(e.message || "Couldn’t do that. Try again.");
      return { ok: false, error: e };
    }
  }
  const pick = (t, patch) => Object.fromEntries(Object.keys(patch || {}).map((k) => [k, t[k]]));

  async function markAllRead() {
    const s = store.get();
    store.set({ list: { ...s.list, rows: s.list.rows.map((r) => (r.unread ? { ...r, unread: 0 } : r)).filter((r) => logic.askOf(s).view !== "unread" || !r.unread) } });
    const { view, category, address, q } = logic.askOf(s);
    try { await batch({ action: "read", every: { view, category, address, q } }); } catch (e) { toast(e.message); }
    load({ quiet: true });
  }

  async function emptyTrash() {
    const s = store.get();
    if (s.box === "trash") setList({ rows: [], more: false });
    try { await api.emptyTrash(); toast("Trash Emptied"); } catch (e) { toast(e.message); load({ quiet: true }); }
    counts();
  }

  return { act, batch, load, counts, markAllRead, emptyTrash };
}
