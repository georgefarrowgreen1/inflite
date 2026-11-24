// Explicit, one-use first-party handoffs. Payloads live only in this account's
// memory. They are never URLs, storage records, sent messages, or automatic context.
const clean = (s, n) => typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").trim().slice(0, n) : "";
const pairAllowed = (source, target, kind) =>
  ["weather","calendar","notes","people","atlas"].includes(source) && target === "mail" && kind === "text" ||
  source === "fitness" && target === "weather" && kind === "ride" ||
  source === "mail" && target === "atlas" && kind === "mail-context" ||
  source === "atlas" && (target === "mail" && kind === "mail-reply" || target === "notes" && kind === "note-draft" || target === "calendar" && kind === "event-draft");
export function handoffPayload(source, target, kind, value) {
  if (["weather","calendar","notes","people"].includes(source) && target === "mail" && kind === "text") {
    const subject = clean(value?.subject, 180), text = typeof value?.text === "string" ? value.text.replace(/[\u0000\u202a-\u202e\u2066-\u2069]/g, "").slice(0, 8000) : "";
    const to=typeof value?.to==='string'&&value.to.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.to)?value.to:null;
    return subject && (text.trim()||source==='people'&&to) ? { subject, text, ...(to?{to}: {}) } : null;
  }
  if (source === "fitness" && target === "weather" && kind === "ride") {
    const p = value?.location, name = clean(p?.name, 120);
    if (!name || !Number.isFinite(p.lat) || Math.abs(p.lat) > 90 || !Number.isFinite(p.lon) || Math.abs(p.lon) > 180) return null;
    const i = value.interval;
    if (i != null && (!Number.isSafeInteger(i.start) || !Number.isSafeInteger(i.end) || i.end <= i.start || i.end - i.start > 48 * 36e5)) return null;
    return { location: { name, lat: p.lat, lon: p.lon }, interval: i ? { start: i.start, end: i.end } : null };
  }
  return null;
}
export function createHandoffs(F, { available, deliver, now = Date.now, timeoutMs = 20000 } = {}) {
  const owner = F.session.view?.user?.id;
  let record = null, dead = false;
  const live = () => !dead && !!owner && !F.signal.aborted && F.session.view?.user?.id === owner;
  const allowed = (source, target, kind) => live() && available(source) && available(target) && pairAllowed(source, target, kind);
  const valid = r => allowed(r.app, r.target, r.kind) && r === record && !r.controller.signal.aborted && !r.source.signal?.aborted && r.source.current?.() !== false && now() <= r.expires;
  const stop = () => { record?.controller.abort(); record = null; };
  F.signal.addEventListener("abort", stop, { once: true });
  return {
    forApp(app, requester) { return Object.freeze({
      can: (target, kind) => allowed(app, target, kind),
      async send(target, kind, value) {
        const ready = () => !record && allowed(app, target, kind) && requester.active?.() === true && !requester.signal?.aborted && requester.current?.() !== false;
        if (!ready()) return { ok: false, error: "Open the source app and try again." };
        let r, timer;
        try {
          // Atlas schemas are app code: ordinary shell startup never loads them.
          const parse = app === "atlas" || target === "atlas" ? (await import("../atlas/roof/handoffs.js")).handoffPayload : handoffPayload;
          if (!ready()) return { ok: false, cancelled: true };
          const payload = parse(app, target, kind, value);
          if (!payload) return { ok: false, error: "That app cannot use this item." };
          r = record = { token: [...crypto.getRandomValues(new Uint32Array(4))].join("-"), app, source: requester, target, kind, payload, controller: new AbortController(), expires: now() + 60000 };
          const result = await Promise.race([Promise.resolve().then(() => deliver(target, r.token, { signal: r.controller.signal, current: () => valid(r) })), new Promise(resolve => { timer = setTimeout(() => { r.controller.abort(); resolve({ ok: false, error: "The app took too long to open. Try again." }); }, timeoutMs); })]);
          return live() && !r.controller.signal.aborted ? result : { ok: false, cancelled: true };
        } catch { return { ok: false, error: "Couldn’t finish. Try again." }; }
        finally { clearTimeout(timer); if (r) { r.controller.abort(); if (record === r) record = null; } }
      },
      take(token) {
        const r = record;
        if (!r || !valid(r) || r.target !== app || token !== r.token || requester.active?.() !== true || requester.signal?.aborted || requester.current?.() === false || r.used) return null;
        r.used = true;
        return { kind: r.kind, ...r.payload };
      },
    }); },
    destroy() { dead = true; stop(); F.signal.removeEventListener("abort", stop); },
  };
}
