const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
let client, atlasPage;
before(async () => {
  client = await import(pathToFileURL(resolve(__dirname, '../today/public/atlas/assets/app.js')));
  ({ atlasPage } = await import(pathToFileURL(resolve(__dirname, '../today/src/atlas-page.js'))));
});
function stream(chunks, cancelled = () => {}) {
  return new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); }, cancel: cancelled });
}
const bytes = value => new TextEncoder().encode(value);
async function collect(body, options) { const events = []; for await (const event of client.streamEvents(body, options)) events.push(event); return events; }

test('SSE decoding survives every UTF-8 and CRLF split without changing source or answer text', async () => {
  const text = ': heartbeat\r\nevent: delta\r\ndata: {"text":"Café 🚲 — source"}\r\n\r\nevent: source\r\ndata: {"source":{"url":"https://example.org/a","title":"Research"}}\r\n\r\nevent: done\r\ndata: {"message":{"status":"completed"}}\r\n\r\n';
  const encoded = bytes(text), expected = await collect(stream([encoded]));
  assert.equal(expected.length, 3);
  assert.equal(JSON.parse(expected[0].data).text, 'Café 🚲 — source');
  for (let at = 1; at < encoded.length; at++) assert.deepEqual(await collect(stream([encoded.slice(0, at), encoded.slice(at)])), expected, 'split at ' + at);
  assert.deepEqual(await collect(stream([...encoded].map(value => Uint8Array.of(value)))), expected);
});

test('SSE parser handles comments, multiline data and final events without a blank terminator', async () => {
  const events = await collect(stream([bytes(':keepalive\nevent: custom\ndata: first\ndata:second\n\nretry: 100\ndata: tail')]));
  assert.deepEqual(events, [{ event: 'custom', data: 'first\nsecond' }, { event: 'message', data: 'tail' }]);
});

test('SSE abort releases the pending reader and propagates cancellation', async () => {
  let cancelled = false;
  const controller = new AbortController();
  const body = new ReadableStream({ start(target) { target.enqueue(bytes('event: delta\ndata: {"text":"Partial"}\n\n')); }, cancel() { cancelled = true; } });
  const iterator = client.streamEvents(body, { signal: controller.signal });
  assert.equal((await iterator.next()).value.event, 'delta');
  const waiting = iterator.next(); controller.abort();
  await assert.rejects(waiting, error => error.name === 'AbortError');
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test('SSE decoder stops oversized streams and releases resources', async () => {
  const body = stream([bytes('data: ' + 'a'.repeat(100))]);
  await assert.rejects(collect(body, { maxBytes: 40 }), /too large/);
  assert.equal(body.locked, false);
  await assert.rejects(collect(null), /unavailable/);
});

test('source links permit only HTTPS URLs without embedded credentials', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'http://example.com', '//example.com', '/atlas', 'https://user:secret@example.com/', 'file:///etc/passwd', 'not a URL']) assert.equal(client.safeUrl(url), null, url);
  assert.equal(client.safeUrl('https://example.com/a?q=cycling#source'), 'https://example.com/a?q=cycling#source');
});

// A deliberately small DOM exercises the real renderer. No HTML parsing is
// available: introducing an innerHTML sink immediately fails these tests.
class Element {
  constructor(tagName, text = '') { this.tagName = tagName; this.children = []; this._text = text; this.attrs = {}; this.listeners = {}; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(_) { throw Error('Unsafe HTML sink'); }
  append(...children) { for (const child of children) this.children.push(typeof child === 'string' ? new Element('#text', child) : child); }
  replaceChildren(...children) { this.children = []; this._text = ''; this.append(...children); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  addEventListener(type, listener) { this.listeners[type] = listener; }
}
function descendants(target) { return [target, ...target.children.flatMap(descendants)]; }
function withDocument(action) { const previous = global.document; global.document = { createElement: tag => new Element(tag), createTextNode: text => new Element('#text', text) }; try { return action(); } finally { if (previous === undefined) delete global.document; else global.document = previous; } }

test('Markdown renders headings, code, tables and citations while treating hostile markup as text', () => withDocument(() => {
  const answer = '# Findings\n\nClaim with **strong evidence** and `code`.\n\n<script>globalThis.pwned=1</script> <img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1)) [source](https://example.org/report)\n\n```js\nconst markup = "<img onerror=alert(1)>";\n```\n\n| Result | Value |\n| --- | --- |\n| Safe | **Yes** |\n\n- First finding\n- Second finding';
  const target = new Element('section');
  client.renderMarkdown(target, answer, [{ url: 'https://example.org/evidence', title: 'Evidence', start_index: answer.indexOf('Claim'), end_index: answer.indexOf('Claim') + 5 }, { url: 'javascript:alert(1)', title: 'Bad', start_index: 0 }]);
  const all = descendants(target), tags = all.map(node => node.tagName);
  for (const tag of ['h2', 'strong', 'code', 'pre', 'table', 'thead', 'tbody', 'th', 'td', 'ul', 'li', 'button']) assert.ok(tags.includes(tag), tag);
  assert.equal(tags.includes('script'), false); assert.equal(tags.includes('img'), false);
  assert.match(target.textContent, /<script>globalThis.pwned=1<\/script>/);
  assert.match(target.textContent, /const markup = "<img onerror=alert\(1\)>"/);
  const links = all.filter(node => node.tagName === 'a');
  assert.equal(links.length, 2); assert.ok(links.every(a => a.href.startsWith('https://') && a.rel === 'noopener noreferrer' && a.target === '_blank'));
  const citation = links.find(a => a.className === 'inline-citation'); assert.equal(citation.attrs['aria-label'], 'Source 1: Evidence');
}));

test('page loads the shared appearance before the UI and has unique labelled controls with no inline event code', () => {
  const page = atlasPage('fixture"<nonce>');
  assert.ok(page.indexOf('__iflSessionStarted=true') < page.indexOf('src="/theme.js"'));
  assert.match(page, /nonce="fixture&quot;&lt;nonce&gt;"/);
  assert.match(page, /src="\/roof\/wallpaper\.js"/);
  assert.match(page, /src="\/atlas\/assets\/app\.js"/);
  assert.doesNotMatch(page, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(page, /<script[^>]*>[^<]*fetch\(/);
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]); assert.equal(new Set(ids).size, ids.length, 'control IDs must be unique');
  for (const id of ['provider-key', 'github-token']) { const input = new RegExp('<input[^>]*id="' + id + '"[^>]*>').exec(page)?.[0]; assert.match(input, /type="password"/); assert.match(input, /autocomplete="off"/); assert.doesNotMatch(input, /\bvalue=/); }
  assert.match(page, /viewport-fit=cover/);
});

test('Atlas client has no private-content browser persistence or executable HTML sinks', () => {
  const script = readFileSync(resolve(__dirname, '../today/public/atlas/assets/app.js'), 'utf8');
  assert.doesNotMatch(script, /\b(?:localStorage|sessionStorage|indexedDB)\b/);
  assert.doesNotMatch(script, /\.(?:innerHTML|outerHTML|insertAdjacentHTML)\s*[=(]/);
  assert.doesNotMatch(script, /\b(?:eval|Function)\s*\(/);
  assert.doesNotMatch(script, /console\.(?:log|info|warn|error)\s*\(/);
});
