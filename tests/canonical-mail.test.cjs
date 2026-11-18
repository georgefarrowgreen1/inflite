const {test}=require('node:test');
const assert=require('node:assert/strict');
const origin='https://email.inflite.ai';
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
