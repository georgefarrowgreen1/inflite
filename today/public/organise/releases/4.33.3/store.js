import { createSystemClient as Q, operationId as B } from "/roof/system-client.js";
import { openOfflineStore as V } from "/roof/offline-store.js";
async function Z(q, u) {
  const w = Q(q, { prefix: "/api/organise/" }), v = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), L = /* @__PURE__ */ new WeakMap(), E = /* @__PURE__ */ new Set();
  let f = null, D = !1, x = Promise.resolve(), T = 0;
  const m = /* @__PURE__ */ new Map(), R = /* @__PURE__ */ new WeakMap(), l = w.live, d = () => {
    if (l()) for (const e of E) e();
  }, y = (e) => structuredClone(e), M = "A newer draft was kept in another tab. Keep this edit open or copy it before reopening the item.";
  try {
    f = await V(w.owner, { signal: q.signal });
    for (const e of await f.list("organise-" + u)) n.set(e.id, { ...e, state: e.state === "conflict" ? "conflict" : "queued" });
    for (const e of await f.list("organise-form-" + u)) i.set(e.recordId, e);
  } catch {
  }
  if (!l())
    throw f?.close(), new DOMException("Released", "AbortError");
  const k = (e) => {
    e && /^[a-f0-9]{32}$/.test(e.id) && e.kind === u && Number.isSafeInteger(e.version) && (v.get(e.id)?.version || 0) <= e.version && (v.set(e.id, { ...v.get(e.id), ...e }), T++);
  };
  function O(e, t) {
    return m.has(e) || m.set(e, { version: t, editors: /* @__PURE__ */ new Set() }), m.get(e);
  }
  const C = (e, t) => (t && e.version === t.version && R.set(e, O(e.id, t.version)), e), U = (e) => R.get(e) || { version: e.version || 0 }, g = (e) => {
    const t = n.get(e);
    return t ? C({ ...v.get(e), id: e, kind: u, ...y(t.value), version: t.version, deleted: t.deleted, pending: !0, state: t.state, error: t.error, unpersisted: !!t.unpersisted, updatedAt: t.updatedAt }, t) : v.get(e);
  };
  async function _({ q: e = "", cursor: t = null, range: r = null, signal: s } = {}) {
    const a = T, c = await w.request("list", { method: "POST", signal: s, body: { kind: u, q: e, cursor: t, ...r ? { fromDate: r[0], toDate: r[1], from: (/* @__PURE__ */ new Date(r[0] + "T00:00:00")).getTime(), to: (/* @__PURE__ */ new Date(r[1] + "T00:00:00")).getTime() } : {} } });
    if (!l() || s?.aborted) return null;
    for (const o of c.records) k(o);
    return d(), { ...c, records: c.records.map((o) => g(o.id)), start: a };
  }
  async function $(e) {
    if (i.has(e)) {
      const r = i.get(e);
      return C({ id: e, kind: u, ...y(r.value), version: r.version, formDraft: !0 }, n.get(e));
    }
    if (n.has(e)) return g(e);
    const t = await w.request("record", { query: { kind: u, id: e } });
    return l() && k(t.record), n.has(e) ? g(e) : t.record;
  }
  async function A(e, t) {
    if (!f) throw Error("Private device storage is unavailable. Keep this page open and try again.");
    const r = B();
    return await f.put({ ...e, journalStamp: r }, t) ? (e.journalStamp = r, !0) : !1;
  }
  async function S(e, t) {
    return await A(t, e) ? (n.set(t.id, t), !0) : (n.set(e.id, { ...e, state: "conflict", error: M, unpersisted: !0 }), !1);
  }
  function p(e) {
    const t = x.catch(() => {
    }).then(() => {
      if (!l()) throw new DOMException("Released", "AbortError");
      return e();
    });
    return x = t, t;
  }
  async function W(e, t, { version: r = 0, deleted: s = !1, editorBase: a } = {}) {
    if (!l()) throw new DOMException("Released", "AbortError");
    const c = n.get(e)?.operation;
    return p(async () => {
      const o = n.get(e), h = c?.version === r ? L.get(c) : null, b = { ...o, id: e, kind: "organise-" + u, version: o?.version ?? h ?? r, value: y(t), deleted: s, revision: (o?.revision || 0) + 1, updatedAt: Date.now(), state: o?.state === "conflict" ? "conflict" : "queued", error: o?.state === "conflict" ? o.error : "", operation: o?.operation || null, unpersisted: !1 };
      if (o?.state === "failed" && o.status >= 400 && o.status < 500 && ![408, 429].includes(o.status) && (b.operation = null), !await A(b, o ?? null))
        throw n.set(e, { ...b, state: "conflict", error: M, unpersisted: !0 }), d(), Error(M);
      if (l()) {
        const N = O(e, b.version);
        a && N !== a && N.editors.add(a), n.set(e, b), T++, d(), queueMicrotask(I);
      }
      return g(e);
    });
  }
  async function I() {
    if (!(D || !l() || navigator.onLine === !1)) {
      D = !0;
      try {
        for (const [e] of n)
          for (; l() && navigator.onLine !== !1; ) {
            let t = n.get(e);
            if (!t || t.state !== "queued") break;
            try {
              const r = await p(async () => {
                if (t = n.get(e), !t || t.state !== "queued") return null;
                if (!t.operation) {
                  const a = { ...t, operation: { operationId: B(), version: t.version, value: y(t.value), deleted: t.deleted, revision: t.revision } };
                  if (!await S(t, a)) return null;
                  t = a;
                }
                return t.state = "saving", d(), t.operation;
              });
              if (!r) break;
              const s = await w.request("record", { method: "PUT", body: { kind: u, id: e, version: r.version, operationId: r.operationId, value: r.value, deleted: r.deleted } });
              await p(async () => {
                if (!l()) return;
                k(s.record), L.set(r, s.record.version);
                const a = O(e, r.version);
                a.version = s.record.version;
                for (const h of a.editors) h.version = a.version;
                const c = i.get(e);
                if (c && c.version === r.version) {
                  const h = { ...c, version: s.record.version };
                  await A(h, c) && i.set(e, h);
                }
                window.dispatchEvent(new CustomEvent("inflite:organise-change", { detail: { owner: w.owner, kind: u } }));
                const o = n.get(e);
                o && (o.revision === r.revision ? (await f.remove(e, o), n.delete(e), m.delete(e)) : await S(o, { ...o, version: s.record.version, operation: null, state: "queued", error: "" }), d());
              });
            } catch (r) {
              if (!l()) break;
              await p(async () => {
                const s = n.get(e);
                if (!s) return;
                const a = { ...s, state: [409, 410].includes(r.status) ? "conflict" : "failed", status: r.status || 0, error: r.message || "Retry when connected." };
                await S(s, a), d();
              }).catch(() => {
              });
              break;
            }
          }
      } finally {
        D = !1, d();
      }
    }
  }
  async function j(e) {
    await p(async () => {
      const t = n.get(e);
      !t || t.state === "conflict" || (await S(t, { ...t, state: "queued", error: "" }), d());
    }), I();
  }
  async function K(e, t) {
    await p(async () => {
      const r = n.get(e);
      if (!(t && (!t.current() || r !== t.row || i.get(e) !== t.form))) {
        if (r?.state === "saving") throw Error("Wait for the current save.");
        r && await f?.remove(e, r), t?.form && (await f?.remove(t.form.id, t.form), i.delete(e)), n.delete(e), m.delete(e), d();
      }
    });
  }
  async function z(e, t, r) {
    const s = { row: n.get(e), form: i.get(e), current: r }, a = B(), c = " (copy)", o = t.title.length + c.length <= 160 ? t.title + c : t.title;
    return await W(a, { ...t, title: o }, { version: 0 }), await K(e, s), a;
  }
  const F = () => {
    for (const e of n.values()) e.state === "failed" && (!e.status || e.status >= 500 || [408, 429].includes(e.status)) && j(e.id).catch(() => {
    });
    I();
  };
  window.addEventListener("online", F, { signal: q.signal }), q.signal.addEventListener("abort", () => {
    f?.close(), v.clear(), n.clear(), m.clear(), i.clear(), E.clear();
  }, { once: !0 }), queueMicrotask(I);
  async function G(e, t, r) {
    return p(async () => {
      const s = { id: "form:" + e, recordId: e, kind: "organise-form-" + u, value: y(t), version: r, updatedAt: Date.now() };
      if (!await A(s, i.get(e) ?? null)) throw Error(M);
      i.set(e, s), d();
    });
  }
  async function H(e) {
    return p(async () => {
      const t = i.get(e);
      t && await f?.remove("form:" + e, t), i.delete(e), d();
    });
  }
  const P = () => [...n.values()].filter((e) => e.unpersisted).length;
  async function J() {
    try {
      await x;
    } catch (e) {
      if (!P()) throw e;
    }
    return { lost: P() };
  }
  return { list: _, get: $, save: W, retry: j, discard: K, copy: z, view: g, editBase: U, keepForm: G, dropForm: H, localForms: () => [...i.values()].map((e) => ({ id: e.recordId, kind: u, ...y(e.value), version: e.version, formDraft: !0, updatedAt: e.updatedAt })), ready: () => !!f, subscribe(e) {
    return E.add(e), () => E.delete(e);
  }, pending: () => [...n.keys()].map(g), snapshot: () => [.../* @__PURE__ */ new Set([...v.keys(), ...n.keys()])].map(g).filter((e) => !e.deleted), busy: () => D || P() > 0, flush: J, remote: async (e) => (await w.request("record", { query: { kind: u, id: e } })).record };
}
export {
  Z as createStore
};
