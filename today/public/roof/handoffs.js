// Explicit, one-use first-party handoffs. Payloads live only in this account's
// memory. They are never URLs, storage records, sent messages, or automatic context.
const clean = (s, n) => typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").trim().slice(0, n) : "";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const bodyText = (value, max) => typeof value === "string" && value.length <= max ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "") : null;
const mailSource = value => value == null ? undefined : value.app === "mail" && ID.test(value.threadId || "") ? { app: "mail", threadId: value.threadId } : null;
const pairAllowed = (source, target, kind) =>
  ["weather","calendar","notes","people","atlas"].includes(source) && target === "mail" && kind === "text" ||
  source === "fitness" && target === "weather" && kind === "ride" ||
  source === "mail" && target === "atlas" && kind === "mail-context" ||
  source === "atlas" && (target === "mail" && kind === "mail-reply" || target === "notes" && kind === "note-draft" || target === "calendar" && kind === "event-draft");
export function handoffPayload(source, target, kind, value) {
  if (source === "mail" && target === "atlas" && kind === "mail-context") {
    if (!ID.test(value?.threadId || "") || value.messageId != null && !ID.test(value.messageId)) return null;
    return { threadId: value.threadId, ...(value.messageId ? { messageId: value.messageId } : {}), subject: clean(value.subject, 180) };
  }
  if (source === "atlas" && target === "mail" && kind === "mail-reply") {
    const text = bodyText(value?.text, 16000);
    return ID.test(value?.threadId || "") && ID.test(value.messageId || "") && text?.trim() ? { threadId: value.threadId, messageId: value.messageId, text } : null;
  }
  if (source === "atlas" && ["notes", "calendar"].includes(target) && kind === (target === "notes" ? "note-draft" : "event-draft")) {
    const title = clean(value?.title, 160), from = mailSource(value?.source);
    if (!title || from === null) return null;
    if (target === "notes") {
      const text = bodyText(value?.text, 64000);
      return text?.trim() ? { title, text, ...(from ? { source: from } : {}) } : null;
    }
    const description = bodyText(value?.description ?? "", 4000);
    if (description === null) return null;
    const hasTime = value.start != null || value.end != null;
    if (hasTime && (!Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end) || value.start < 0 || value.end <= value.start || value.end > 8640000000000000 || value.end - value.start > 366 * 864e5)) return null;
    const timezone = clean(value.timezone, 80);
    if (timezone) { try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { return null; } }
    return { title, description, ...(hasTime ? { start: value.start, end: value.end } : {}), ...(timezone ? { timezone } : {}), ...(from ? { source: from } : {}) };
  }
  if (["weather","calendar","notes","people","atlas"].includes(source) && target === "mail" && kind === "text") {
    const subject = clean(value?.subject, 180), text = source === "atlas" ? bodyText(value?.text, 16000) : typeof value?.text === "string" ? value.text.replace(/[\u0000\u202a-\u202e\u2066-\u2069]/g, "").slice(0, 8000) : "";
    const to=source!=="atlas"&&typeof value?.to==='string'&&value.to.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.to)?value.to:null;
    return subject && (text?.trim()||source==='people'&&to) ? { subject, text, ...(to?{to}: {}) } : null;
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
  let record = null, busy = false, dead = false;
  const live = () => !dead && !!owner && !F.signal.aborted && F.session.view?.user?.id === owner;
  const allowed = (source, target, kind) => live() && available(source) && available(target) && pairAllowed(source, target, kind);
  const valid = r => allowed(r.sourceApp, r.target, r.kind) && r === record && !r.controller.signal.aborted && !r.source.signal?.aborted && r.source.current?.() !== false && now() <= r.expires;
  const stop = () => { record?.controller.abort(); record = null; };
  F.signal.addEventListener("abort", stop, { once: true });
  return {
    forApp(app, requester) { return Object.freeze({
      can: (target, kind) => allowed(app, target, kind),
      async send(target, kind, value) {
        if (busy || !allowed(app, target, kind) || requester.active?.() !== true || requester.signal?.aborted || requester.current?.() === false) return { ok: false, error: "Open the source app and try again." };
        const payload = handoffPayload(app, target, kind, value);
        if (!payload) return { ok: false, error: "This item cannot be used in that app." };
        const r = record = { token: [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join(""), sourceApp: app, source: requester, target, kind, payload, controller: new AbortController(), expires: now() + 60000 };
        busy = true; let timer;
        try {
          const result = await Promise.race([Promise.resolve().then(() => deliver(target, r.token, { signal: r.controller.signal, current: () => valid(r) })), new Promise(resolve => { timer = setTimeout(() => { r.controller.abort(); resolve({ ok: false, error: "The app is taking too long to open. Try again." }); }, timeoutMs); })]);
          return live() && !r.controller.signal.aborted ? result : { ok: false, cancelled: true };
        } catch (_) { return { ok: false, error: "That handoff couldn’t finish. Try again." }; }
        finally { clearTimeout(timer); r.controller.abort(); if (record === r) record = null; busy = false; }
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
