const {test}=require('node:test');
const assert=require('node:assert/strict');
const origin='https://email.inflite.ai';
test('canonical standalone Mail wraps its legacy feature surface at the isolated origin even with the native module on',async()=>{
 const {mailPage}=await import('../today/src/mailhost.js');
 const env={ROOF_MAIL:'1',MAIL_ORIGIN:origin,AUTH_ORIGIN:'https://auth.inflite.ai'};
 const out=await mailPage(new Request('https://inflite.ai/mail/standalone/'),env);
 assert.equal(out.status,200);const html=await out.text();
 assert.match(html,/data-mail="https:\/\/email\.inflite\.ai"/);assert.match(html,/src="\/mailhost\.js"/);assert.doesNotMatch(html,/src="\/app\.js"/);
 assert.match(out.headers.get('content-security-policy'),/frame-src https:\/\/email\.inflite\.ai/);
 assert.equal(out.headers.get('set-cookie'),null);
});
test('only direct human Mail documents redirect; isolated Mail iframes and assets stay at their original origin',async()=>{
 const worker=(await import('../email/src/index.js')).default;let assets=0;
 const env={HUB_ORIGIN:'https://inflite.ai',ASSETS:{fetch:async()=>{assets++;return new Response('<!doctype html><title>Mail</title>',{headers:{'Content-Type':'text/html'}});}}};
 const moved=await worker.fetch(new Request(origin+'/?x=a',{headers:{Accept:'text/html','Sec-Fetch-Dest':'document'}}),env,{});
 assert.equal(moved.status,308);assert.equal(moved.headers.get('location'),'https://inflite.ai/mail/standalone/?x=a');assert.equal(assets,0);
 const iframe=await worker.fetch(new Request(origin+'/',{headers:{Accept:'text/html','Sec-Fetch-Dest':'iframe'}}),env,{});
 assert.equal(iframe.status,200);assert.equal(iframe.headers.get('location'),null);assert.equal(assets,1);assert.match(await iframe.text(),/<title>Mail/);
 const js=await worker.fetch(new Request(origin+'/app.js',{headers:{'Sec-Fetch-Dest':'script'}}),env,{});assert.equal(js.status,200);assert.equal(assets,2);
});
