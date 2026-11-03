// Mail's API gate for InFlite's page (One roof stage 4, s4/spec §3.5, S4-D2, S4-D24; security-critical, deep review R3).
// B0-b's stub: both exports are frozen (body.js and index.js call them) and answer "no hub" until MW writes them, so
// nothing changes while the stub stands.
//   hubOrigins(env) → string[]   HUB_ORIGIN's exact origins (pagePolicy's parsing) filtered by the switches:
//     https://inflite.ai only if HUB_API === "1", https://next.inflite.ai only if HUB_API_NEXT === "1", any other listed
//     origin (the test hub, http://ifl.test:8788: .test never resolves, RFC 6761) only if HUB_API_TEST === "1". The one
//     list the CORS gate, /body/'s frame-ancestors and its data-parents all use.
//   hubOf(request, env) → string | null   the request's Origin when it is one of hubOrigins(env), else null.
export function hubOrigins(env) {
  return [];
}

export function hubOf(request, env) {
  return null;
}
