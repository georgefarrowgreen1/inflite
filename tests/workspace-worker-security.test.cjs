// Concrete OS-origin checks of the production Worker, independent of the
// staging-origin cases in the companion repository.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const worker=import('../today/src/index.js').then(m=>m.default);
const origins=import('../email/src/hubgate.js');
const OS='https://os.inflite.ai',SITE='https://inflite.ai';
test('OS account writes require the exact browser origin and forward only the canonical account identity',async()=>{
 const api=await worker,asked=[],previous=global.fetch;
 global.fetch=async(url,options={})=>{asked.push({url:String(url),headers:new Headers(options.headers),method:options.method,body:options.body});return Response.json({ok:true});};
 const env={TODAY_AS:SITE,ACCOUNT_ORIGIN:'https://account.inflite.ai',ASSETS:{fetch(){throw Error('API request leaked to assets')}}};
 const request=(origin=OS,site='same-origin',header='1')=>new Request(OS+'/api/prefs',{method:'PUT',headers:{Origin:origin,'Sec-Fetch-Site':site,'X-Inflite':header,'Content-Type':'application/json',Cookie:'__Secure-account=Q2hhdFNlc3Npb25Ub2tlbjEyMzQ1Njc4; theme=dark'},body:'{"order":[]}'});
 try{
  const good=await api.fetch(request(),env,{});assert.equal(good.status,200);assert.equal(asked.length,1);assert.equal(asked[0].headers.get('origin'),SITE);assert.equal(asked[0].headers.get('cookie'),'__Secure-account=Q2hhdFNlc3Npb25Ub2tlbjEyMzQ1Njc4');
  for(const origin of [SITE,'https://next.inflite.ai','https://os.inflite.ai.evil.test','http://os.inflite.ai','https://os.inflite.ai:444','null'])assert.equal((await api.fetch(request(origin),env,{})).status,403,origin);
  for(const site of ['same-site','cross-site','none'])assert.equal((await api.fetch(request(OS,site),env,{})).status,403,site);
  assert.equal((await api.fetch(request(OS,'same-origin',''),env,{})).status,403);
  assert.equal(asked.length,1,'every rejected browser request stops before the account');
  assert.equal(good.headers.get('cache-control'),'no-store');assert.equal(good.headers.get('access-control-allow-origin'),null);
 }finally{global.fetch=previous}
});
test('OS Mail CORS requires both the exact configured origin and its dedicated production switch',async()=>{
 const {hubOrigins,hubOf,hubRefusal}=await origins;
 const env={HUB_ORIGIN:SITE+' https://next.inflite.ai '+OS,HUB_API:'1',HUB_API_NEXT:'1'};
 assert.equal(hubOrigins(env).includes(OS),false);env.HUB_API_OS='1';assert.equal(hubOrigins(env).includes(OS),true);
 const req=origin=>new Request('https://email.inflite.ai/api/threads',{headers:{Origin:origin,'Sec-Fetch-Site':'same-site'}});
 assert.equal(hubOf(req(OS),env),OS);
 for(const bad of [OS+'.evil.test','http://os.inflite.ai',OS+':444','https://os.os.inflite.ai','null'])assert.equal(hubOf(req(bad),env),null,bad);
 const body=new Request('https://email.inflite.ai/api/messages/id1',{headers:{Origin:OS,'Sec-Fetch-Site':'same-site'}});
 assert.equal(hubRefusal(body,new URL(body.url)),'Messages open in Mail’s own frame.');
});
