// InFlite's apps' own addresses (account., auth., chat., weather., fitness. and finance.inflite.ai) are routes on the
// inflite-apps Worker (the georgefarrowgreen repo's wrangler.worker.jsonc). A Worker's fetch to an address in its own
// zone skips the zone's Worker routes and goes to the origin behind the DNS record, of which there's none since the
// Pages project's gone; so those are asked through the service binding APPS (wrangler config), straight to that
// Worker, as the same address (it decides what each address is by its host, as ever). Anything else, and anywhere
// there's no APPS (tests, a local copy), is a plain fetch.
const APP_HOSTS = /^(account|auth|chat|weather|fitness|finance)\.inflite\.ai$/;
export function appFetch(env, url, init) {
  const u = new URL(url);
  if (typeof env?.APPS?.fetch === "function" && u.protocol === "https:" && APP_HOSTS.test(u.hostname)) return env.APPS.fetch(new Request(u, init));
  return fetch(u, init);
}
