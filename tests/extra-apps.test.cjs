const { test } = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../today/src/extra-apps.js');
const req = (path, options = {}) => new Request('https://inflite.ai' + path, { ...options, headers: { Origin: 'https://inflite.ai', 'Sec-Fetch-Site':'same-origin', ...options.headers } });
const env = fetch => ({ HUB_KEY:'proof', APPS:{fetch} });
test('Status uses its fixed service route, strips private identity and scopes its manifest', async () => {
 const { extraApp } = await mod; let sent;
 const out = await extraApp(req('/status/manifest.webmanifest', {headers:{Cookie:'private=1',Authorization:'Bearer secret'}}), env(async r => { sent=r; return Response.json({start_url:'/',icons:[{src:'/icon.svg'}]}, {headers:{'Set-Cookie':'secret=1','Service-Worker-Allowed':'/'}}); }));
 assert.equal(sent.url,'https://status.inflite.ai/manifest.webmanifest'); assert.equal(sent.headers.get('cookie'),null); assert.equal(sent.headers.get('authorization'),null); assert.equal(sent.headers.get('x-hub-key'),'proof');
 assert.deepEqual(await out.json(),{start_url:'/status/',scope:'/status/',icons:[{src:'/status/icon.svg'}]}); assert.equal(out.headers.get('set-cookie'),null); assert.equal(out.headers.get('service-worker-allowed'),null);
});
test('Status denies operational endpoints, cross-site writes, unrelated paths and oversized payloads before dispatch', async () => {
 const { extraApp,isExtraPath } = await mod; let calls=0; const e=env(()=>{calls++; return Response.json({});});
 for(const [r,status] of [[req('/api/status/report',{method:'POST',body:'{}'}),404],[req('/status/../../api/status/outside',{method:'POST',body:'{}'}),404],[req('/status/private.js'),404],[req('/api/status/subscribe',{method:'POST',body:'{}',headers:{Origin:'https://evil.test'}}),403],[req('/api/status/subscribe',{method:'POST',body:'{}',headers:{'Sec-Fetch-Site':'same-site'}}),403],[req('/api/status/subscribe',{method:'POST',body:'x'.repeat(8193)}),413]]) assert.equal((await extraApp(r,e)).status,status);
 assert.equal(calls,0); assert.equal(isExtraPath('/status.evil'),false); assert.equal(isExtraPath('/api/status/report'),true);
});
test('Status writes are explicit once, canonical document redirect preserves query, and external redirects are refused', async () => {
 const { extraApp } = await mod; let calls=0;
 const out=await extraApp(req('/api/status/subscribe',{method:'POST',body:'{}'}),env(async r=>{calls++;assert.equal(r.headers.get('origin'),'https://status.inflite.ai');assert.deepEqual(await r.json(),{});return Response.json({ok:true});})); assert.equal(out.status,200); assert.equal(calls,1);
 assert.equal((await extraApp(req('/status?detail=a'),env(()=>{}))).headers.get('location'),'/status/?detail=a');
 assert.equal((await extraApp(req('/status/'),env(()=>Response.redirect('https://evil.test',302)))).status,502);
});
