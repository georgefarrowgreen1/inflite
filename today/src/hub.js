// InFlite's hub (Today First, spec §3.3): Chats, Weather, Fitness and Markets as pages of inflite.ai, in one window
// with Today. Each is fetched from the app's own address (chat., weather., fitness., finance.inflite.ai), spoken for
// with that app's own Origin once this Worker has made the checks its api() makes, and given back with the hub's
// headers and its marker (<meta name="ifl-hub" content="/weather/">, which is what tells every page it's at the hub).
//   isHubPath(pathname) → whether the hub answers it (today/src/index.js asks, before anything else)
//   hub(request, env, ctx) → the answer
// (B0's stub: every hub path answers 404 as Today's API answers an unknown one, so nothing is served from here until
// batch H writes it; the names and arguments stay.)

// (as today/src/index.js's own answers: never kept, never sniffed, never framed, never read by another site)
const SAFE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export const isHubPath = (p) => /^\/(chats|weather|fitness|markets)(\/|$)/.test(p);

export async function hub(request, env, ctx) {
  return new Response(JSON.stringify({ error: "Not found." }), { status: 404, headers: { "Content-Type": "application/json; charset=utf-8", ...SAFE } });
}
