// Mail in InFlite's window (Today First, spec §9.4): /mail/ is a small page of this site's that frames Mail at its own
// address (email.inflite.ai), so untrusted mail never shares an origin with Chat's key. For the site's admin alone.
//   mailPage(request, env) → the host page: Back to Apps, Open Mail on Its Own, and the frame
// (B0's stub: 404 as Today's API answers an unknown path, until batch M writes it; the name and arguments stay.)

// (as today/src/index.js's own answers: never kept, never sniffed, never framed, never read by another site)
const SAFE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export async function mailPage(request, env) {
  return new Response(JSON.stringify({ error: "Not found." }), { status: 404, headers: { "Content-Type": "application/json; charset=utf-8", ...SAFE } });
}
