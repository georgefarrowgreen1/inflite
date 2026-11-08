import { documentRequest } from '../../shared/not-found.js';

// Publisher-owned static HTML only: no URL, query, account or request headers
// are reflected. Absolute resources/home links let all app hosts use one design.
export async function renderNotFound(request, env) {
  const origin = new URL(request.url).origin;
  const asset = await env.ASSETS.fetch(new Request(`${origin}/404`));
  if (![200, 404].includes(asset.status) || !asset.headers.get('Content-Type')?.startsWith('text/html')) throw new Error('404 asset unavailable');
  const html = (await asset.text()).replace(/\b(href|src)="\/(?!\/)([^"]*)"/g, (_, attr, path) => `${attr}="${origin}/${path}"`);
  return new Response(request.method === 'HEAD' ? null : html, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Inflite-Error': '404',
      'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Vary': 'Accept, Sec-Fetch-Dest, Sec-Fetch-Mode',
      'Content-Security-Policy': `default-src 'none'; script-src 'self' ${origin}; style-src 'self' ${origin}; img-src 'self' ${origin}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`,
    },
  });
}

export async function withLocalNotFound(request, env, response) {
  if (response.status !== 404 || response.headers.get('X-Inflite-Error') === '404' || !documentRequest(request)) return response;
  try {
    const replacement = await renderNotFound(request, env);
    response.body?.cancel().catch(() => {});
    return replacement;
  } catch { return response; }
}
