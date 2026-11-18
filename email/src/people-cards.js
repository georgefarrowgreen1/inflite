import { accountCookie } from "./auth.js";

const hub = "https://inflite.ai";
const recordId = /^[a-f0-9]{32}$/;
const ownerId = /^[\w-]{1,80}$/;
const shareable = ["title", "email", "phone", "organisation"];
function fail(status, message) {
  throw Object.assign(new Error(message), { status, publicMessage: message });
}
function card(record) {
  return Object.fromEntries(["id", "version", ...shareable].map((key) => [key, record[key]]));
}

// Only shareable fields cross into Mail. The canonical People API checks the account cookie,
// captured owner, record version and operation ID for each write.
export async function peopleCards(request, env, action, input) {
  const cookie = accountCookie(request);
  if (!cookie || !env.TODAY_APP) fail(503, "People is unavailable. Try again in a moment.");
  let owner = input?.owner;
  async function ask(path, method = "GET", body) {
    const headers = new Headers({ Cookie: cookie, Accept: "application/json", Origin: hub });
    for (const name of ["User-Agent", "X-Home-Screen", "CF-Connecting-IP"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (owner) headers.set("X-Inflite-Owner", owner);
    if (body) {
      headers.set("Content-Type", "application/json");
      headers.set("X-Inflite", "1");
    }
    const response = await env.TODAY_APP.fetch(
      new Request(hub + path, {
        method,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    if (!response.ok)
      fail(
        response.status >= 400 ? response.status : 502,
        response.status === 409
          ? "This contact changed. Reopen the card to review it again."
          : response.status === 401
            ? "Your account changed. Reopen Mail."
            : "People could not complete that request.",
      );
    return response.json();
  }
  if (action === "list") {
    if (!owner) owner = (await ask("/api/session")).user?.id;
    if (!ownerId.test(owner || "")) fail(401, "Sign in to open People.");
    const { records, cursor } = await ask("/api/organise/list", "POST", {
      kind: "people",
      limit: 100,
      cursor: input.cursor || null,
    });
    return { records: records.map(card), cursor, owner };
  }
  const { id, version, operationId, fields } = input || {};
  if (
    !ownerId.test(owner || "") ||
    !recordId.test(id) ||
    !recordId.test(operationId) ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    !fields ||
    !Object.keys(fields).length ||
    Object.keys(fields).some(
      (k) => !shareable.includes(k) || typeof fields[k] !== "string" || !fields[k].trim(),
    )
  )
    fail(400, "Choose contact details to save.");
  let existing = {};
  if (version) {
    existing = (await ask("/api/organise/record?kind=people&id=" + id)).record;
    if (existing.version !== version) {
      if (Object.entries(fields).every(([key, value]) => existing[key] === value))
        return { record: card(existing) };
      fail(409, "This contact changed. Reopen the card to review it again.");
    }
  }
  const value = {
    title: "",
    email: "",
    phone: "",
    organisation: "",
    details: existing.details || "",
    links: existing.links || [],
  };
  for (const key of shareable) value[key] = fields[key] || existing[key] || "";
  const result = await ask("/api/organise/record", "PUT", {
    kind: "people",
    id,
    version,
    operationId,
    value,
    deleted: false,
  });
  return { record: card(result.record) };
}
