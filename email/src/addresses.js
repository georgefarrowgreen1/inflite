// Mail's own addresses on the domain, set in Settings: the name each is shown under, its colour, where its mail goes
// (People, Updates, or as Mail sorts it), whether it notifies, and which one is the default. Mail receives everything
// sent to the domain (Email Routing's catch-all), so an address needs nothing more than its row here; mail to an
// address that isn't listed is kept or turned away, as "catchall" in meta says.

export const COLORS = ["blue", "green", "orange", "pink", "purple", "teal", "grey"];
const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

export class AddressError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.publicMessage = message;
  }
}

const domainOf = (env) => String(env.DOMAIN || "").toLowerCase();
const defaultOf = (env) => String(env.DEFAULT_FROM || `hello@${domainOf(env)}`).toLowerCase();

async function metaGet(env, k) {
  return (await env.DB.prepare(`SELECT v FROM meta WHERE k = ?1`).bind(k).first())?.v ?? null;
}
function metaSet(env, k, v) {
  return env.DB.prepare(`INSERT INTO meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(k, v);
}

function rowOut(r) {
  return {
    email: r.email,
    name: r.name || "",
    color: COLORS.includes(r.color) ? r.color : "blue",
    category: r.category === "people" || r.category === "updates" ? r.category : null,
    notify: !!r.notify,
    isDefault: !!r.is_default,
    signature: r.signature || "",
    count: r.c || 0,
  };
}

// The list, made the first time from the default address and those mail has already come to
let seeded = false;
async function seed(env, fallbackName) {
  if (seeded) return;
  const any = await env.DB.prepare(`SELECT 1 FROM addresses LIMIT 1`).first();
  if (!any) {
    const { results } = await env.DB.prepare(
      `SELECT lower(mailbox) AS m, COUNT(*) AS c FROM messages WHERE mailbox LIKE ?1 GROUP BY lower(mailbox) ORDER BY c DESC LIMIT 10`
    )
      .bind(`%@${domainOf(env)}`)
      .all();
    const def = defaultOf(env);
    const list = [...new Set([def, ...results.map((r) => r.m)])].filter((e) => e.endsWith(`@${domainOf(env)}`));
    const now = Date.now();
    await env.DB.batch(
      list.map((e, i) =>
        env.DB.prepare(
          `INSERT OR IGNORE INTO addresses (email, name, color, category, notify, is_default, created_at) VALUES (?1, ?2, ?3, NULL, 1, ?4, ?5)`
        ).bind(e, e === def ? fallbackName || "" : "", COLORS[i % COLORS.length], e === def ? 1 : 0, now + i)
      )
    );
  }
  seeded = true;
}

export async function listAddresses(env, { fallbackName = "", counts = false } = {}) {
  await seed(env, fallbackName);
  const { results } = await env.DB.prepare(
    counts
      ? `SELECT a.*, (SELECT COUNT(*) FROM messages m WHERE lower(m.mailbox) = a.email) AS c FROM addresses a ORDER BY a.is_default DESC, a.created_at`
      : `SELECT * FROM addresses ORDER BY is_default DESC, created_at`
  ).all();
  return results.map(rowOut);
}

export async function addressOf(env, email) {
  const r = await env.DB.prepare(`SELECT * FROM addresses WHERE email = ?1`).bind(String(email || "").toLowerCase()).first();
  return r ? rowOut(r) : null;
}

export async function settings(env, fallbackName) {
  const [addresses, catchall, signature] = await Promise.all([
    listAddresses(env, { fallbackName, counts: true }),
    metaGet(env, "catchall"),
    metaGet(env, "signature"),
  ]);
  return { domain: domainOf(env), addresses, catchall: catchall === "reject" ? "reject" : "keep", signature: signature || "", colors: COLORS };
}

export async function updateSettings(env, body) {
  const ops = [];
  if (body.catchall !== undefined) {
    if (!["keep", "reject"].includes(body.catchall)) throw new AddressError("Choose Keep or Turn Away.");
    ops.push(metaSet(env, "catchall", body.catchall));
  }
  if (body.signature !== undefined) ops.push(metaSet(env, "signature", String(body.signature || "").slice(0, 1000)));
  if (ops.length) await env.DB.batch(ops);
}

function clean(body, partial) {
  const out = {};
  if (body.name !== undefined) out.name = String(body.name || "").replace(/[\r\n<>"]/g, " ").trim().slice(0, 80);
  if (body.color !== undefined) {
    if (!COLORS.includes(body.color)) throw new AddressError("Choose one of the colours.");
    out.color = body.color;
  }
  if (body.category !== undefined) {
    if (body.category !== null && !["people", "updates"].includes(body.category)) throw new AddressError("Choose People or Updates.");
    out.category = body.category;
  }
  if (body.notify !== undefined) out.notify = body.notify ? 1 : 0;
  if (body.signature !== undefined) out.signature = String(body.signature || "").slice(0, 1000);
  if (!partial) out.name ??= "";
  return out;
}

// (what's typed before the @, as an address on the domain: why not, if it can't be)
export function localProblem(local) {
  const l = String(local || "").trim().toLowerCase();
  if (!l) return "Type the part before the @.";
  if (l.length > 64) return "That’s too long for an address.";
  if (!LOCAL_RE.test(l) || /\.\./.test(l)) return "Use letters, numbers, dots, dashes or underscores, starting and ending with a letter or number.";
  return null;
}

export async function createAddress(env, body) {
  const local = String(body.local || "").trim().toLowerCase();
  const problem = localProblem(local);
  if (problem) throw new AddressError(problem);
  const email = `${local}@${domainOf(env)}`;
  await seed(env, "");
  if (await addressOf(env, email)) throw new AddressError(`${email} is already one of your addresses.`, 409);
  const c = clean(body, false);
  const count = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM addresses`).first())?.n || 0;
  if (count >= 100) throw new AddressError("That’s as many addresses as Mail keeps.");
  await env.DB.prepare(
    `INSERT INTO addresses (email, name, color, category, notify, is_default, created_at, signature) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)`
  )
    .bind(email, c.name, c.color || COLORS[count % COLORS.length], c.category ?? null, c.notify ?? 1, Date.now(), c.signature || null)
    .run();
  return addressOf(env, email);
}

