// Account-owned OS recovery. A retry resumes the existing module; this service
// never destroys an editor, replays a write, or treats online as proof of sync.
const NAMES = Object.freeze({ fitness: "Fitness", weather: "Weather", markets: "Markets", chats: "Chats", mail: "Mail" });
const PHASES = new Set(["ready", "error", "loading", "signin", "locked", "offline"]);
const aborted = () => new DOMException("This recovery request was released", "AbortError");
const reason = value => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").trim().slice(0, 240) : "";
const permits = fn => { try { return !fn || fn() !== false; } catch (_) { return false; } };
export function availabilityOf(value) {
  return { local: value?.local === true, pending: Number.isSafeInteger(value?.pending) ? Math.max(0, Math.min(1000, value.pending)) : 0,
    saving: value?.saving === true, draft: value?.draft === true, error: value?.error === true,
    updatedAt: Number.isSafeInteger(value?.updatedAt) && value.updatedAt > 0 ? value.updatedAt : null };
}
export function recoveryDetail(app, online) {
  if (app.phase === "signin") return "Sign in to continue";
  if (app.phase === "locked") return "Unlock to continue";
  if (app.unsynced) return app.saving ? "Saving changes…" : !online ? "Unsynced changes in this tab. Keep it open." : "Changes still need to sync";
  if (app.syncError) return "Some changes couldn’t save. Open the app to review.";
  if (app.localDraft) return "Draft open in this tab";
  if (!online) return app.availableOffline ? "Current content available; updates need a connection" : "A connection is needed to open this view";
  if (app.phase === "offline") return app.availableOffline ? "Current content kept; service unavailable" : "Reconnect to continue";
  if (app.pending) return "Resuming…";
  return ({ idle: "Not opened yet", loading: "Opening…", ready: "Ready to continue", error: "Couldn’t open" })[app.phase] || "Open the app to check";
}

