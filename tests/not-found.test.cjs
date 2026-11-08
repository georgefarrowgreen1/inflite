const { test } = require('node:test');
const assert = require('node:assert/strict');
const req = (path = '/gone', headers = {}, method = 'GET') => new Request('https://fitness.inflite.ai' + path, { method, headers: { Accept: 'text/html', ...headers } });
const missing = () => new Response('original', {status: 404});
const page = () => new Response('<h1>InFlite</h1>', {status: 404, headers: {'Content-Type': 'text/html; charset=utf-8', 'X-Inflite-Error': '404'}});

test('only browser documents qualify, including HEAD and missing HTML documents', async () => {
  const { documentRequest } = await import('../shared/not-found.js');
  for (const path of ['/gone', '/fitness/missing', '/missing.html', '/nested/missing.htm']) assert.ok(documentRequest(req(path)), path);
  assert.ok(documentRequest(req('/gone', {}, 'HEAD')));
  for (const path of ['/api/missing', '/fitness/api/missing', '/roof/gone', '/parts/gone', '/body/gone', '/.well-known/gone', '/cdn-cgi/gone', '/_hub/gone', '/missing.js', '/missing.css', '/missing.svg', '/missing%2Ejs', '/bad%ZZ']) assert.equal(documentRequest(req(path)), false, path);
  for (const headers of [{Accept: '*/*'}, {Accept: 'application/json'}, {Accept: 'text/html;q=0'}, {'Sec-Fetch-Dest': 'script'}, {'Sec-Fetch-Dest': 'empty'}, {'Sec-Fetch-Mode': 'cors'}]) assert.equal(documentRequest(req('/gone', headers)), false);
  assert.equal(documentRequest(req('/gone', {}, 'POST')), false);
});

test('proxy forwards no credentials or missing URL; preserves status and HEAD', async () => {
  const { sharedNotFound } = await import('../shared/not-found.js');
  let count = 0;
  const service = {async fetch(request) {
    count++;
    assert.equal(request.url, 'https://inflite.ai/_errors/404');
    assert.deepEqual([...request.headers], [['accept', 'text/html']]);
    return page();
  }};
  const result = await sharedNotFound(req('/gone?private=value', {Cookie:'secret', Authorization:'Bearer secret'}), missing(), service);
  assert.equal(result.status, 404);
  assert.equal(await result.text(), '<h1>InFlite</h1>');
  assert.equal(await (await sharedNotFound(req('/gone', {}, 'HEAD'), missing(), service)).text(), '');
  for (const original of [new Response('valid'), new Response('denied', {status:403}), page()]) assert.equal(await sharedNotFound(req(), original, service), original);
  const original = missing();
  assert.equal(await sharedNotFound(req('/api/gone'), original, service), original);
  assert.equal(count, 2);
});

test('failed or stalled renderer preserves the original response', async () => {
  const { sharedNotFound } = await import('../shared/not-found.js');
  for (const service of [undefined, {fetch: async () => {throw Error('down');}}, {fetch: async () => new Response('bad')}, {fetch: async () => new Response('wrong', {status:404})}, {fetch: () => new Promise(() => {})}, {fetch: async () => new Response(new ReadableStream({start(){}}), {status:404, headers:{'Content-Type':'text/html', 'X-Inflite-Error':'404'}})}]) {
    const original = missing();
    assert.equal(await sharedNotFound(req(), original, service, 15), original);
    assert.equal(await original.text(), 'original');
  }
});

const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const asset = request => new Response(readFileSync(resolve(__dirname, '../today/public/404.html')), {headers:{'Content-Type':'text/html; charset=utf-8'}});

test('canonical renderer and hub unknown documents use one design with absolute links', async () => {
  const { default: worker } = await import('../today/src/index.js');
  const env = {ASSETS:{fetch:asset}, ACCOUNT_ORIGIN:'https://account.inflite.ai'};
  for (const path of ['/_errors/404', '/mail/gone']) {
    const response = await worker.fetch(new Request('https://inflite.ai' + path, {headers:{Accept:'text/html'}}), env, {});
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('X-Inflite-Error'), '404');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(response.headers.get('Content-Security-Policy'), /script-src 'self' https:\/\/inflite.ai/);
    const html = await response.text();
    assert.match(html, /href="https:\/\/inflite.ai\/"/);
    assert.match(html, /src="https:\/\/inflite.ai\/404.js"/);
    assert.match(html, /planet-blue/);
  }
  assert.equal((await worker.fetch(req('/api/gone'), env, {})).headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal((await worker.fetch(req('/mail/gone.js'), env, {})).headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.equal(await (await worker.fetch(new Request('https://inflite.ai/_errors/404', {method:'HEAD'}),env,{})).text(), '');
});

test('Mail retains root and hash links, errors for files and APIs, and non-fetch entrypoints', async () => {
  const {default: worker} = await import('../email/src/index.js');
  const env = {ASSETS:{fetch: async request => new URL(request.url).pathname === '/' ? new Response('<h1>Mail</h1>', {headers:{'Content-Type':'text/html'}}) : missing()}, TODAY_APP:{fetch:async () => page()}};
  for (const path of ['/', '/#settings', '/#thread=example']) assert.equal((await worker.fetch(new Request('https://email.inflite.ai'+path, {headers:{Accept:'text/html'}}),env,{})).status,200);
  assert.equal((await worker.fetch(req(),env,{})).headers.get('X-Inflite-Error'),'404');
  assert.equal(await (await worker.fetch(req('/missing.js'),env,{})).text(),'original');
  assert.equal(typeof worker.email, 'function');
  assert.equal(typeof worker.scheduled, 'function');
  const config = JSON.parse(readFileSync(resolve(__dirname,'../email/wrangler.jsonc'),'utf8').replace(/^\s*\/\/.*$/gm,''));
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.not_found_handling, 'none');
});