export async function updateAddress(env, email, body) {
  email = String(email || "").toLowerCase();
  const was = await addressOf(env, email);
  if (!was) throw new AddressError("That address isn’t one of yours.", 404);
  const c = clean(body, true);
  const ops = [];
  const sets = Object.keys(c);
  if (sets.length)
    ops.push(
      env.DB.prepare(`UPDATE addresses SET ${sets.map((k, i) => `${k} = ?${i + 2}`).join(", ")} WHERE email = ?1`).bind(email, ...sets.map((k) => c[k]))
    );
  if (body.isDefault === true && !was.isDefault)
    ops.push(env.DB.prepare(`UPDATE addresses SET is_default = CASE WHEN email = ?1 THEN 1 ELSE 0 END`).bind(email));
  if (ops.length) await env.DB.batch(ops);
  return addressOf(env, email);
}

export async function deleteAddress(env, email) {
  email = String(email || "").toLowerCase();
  const was = await addressOf(env, email);
  if (!was) throw new AddressError("That address isn’t one of yours.", 404);
  if (was.isDefault) throw new AddressError("Make another address the default first.");
  await env.DB.prepare(`DELETE FROM addresses WHERE email = ?1`).bind(email).run();
}

// An incoming message's address, as Settings has it: whether to turn it away, where it goes and whether it notifies
export async function arrivalFor(env, to) {
  const email = String(to || "").toLowerCase();
  try {
    await seed(env, "");
    const [a, catchall] = await Promise.all([addressOf(env, email), metaGet(env, "catchall")]);
    return { address: a, reject: !a && catchall === "reject" };
  } catch (err) {
    console.error("addresses", err);
    return { address: null, reject: false };
  }
}

// The address new messages go from, and the name a message from an address goes out under
export async function defaultAddress(env) {
  const r = await env.DB.prepare(`SELECT email FROM addresses WHERE is_default = 1 LIMIT 1`).first().catch(() => null);
  return r?.email || defaultOf(env);
}