export function createWorkspaceRecovery(F, options = {}) {
  const owner = F.session.view?.user?.id, listeners = new Set(), records = new Map(), offs = [];
  const events = options.events || globalThis, network = options.network || globalThis.navigator || {};
  let dead = false, online = network.onLine !== false, generation = 0;
  const live = () => !dead && !!owner && !F.signal.aborted && F.session.view?.user?.id === owner;
  const enabled = app => live() && Object.hasOwn(NAMES, app) && !!F.session.apps?.[app] && (app !== "mail" || F.session.view?.apps?.mail === true);
  const valid = (app, lease = {}) => enabled(app) && !lease.signal?.aborted && permits(lease.current);
  const state = app => { if (!records.has(app)) records.set(app, { phase: "idle", provider: null, loaded: false, epoch: 0, pending: null }); return records.get(app); };
  const handleLive = app => { try { return !options.getHandle?.(app)?.signal?.aborted; } catch (_) { return false; } };
  function row(app) {
    const record = state(app), phase = ["locked", "signin"].includes(record.provider) ? record.provider : record.phase === "loading" || record.provider === "loading" ? "loading" : record.phase === "error" || record.provider === "error" ? "error" : record.provider === "offline" ? "offline" : record.loaded ? "ready" : record.phase;
    const a = availabilityOf(record.availability);
    return Object.freeze({ app, name: NAMES[app], phase, loaded: record.loaded, pending: !!record.pending,
      availableOffline: record.loaded && a.local, unsynced: a.pending, saving: a.saving, localDraft: a.draft, syncError: a.error, updatedAt: a.updatedAt,
      retryable: online && !record.pending && !["locked", "signin", "loading"].includes(phase) && typeof options.retry === "function",
      error: phase === "error" ? `${NAMES[app]} couldn’t finish opening. Try again when you’re connected.` : null });
  }
  function snapshot() { return Object.freeze({ online, apps: Object.freeze(live() ? Object.keys(NAMES).filter(enabled).map(row) : []) }); }
  function changed() {
    if (!live()) return;
    const value = snapshot(), mine = ++generation;
    try { options.onChange?.(value); } catch (_) {}
    for (const registration of [...listeners]) { if (!live() || generation !== mine) break; if (listeners.has(registration)) try { registration.fn(value); } catch (_) {} }
  }
  // The caller stops waiting independently of an account-owned module mount.
  // Its late result remains observed and cannot act through an expired lease.
  function owned(work, app, lease = {}, timeout = 0) {
    if (!valid(app, lease)) return Promise.reject(aborted());
    return new Promise((resolve, reject) => {
      let done = false, timer;
      const stop = () => finish(reject, aborted());
      const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); F.signal.removeEventListener("abort", stop); lease.signal?.removeEventListener("abort", stop); fn(value); };
      F.signal.addEventListener("abort", stop, { once: true }); lease.signal?.addEventListener("abort", stop, { once: true });
      if (timeout) timer = setTimeout(() => finish(resolve, { ok: false, error: "This app is still opening. Try again in a moment." }), timeout);
      Promise.resolve().then(() => { if (!valid(app, lease)) throw aborted(); return work(); }).then(value => valid(app, lease) ? finish(resolve, value) : stop(), error => valid(app, lease) ? finish(reject, error) : stop());
    });
  }
  async function load(app, work, lease = {}) {
    if (!valid(app, lease) || typeof work !== "function") throw aborted();
    const record = state(app), epoch = ++record.epoch;
    record.phase = "loading"; changed();
    try {
      const instance = await owned(work, app, lease);
      if (valid(app, lease) && record.epoch === epoch && handleLive(app)) {
        record.loaded = !!instance; record.phase = instance ? "ready" : "error"; changed();
      }
      return instance;
    } catch (error) {
      if (valid(app, lease) && record.epoch === epoch) { record.phase = record.loaded ? "ready" : "error"; changed(); }
      throw error;
    } finally {
      if (live() && record.epoch === epoch && record.phase === "loading") { record.phase = record.loaded ? "ready" : "idle"; changed(); }
    }
  }
  function update(app, value) {
    if (!enabled(app)) return;
    const phase = typeof value === "string" ? value : value?.status || (value?.error ? "error" : value?.loading ? "loading" : value?.ready ? "ready" : null);
    if (!PHASES.has(phase)) return;
    const record = state(app);
    const availability = typeof value === "object" ? availabilityOf(value?.availability) : record.availability;
    if (record.provider === phase && JSON.stringify(record.availability) === JSON.stringify(availability)) return;
    record.availability = availability;
    record.provider = phase;
    if (phase === "ready") { record.loaded = true; if (record.phase !== "loading") record.phase = "ready"; }
    changed();
  }
  function activity(app, status, detail, pending) {
    try { options.activity?.put(`recover-${app}`, { title: `${NAMES[app]} recovery`, detail, kind: "recovery", status,
      actions: pending ? [] : [{ id: "retry", label: `Retry ${NAMES[app]}`, current: () => enabled(app), run: lease => recover(app, lease) }] }); } catch (_) {}
  }
  function recover(app, lease = {}) {
    if (!valid(app, lease)) return Promise.resolve({ ok: false, cancelled: true });
    if (!online) return Promise.resolve({ ok: false, error: "You’re offline. Reconnect before refreshing this app." });
    const record = state(app);
    if (record.pending) return record.pending;
    if (!row(app).retryable || !handleLive(app)) return Promise.resolve({ ok: false, error: "Open this app to sign in or unlock it." });
    const controller = new AbortController(), current = () => valid(app, lease) && !controller.signal.aborted && handleLive(app) && !["locked", "signin"].includes(record.provider);
    let outcome = "running";
    record.cancel = () => controller.abort();
    const signal = AbortSignal.any([F.signal, controller.signal, ...(lease.signal ? [lease.signal] : [])]);
    const work = owned(() => options.retry(app, { signal, current }), app, { signal, current }, Math.max(100, Math.min(20000, options.timeoutMs || 15000)));
    const pending = record.pending = work.then(answer => {
      if (!current() || answer?.cancelled) { outcome = "cancelled"; return { ok: false, cancelled: true }; }
      const ok = answer === true || answer?.ok === true;
      outcome = ok ? "succeeded" : "failed";
      if (ok) record.phase = record.loaded ? "ready" : "idle";
      else if (!record.loaded) record.phase = "error";
      const message = reason(answer?.error) || "This app is still unavailable. Try again in a moment.";
      activity(app, ok ? "succeeded" : "failed", ok ? `${NAMES[app]} view resumed. Your current app state was kept.` : message, ok);
      return ok ? { ok: true } : { ok: false, error: message };
    }, error => {
      if (!current() || error?.name === "AbortError") { outcome = "cancelled"; return { ok: false, cancelled: true }; }
      outcome = "failed";
      if (!record.loaded) record.phase = "error";
      activity(app, "failed", "This app couldn’t recover. Your current app state was kept.");
      return { ok: false, error: "This app couldn’t recover. Your current app state was kept." };
    }).finally(() => { controller.abort(); if (record.pending === pending) { record.pending = null; record.cancel = null; if (outcome === "cancelled" && live()) activity(app, "cancelled", "Recovery stopped. Your current app state was kept.", true); changed(); } });
    activity(app, "running", `Resuming ${NAMES[app]} without closing its current view.`, true); changed(); return pending;
  }
  function networkChanged() { if (!live()) return; const next = network.onLine !== false; if (next === online) return; online = next; changed(); }
  for (const type of ["online", "offline"]) { events.addEventListener?.(type, networkChanged); offs.push(() => events.removeEventListener?.(type, networkChanged)); }
  if (F.on) offs.push(F.on("apps", () => { for (const [app, record] of records) if (!enabled(app)) { record.cancel?.(); record.epoch++; records.delete(app); options.activity?.remove?.(`recover-${app}`); } changed(); }));
  function destroy() { if (dead) return; dead = true; for (const record of records.values()) record.cancel?.(); records.clear(); listeners.clear(); for (const off of offs.splice(0)) try { off?.(); } catch (_) {} F.signal.removeEventListener("abort", destroy); }
  F.signal.addEventListener("abort", destroy, { once: true }); if (F.signal.aborted) destroy();
  return { snapshot, load, update, recover, destroy,
    actions: () => snapshot().apps.filter(app => app.retryable && ["ready", "error", "offline"].includes(app.phase)).map(app => ({ id: `retry-${app.app}`, label: `${app.phase === "error" || app.phase === "offline" ? "Retry" : "Resume"} ${app.name}`, app: app.app, enabled: app.retryable, keywords: ["recover", "reconnect", "refresh"], current: () => enabled(app.app) && handleLive(app.app) && !["locked", "signin"].includes(state(app.app).provider), run: lease => recover(app.app, lease) })),
    subscribe(fn) { if (!live() || typeof fn !== "function") return () => {}; const registration = { fn }; listeners.add(registration); return () => listeners.delete(registration); } };
}
