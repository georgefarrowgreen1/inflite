// Web Push (as the inflite apps send it: functions/_notify.js in the georgefarrowgreen repo). A VAPID key Mail makes for
// itself on first use and keeps in D1; each phone or browser that turns notifications on is a subscription; a notice is
// encrypted for each (RFC 8291, aes128gcm) and handed to its push service.

const enc = new TextEncoder();

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const concat = (...a) => {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) {
    out.set(x, o);
    o += x.length;
  }
  return out;
};

// Push services Mail will send to; any other host is refused, so the server can't be pointed at arbitrary URLs.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /\.notify\.windows\.com$/,
  /^android\.googleapis\.com$/,
];
export function pushEndpointOk(u) {
  if (typeof u !== "string" || u.length > 1000) return false;
  try {
    const x = new URL(u);
    return x.protocol === "https:" && !x.port && !x.username && !x.password && PUSH_HOSTS.some((r) => r.test(x.hostname));
  } catch {
    return false;
  }
}

let vapidCache = null;
export async function vapid(env) {
  if (vapidCache) return vapidCache;
  let row = await env.DB.prepare(`SELECT v FROM meta WHERE k = 'vapid'`).first();
  if (!row) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = b64url(await crypto.subtle.exportKey("raw", kp.publicKey));
    const priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
    await env.DB.prepare(`INSERT OR IGNORE INTO meta (k, v) VALUES ('vapid', ?1)`).bind(JSON.stringify({ pub, priv })).run();
    row = await env.DB.prepare(`SELECT v FROM meta WHERE k = 'vapid'`).first();
  }
  const { pub, priv } = JSON.parse(row.v);
  const key = await crypto.subtle.importKey("jwk", priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return (vapidCache = { pub, key });
}

async function vapidAuth(env, endpoint) {
  const { pub, key } = await vapid(env);
  const head = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: `mailto:${env.DEFAULT_FROM || `hello@${env.DOMAIN}`}`,
      })
    )
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64url(sig)}, k=${pub}`;
}

async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}

async function encryptPayload(sub, text) {
  const uaPub = fromB64url(sub.p256dh);
  const auth = fromB64url(sub.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(enc.encode(text), new Uint8Array([2]))));
  const head = new Uint8Array(21);
  head.set(salt);
  new DataView(head.buffer).setUint32(16, 4096);
  head[20] = asPub.length;
  return concat(head, asPub, ct);
}

// One notice to one subscription: "sent", "gone" (the device has unsubscribed: forget it) or "error".
async function pushToSub(env, sub, note) {
  try {
    const r = await fetch(env.PUSH_URL || sub.endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: await vapidAuth(env, sub.endpoint),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(note.ttl || 86400),
        Urgency: note.urgency || "normal",
        ...(env.PUSH_URL ? { "X-Endpoint": sub.endpoint } : {}),
      },
      body: await encryptPayload(sub, JSON.stringify(note)),
    });
    if (r.status === 404 || r.status === 410) return "gone";
    if (r.ok) return "sent";
    console.error("push", r.status, await r.text().catch(() => ""));
  } catch (e) {
    console.error("push", e?.message);
  }
  return "error";
}

// A notice to every device notifications are on for. → how many it reached
export async function pushAll(env, note) {
  const { results } = await env.DB.prepare(`SELECT endpoint, p256dh, auth FROM push_subs`).all();
  const sent = await Promise.all(
    results.map(async (sub) => {
      const r = await pushToSub(env, sub, note);
      if (r === "gone") await env.DB.prepare(`DELETE FROM push_subs WHERE endpoint = ?1`).bind(sub.endpoint).run();
      return r === "sent" ? 1 : 0;
    })
  );
  return sent.reduce((a, b) => a + b, 0);
}

// (the Home Screen badge: unread conversations in People; only those with something unread in the inbox read, not every
// conversation there's ever been)
export async function peopleUnread(env) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM (SELECT thread_id FROM messages WHERE folder NOT IN ('trash', 'drafts') AND thread_id IS NOT NULL
       AND thread_id IN (SELECT thread_id FROM messages WHERE folder = 'inbox' AND unread = 1)
       GROUP BY thread_id HAVING SUM(folder = 'inbox' AND unread = 1) > 0 AND MIN(COALESCE(category, 'people')) = 'people'
       AND MAX(COALESCE(snooze_until, 0)) <= ?1)`
  )
    .bind(Date.now())
    .first();
  return row?.n || 0;
}
