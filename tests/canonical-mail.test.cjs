const {test}=require('node:test');
const assert=require('node:assert/strict');
const origin='https://email.inflite.ai';
test('Mail denies the very next private request after the same session is revoked', async () => {
  const { default: mail } = await import('../email/src/index.js');
  let checks = 0, revoked = false;
  const env = { ACCOUNT_ORIGIN: 'https://account.inflite.ai', APPS: { fetch: async request => {
    assert.equal(request.headers.get('Cookie'), 'account=abcdefghijklmnopqrstuvwxyz');
    assert.equal(request.redirect, 'manual');
    assert.equal(new URL(request.url).pathname, '/api/account/mail/me');
    checks++;
    return Response.json(revoked ? { signedIn: false } : { signedIn: true, admin: true, passkey: true, fresh: true });
  } } };
  const get = path => mail.fetch(new Request(origin + path, {
    headers: { Cookie: 'account=abcdefghijklmnopqrstuvwxyz', 'Sec-Fetch-Site': 'same-origin' },
  }), env, {});
  const first = await get('/api/session');
  assert.equal((await first.json()).access, 'ok');
  revoked = true;
  const inbox = await get('/api/threads');
  assert.equal(inbox.status, 401);
  assert.equal((await inbox.json()).access, 'signin');
  assert.equal(checks, 2);
});

test('canonical standalone Mail wraps its legacy feature surface at the isolated origin even with the native module on',async()=>{
 const {mailPage}=await import('../today/src/mailhost.js');
 const env={ROOF_MAIL:'1',MAIL_ORIGIN:origin,AUTH_ORIGIN:'https://auth.inflite.ai'};
 const out=await mailPage(new Request('https://inflite.ai/mail/standalone/'),env);
 assert.equal(out.status,200);const html=await out.text();
 assert.match(html,/data-mail="https:\/\/email\.inflite\.ai"/);assert.match(html,/src="\/mailhost\.js"/);assert.doesNotMatch(html,/src="\/app\.js"/);
 assert.doesNotMatch(html,/class="mh-own"/);
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

test('Mail contact sharing uses the signed-in People API and preserves private fields on a reviewed update',async()=>{
 const {peopleCards}=await import('../email/src/people-cards.js');
 const today=(await import('../today/src/index.js')).default;
 const id='a'.repeat(32), owner='account-owner', operationId='b'.repeat(32);
 const cookie='__Secure-account='+'k'.repeat(32);
 let record={id,version:2,title:'Sam',email:'sam@example.com',phone:'123',organisation:'Studio',details:'personal notes',links:[{app:'notes',id:'d'.repeat(32)}]};
 const writes=[];
 const todayEnv={ACCOUNT_ORIGIN:'https://account.inflite.ai',APPS:{async fetch(req){
   const path=new URL(req.url).pathname;
   assert.equal(req.headers.get('Cookie'),cookie);
   if(path.endsWith('/today/me'))return Response.json({signedIn:true,user:{id:owner}});
   if(req.headers.get('X-Inflite-Owner')!==owner)return Response.json({error:'Account changed'},{status:401});
   if(path.endsWith('/list'))return Response.json({records:[record],cursor:null});
   if(req.method==='GET')return Response.json({record});
   const data=await req.json();writes.push(data);record={...record,...data.value,id:data.id,version:data.version+1};return Response.json({record});
 }}};
 const env={TODAY_APP:{fetch:req=>today.fetch(req,todayEnv,{waitUntil(){}})}};
 const req=new Request(origin,{headers:{Cookie:cookie+'; unrelated=discard'}});
 const list=await peopleCards(req,env,'list',{});
 assert.equal(list.owner,owner);assert.equal(list.records[0].email,record.email);
 assert.ok(!('details' in list.records[0])&&!('links' in list.records[0]));
 const change={owner,id,version:2,operationId,fields:{phone:'456'}};
 await peopleCards(req,env,'save',change);
 assert.equal(writes[0].value.details,'personal notes');assert.equal(writes[0].value.links[0].app,'notes');assert.equal(writes[0].value.email,'sam@example.com');
 await peopleCards(req,env,'save',change);
 assert.equal(writes.length,1);
 await assert.rejects(peopleCards(req,env,'save',{...change,fields:{phone:'789'}}),{status:409});
 await assert.rejects(peopleCards(req,env,'list',{owner:'different-account'}),{status:401});
 await assert.rejects(peopleCards(req,env,'save',{...change,fields:{details:'overwrite'}}),{status:400});
 await peopleCards(req,env,'save',{owner,id:'e'.repeat(32),operationId:'f'.repeat(32),version:0,fields:{title:'Lee',email:'lee@example.com'}});
 assert.equal(writes[1].value.title,'Lee');assert.deepEqual(writes[1].value.links,[]);
});

test('vCard export folds UTF-8 lines and carries only explicitly selected details',async()=>{
 const {contactFile,readCards}=await import('../email/public/roof/contact-card.js');
 const title='Åsa, Chen; '+ '山'.repeat(37);
 const file=contactFile({title,email:'asa@example.com',phone:'12345',organisation:'Secret',details:'private'},['email']);
 const text=await file.text();
 assert.ok(text.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
 assert.deepEqual(readCards(text),[{title,email:'asa@example.com'}]);
 assert.doesNotMatch(text,/12345|Secret|private/);
});

test('Mail retries an unavailable build and asks the asset binding for only the release prefix', async () => {
  const mail = (await import('../email/src/index.js')).default;
  const parts = [], ranges = [];
  const env = { BUILD_ID: 'delivery-retry', ASSETS: { async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/app.js') {
      ranges.push(request.headers.get('Range'));
      if (ranges.length === 1) return new Response(null, { status: 503 });
      return new Response('const BUILD = "2.24.2";', { status: 206 });
    }
    parts.push(path);
    return new Response('export default {};', { headers: { 'Content-Type': 'text/javascript' } });
  } } };
  const load = () => mail.fetch(new Request('https://email.inflite.ai/parts/compose.js?b=2.24.2'), env, {});
  const first = await load();
  assert.equal(first.status, 503);
  assert.equal(first.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(parts, []);
  assert.equal((await load()).status, 200);
  assert.equal((await load()).status, 200);
  assert.deepEqual(ranges, ['bytes=0-16383', 'bytes=0-16383']);
});

test('the release reader recovers declarations beyond the prefix and across stream chunks', async () => {
  const { assetBuild } = await import('../shared/asset-build.js');
  const ranges = [];
  const env = { ASSETS: { fetch(request) {
    ranges.push(request.headers.get('Range'));
    if (ranges.length === 1) return new Response('/* intro */', { status: 206 });
    return new Response(new ReadableStream({ start(controller) {
      for (const chunk of ['/* intro */\nexport const B', 'UILD = "2.', '24.2";']) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    } }));
  } } };
  const version = assetBuild('/roof/mail.js'), request = new Request('https://email.inflite.ai/roof/version');
  assert.equal(await version(env, request), '2.24.2');
  assert.equal(await version(env, request), '2.24.2');
  assert.deepEqual(ranges, ['bytes=0-16383', null]);
});
