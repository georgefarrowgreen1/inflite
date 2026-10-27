const enc = new TextEncoder();
const COOKIE = "inflite_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Sessions are signed with a key derived from APP_PASSWORD, so changing the
// password signs everyone out.
async function hmacKey(env) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(`inflite-session:${env.APP_PASSWORD}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromB64url = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function checkPassword(env, password) {
  if (!env.APP_PASSWORD || typeof password !== "string") return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(password)),
    crypto.subtle.digest("SHA-256", enc.encode(env.APP_PASSWORD)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export async function createSessionCookie(env) {
  const payload = enc.encode(JSON.stringify({ exp: Date.now() + MAX_AGE * 1000 }));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), payload);
  const token = `${b64url(payload)}.${b64url(sig)}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function isAuthenticated(env, request) {
  if (!env.APP_PASSWORD) return false;
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return false;
  const [p, s] = match[1].split(".");
  if (!p || !s) return false;
  try {
    const payload = fromB64url(p);
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(env), fromB64url(s), payload);
    if (!ok) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(payload));
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}
