const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {fixture,COOKIE}=require('./fixtures/mail-private-cache.cjs');
test('private Mail bytes and own avatars are reauthorized after sign-out and an account change, using the real HTTP cache',async()=>{
 const f=await fixture();let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox']});
  for(const path of ['/api/attachments/file1','/api/messages/message1/raw','/api/photo?v=1','/api/avatar?v=1']){
   const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
   try{
    await context.addCookies([{name:'account',value:COOKIE.slice(8),url:f.origin}]);await page.goto(f.origin);
    const read=()=>page.evaluate(async path=>{const r=await fetch(path);return {status:r.status,body:await r.text(),cache:r.headers.get('cache-control')};},path);
    const first=await read();assert.equal(first.status,200,path);assert.match(first.body,/PRIVATE-/);const before=f.hits.length;
    await context.clearCookies();
    const signedOut=await read();
    assert.ok(f.hits.length>before,path+' sign-out must reach the Worker instead of HTTP cache');
    assert.equal(signedOut.status,path.startsWith('/api/avatar')?404:401,path+' signed-out access');assert.doesNotMatch(signedOut.body,/PRIVATE-/);
    await context.addCookies([{name:'account',value:'b'.repeat(32),url:f.origin}]);
    const changed=await read();assert.equal(changed.status,path.startsWith('/api/avatar')?404:401,path+' other account');assert.doesNotMatch(changed.body,/PRIVATE-/);
    assert.match(first.cache,/\bno-store\b/,path+' must never be kept by HTTP cache');
   }finally{await context.close();}
  }
 }finally{await browser?.close();await f.close();}
});
