const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=import('../today/src/index.js').then(m=>m.default);

test('canonical app routes reach the Worker while legacy OS storage remains accessible',async()=>{
 const api=await worker,seen=[];
 const env={ASSETS:{fetch:async r=>{seen.push(r.url);return new Response('asset')}}};
 // Legacy documents stay readable: a server redirect cannot carry private origin-local drafts or keys.
 assert.equal((await api.fetch(new Request('https://os.inflite.ai/',{headers:{'Sec-Fetch-Dest':'document'}}),env,{})).status,200);
 assert.equal((await api.fetch(new Request('https://os.inflite.ai/app.js'),env,{})).status,200);
 assert.equal((await api.fetch(new Request('https://inflite.ai/'),env,{})).status,200);
 assert.equal((await api.fetch(new Request('https://os.inflite.ai.evil.test/'),env,{})).status,200);
 const r=await api.fetch(new Request('https://os.inflite.ai/api/not-public',{headers:{Accept:'text/html'}}),env,{});
 assert.notEqual(r.status,308);assert.equal(r.headers.get('location'),null);
 const config=fs.readFileSync(require('node:path').resolve(__dirname,'../wrangler.toml'),'utf8');
 for (const path of ['/about', '/about/', '/about/index.html']) {
   const redirect = await api.fetch(new Request('https://os.inflite.ai' + path), env, {});
   assert.equal(redirect.status, 301);
   assert.equal(redirect.headers.get('Location'), 'https://inflite.ai/about/');
   assert.equal((await api.fetch(new Request('https://inflite.ai' + path), env, {})).status, 200);
 }
 for(const path of ['/', '/index.html', '/about', '/about/', '/about/index.html','/auth','/auth/*','/account','/account/*','/status','/status/*'])assert.ok(config.includes('"'+path+'"'),path+' must reach the Worker before assets');
});


test('Mail opens its isolated legacy view through a direct canonical public link',async()=>{
 const {hostPage}=await import('../today/src/mailhost.js');
 const html=hostPage('https://email.inflite.ai','https://auth.inflite.ai');
 assert.ok(html.includes('href="https://inflite.ai/mail/standalone/"'));
 assert.ok(!html.includes('href="https://email.inflite.ai/"'));
 assert.ok(html.includes('data-mail="https://email.inflite.ai"'),'iframe transport stays isolated');
});
