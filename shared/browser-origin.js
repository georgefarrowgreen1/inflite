export function sameOriginPost(request) {
  const site = request.headers.get("Sec-Fetch-Site");
  const origin = request.headers.get("Origin");
  if (site !== null && site !== "same-origin") return false;
  // A same-origin beacon can omit Origin or send null under no-referrer.
  if (origin === null || origin === "null") return site === "same-origin";
  return origin === new URL(request.url).origin;
}
