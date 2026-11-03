// Mail's API from InFlite's page (One roof, stage 4, spec §3.5): the page at inflite.ai calls Mail directly, by
// credentialed CORS, only from the hub origins whose switch is on, and never for anything that holds a message's body.
// One place decides which origins those are: the CORS gate here, /body/'s frame-ancestors and its data-parents
// (email/src/body.js) all ask hubOrigins(env).
//
// HUB_ORIGIN (wrangler.jsonc) lists every hub, a space between each. The switches (Worker secrets, absent = off; set by
// roof.yml, Mail's first both ways): HUB_API="1" opens https://inflite.ai, HUB_API_NEXT="1" https://next.inflite.ai, and
// HUB_API_TEST="1" (a var only the test stack sets) any other listed origin, such as the test hub http://ifl.test:8788
// (".test" never resolves, RFC 6761, so it can't be anyone's real site). The framed page of milestone 1 keeps using the
// whole HUB_ORIGIN list for its frame-ancestors (index.js pagePolicy): with the switches off it must keep working.

const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;
const SWITCH = { "https://inflite.ai": "HUB_API", "https://next.inflite.ai": "HUB_API_NEXT" };

// Every hub HUB_ORIGIN lists (lower case), or none at all if anything in it isn't an origin.
export function listedOrigins(env) {
  const hubs = typeof env?.HUB_ORIGIN === "string" ? env.HUB_ORIGIN.trim().split(/\s+/).filter(Boolean) : [];
  return hubs.length && hubs.every((o) => ORIGIN_RE.test(o)) ? hubs.map((o) => o.toLowerCase()) : [];
}

// The hubs whose switch is on (frozen name, B0-b).
export function hubOrigins(env) {
  return listedOrigins(env).filter((o) => env[SWITCH[o] || "HUB_API_TEST"] === "1");
}

// The request's Origin when it's exactly one of the switched-on hubs, else null (frozen name, B0-b). "null", another
// scheme, another port or a longer name (https://inflite.ai.evil.com) is no hub.
export function hubOf(request, env) {
  const origin = request.headers.get("Origin");
  return origin && hubOrigins(env).includes(origin) ? origin : null;
}

// What every answer to a hub carries.
export const hubHeaders = (origin) => ({ "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", Vary: "Origin" });

// A hub's preflight (its writes carry X-Inflite, so ask first; one per URL serves a whole visit)
export function preflight(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      ...hubHeaders(origin),
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, X-Inflite",
      "Access-Control-Max-Age": "7200",
    },
  });
}

// The raster pictures a hub may read by CORS (S4-D17): anything else opens at Mail's own address instead.
export const RASTER = /^image\/(png|jpe?g|gif|webp|avif|heic|bmp)$/i;

// Why a hub's request is refused (spec §3.5), or null. (Writes without X-Inflite are refused for everyone in api(); the
// attachment's type and an address PATCH's isDefault are checked where they're read, index.js.)
export function hubRefusal(request, url) {
  const { pathname } = url;
  const method = request.method;
  const site = request.headers.get("Sec-Fetch-Site");
  // (older iOS sends none: the exact Origin and CORS do the real work)
  if (site && site !== "same-site") return "That request didn’t come from InFlite.";
  // (InFlite owns signing out and its own notifications)
  if (pathname === "/api/logout" || pathname.startsWith("/api/push/")) return "InFlite does that itself.";
  const read = method === "GET" || method === "HEAD";
  // (a message's body, or the whole of it as it came: never to InFlite's page, which shows bodies only in Mail's own
  // frame, email.inflite.ai/body/)
  if (read && /^\/api\/messages\/[^/]+(\/raw)?$/.test(pathname)) return "Messages open in Mail’s own frame.";
  // (searches only in a request's body: Mail's logs keep addresses, never what's searched for)
  if (read && ["/api/threads", "/api/contacts", "/api/messages"].includes(pathname) && url.searchParams.has("q")) return "Search with POST.";
  // (new addresses, deleting one and the default address: at Mail's own address, S4-D11)
  if (pathname === "/api/addresses" && method === "POST") return "Add addresses in Mail Settings at Mail’s own address.";
  if (/^\/api\/addresses\/[^/]+$/.test(pathname) && method === "DELETE") return "Delete addresses in Mail Settings at Mail’s own address.";
  return null;
}

// A tap at inflite.ai that opens a file, or a message's original, at Mail's own address (S4-D17, Open Original): a
// top-level navigation, same-site, which carries no Origin. Allowed only while a hub is switched on; what comes back is
// shown under Mail's own headers (a download unless it's safe to view).
export function hubNavigation(request, url, env) {
  return (
    request.method === "GET" &&
    /^\/api\/(attachments\/[\w-]+|messages\/[\w-]+\/raw)$/.test(url.pathname) &&
    request.headers.get("Sec-Fetch-Mode") === "navigate" &&
    request.headers.get("Sec-Fetch-Dest") === "document" &&
    request.headers.get("Sec-Fetch-Site") === "same-site" &&
    hubOrigins(env).length > 0
  );
}
