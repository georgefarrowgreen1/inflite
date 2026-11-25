import { createSystemClient as $, operationId as O } from "/roof/system-client.js";
import { openOfflineStore as z } from "/roof/offline-store.js";
async function G(y, i) {
  const w = $(y, { prefix: "/api/organise/" }), v = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map(), c = /* @__PURE__ */ new Map(), P = /* @__PURE__ */ new WeakMap(), h = /* @__PURE__ */ new Set();
  let u = null, b = !1, S = Promise.resolve(), I = 0;
  const l = w.live, f = () => {
    if (l()) for (const e of h) e();
  }, m = (e) => structuredClone(e), q = "A newer draft was kept in another tab. Keep this edit open or copy it before reopening the item.";
  try {
    u = await z(w.owner, { signal: y.signal });
    for (const e of await u.list("organise-" + i)) n.set(e.id, { ...e, state: e.state === "conflict" ? "conflict" : "queued" });
    for (const e of await u.list("organise-form-" + i)) c.set(e.recordId, e);
  } catch {
  }
  if (!l())
    throw u?.close(), new DOMException("Released", "AbortError");
  const T = (e) => {
    e && /^[a-f0-9]{32}$/.test(e.id) && e.kind === i && Number.isSafeInteger(e.version) && (v.get(e.id)?.version || 0) <= e.version && (v.set(e.id, { ...v.get(e.id), ...e }), I++);
  }, g = (e) => {
    const t = n.get(e);
    return t ? { ...v.get(e), id: e, kind: i, ...m(t.value), version: t.version, deleted: t.deleted, pending: !0, state: t.state, error: t.error, unpersisted: !!t.unpersisted, updatedAt: t.updatedAt } : v.get(e);
  };
  async function C({ q: e = "", cursor: t = null, range: r = null, signal: a } = {}) {
    const s = I, o = await w.request("list", { method: "POST", signal: a, body: { kind: i, q: e, cursor: t, ...r ? { fromDate: r[0], toDate: r[1], from: (/* @__PURE__ */ new Date(r[0] + "T00:00:00")).getTime(), to: (/* @__PURE__ */ new Date(r[1] + "T00:00:00")).getTime() } : {} } });
    if (!l() || a?.aborted) return null;
    for (const p of o.records) T(p);
    return f(), { ...o, records: o.records.map((p) => g(p.id)), start: s };
  }
  async function j(e) {
    if (c.has(e)) {
      const r = c.get(e);
      return { id: e, kind: i, ...m(r.value), version: r.version, formDraft: !0 };
    }
    if (n.has(e)) return g(e);
    const t = await w.request("record", { query: { kind: i, id: e } });
    return l() && T(t.record), g(e);
  }
  async function E(e, t) {
    if (!u) throw Error("Private device storage is unavailable. Keep this page open and try again.");
    const r = O();
    return await u.put({ ...e, journalStamp: r }, t) ? (e.journalStamp = r, !0) : !1;
  }
  async function D(e, t) {
    return await E(t, e) ? (n.set(t.id, t), !0) : (n.set(e.id, { ...e, state: "conflict", error: q, unpersisted: !0 }), !1);
  }
  function d(e) {
    const t = S.catch(() => {
    }).then(() => {
      if (!l()) throw new DOMException("Released", "AbortError");
      return e();
    });
    return S = t, t;
  }
  async function k(e, t, { version: r = 0, deleted: a = !1 } = {}) {
    if (!l()) throw new DOMException("Released", "AbortError");
    const s = n.get(e)?.operation;
    return d(async () => {
      const o = n.get(e), p = s?.version === r ? P.get(s) : null, M = { ...o, id: e, kind: "organise-" + i, version: o?.version ?? p ?? r, value: m(t), deleted: a, revision: (o?.revision || 0) + 1, updatedAt: Date.now(), state: o?.state === "conflict" ? "conflict" : "queued", error: o?.state === "conflict" ? o.error : "", operation: o?.operation || null, unpersisted: !1 };
      if (o?.state === "failed" && o.status >= 400 && o.status < 500 && ![408, 429].includes(o.status) && (M.operation = null), !await E(M, o ?? null))
        throw n.set(e, { ...M, state: "conflict", error: q, unpersisted: !0 }), f(), Error(q);
      return l() && (n.set(e, M), I++, f(), queueMicrotask(A)), g(e);
    });
  }
  async function A() {
    if (!(b || !l() || navigator.onLine === !1)) {
      b = !0;
      try {
        for (const [e] of n)
          for (; l() && navigator.onLine !== !1; ) {
            let t = n.get(e);
            if (!t || t.state !== "queued") break;
            try {
              const r = await d(async () => {
                if (t = n.get(e), !t || t.state !== "queued") return null;
                if (!t.operation) {
                  const s = { ...t, operation: { operationId: O(), version: t.version, value: m(t.value), deleted: t.deleted, revision: t.revision } };
                  if (!await D(t, s)) return null;
                  t = s;
                }
                return t.state = "saving", f(), t.operation;
              });
              if (!r) break;
              const a = await w.request("record", { method: "PUT", body: { kind: i, id: e, version: r.version, operationId: r.operationId, value: r.value, deleted: r.deleted } });
              await d(async () => {
                if (!l()) return;
                T(a.record), P.set(r, a.record.version);
                const s = c.get(e);
                if (s && s.version === r.version) {
                  const p = { ...s, version: a.record.version };
                  await E(p, s) && c.set(e, p);
                }
                window.dispatchEvent(new CustomEvent("inflite:organise-change", { detail: { owner: w.owner, kind: i } }));
                const o = n.get(e);
                o && (o.revision === r.revision ? (await u.remove(e, o), n.delete(e)) : await D(o, { ...o, version: a.record.version, operation: null, state: "queued", error: "" }), f());
              });
            } catch (r) {
              if (!l()) break;
              await d(async () => {
                const a = n.get(e);
                if (!a) return;
                const s = { ...a, state: [409, 410].includes(r.status) ? "conflict" : "failed", status: r.status || 0, error: r.message || "Retry when connected." };
                await D(a, s), f();
              }).catch(() => {
              });
              break;
            }
          }
      } finally {
        b = !1, f();
      }
    }
  }
  async function L(e) {
    await d(async () => {
      const t = n.get(e);
      !t || t.state === "conflict" || (await D(t, { ...t, state: "queued", error: "" }), f());
    }), A();
  }
  async function R(e) {
    await d(async () => {
      const t = n.get(e);
      if (t?.state === "saving") throw Error("Wait for the current save.");
      t && await u?.remove(e, t), n.delete(e), f();
    });
  }
  async function K(e) {
    const t = n.get(e);
    if (!t) throw Error("That draft is no longer available.");
    const r = O();
    return await k(r, { ...t.value, title: t.value.title + " (copy)" }, { version: 0 }), await R(e), r;
  }
  const W = () => {
    for (const e of n.values()) e.state === "failed" && (!e.status || e.status >= 500 || [408, 429].includes(e.status)) && L(e.id).catch(() => {
    });
    A();
  };
  window.addEventListener("online", W, { signal: y.signal }), y.signal.addEventListener("abort", () => {
    u?.close(), v.clear(), n.clear(), c.clear(), h.clear();
  }, { once: !0 }), queueMicrotask(A);
  async function N(e, t, r) {
    return d(async () => {
      const a = { id: "form:" + e, recordId: e, kind: "organise-form-" + i, value: m(t), version: r, updatedAt: Date.now() };
      if (!await E(a, c.get(e) ?? null)) throw Error(q);
      c.set(e, a), f();
    });
  }
  async function U(e) {
    return d(async () => {
      const t = c.get(e);
      t && await u?.remove("form:" + e, t), c.delete(e), f();
    });
  }
  const x = () => [...n.values()].filter((e) => e.unpersisted).length;
  async function _() {
    try {
      await S;
    } catch (e) {
      if (!x()) throw e;
    }
    return { lost: x() };
  }
  return { list: C, get: j, save: k, retry: L, discard: R, copy: K, view: g, keepForm: N, dropForm: U, localForms: () => [...c.values()].map((e) => ({ id: e.recordId, kind: i, ...m(e.value), version: e.version, formDraft: !0, updatedAt: e.updatedAt })), ready: () => !!u, subscribe(e) {
    return h.add(e), () => h.delete(e);
  }, pending: () => [...n.keys()].map(g), snapshot: () => [.../* @__PURE__ */ new Set([...v.keys(), ...n.keys()])].map(g).filter((e) => !e.deleted), busy: () => b || x() > 0, flush: _, remote: async (e) => (await w.request("record", { query: { kind: i, id: e } })).record };
}
export {
  G as createStore
};
