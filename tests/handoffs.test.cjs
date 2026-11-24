const {test}=require('node:test'),assert=require('node:assert/strict');
const moduleAt=import('../today/public/roof/handoffs.js');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
async function fixture(deliver,options={}){const {createHandoffs}=await moduleAt,life=new AbortController(),source=new AbortController(),F={signal:life.signal,session:{view:{user:{id:'ann'}}}},state={app:'fitness',now:100,enabled:true};
 const host=createHandoffs(F,{available:()=>state.enabled,now:()=>state.now,deliver:(...args)=>deliver(...args),...options});
 const sdk=app=>host.forApp(app,{signal:source.signal,current:()=>state.enabled,active:()=>state.app===app});
 return{host,F,state,life,source,sdk};}
const ride={location:{name:'Start of ride',lat:51.5,lon:-.1},interval:{start:1000,end:2000}};
test('explicit ride is normalized, targeted and consumable once, without context or storage',async()=>{
 let t;t=await fixture(async(target,token,lease)=>{assert.equal(lease.current(),true);t.state.app='mail';assert.equal(t.sdk('mail').take(token),null);t.state.app=target;const value=t.sdk(target).take(token);assert.deepEqual(value,{kind:'ride',...ride});assert.equal(t.sdk(target).take(token),null);return{ok:true}});
 assert.equal(t.sdk('fitness').can('weather','ride'),true);assert.deepEqual(await t.sdk('fitness').send('weather','ride',{...ride,recipient:'private',secret:'token'}),{ok:true});t.host.destroy();
});
test('weather opens a text draft, strips recipients and headers; unsupported app pairs are refused',async()=>{
 const {handoffPayload}=await moduleAt;assert.deepEqual(handoffPayload('weather','mail','text',{subject:'Weather\r\nBcc: secret',text:'Sunny\u202e',to:['private']}),{subject:'Weather  Bcc: secret',text:'Sunny'});
 for(const [a,b,k,v] of [['fitness','mail','ride',ride],['weather','mail','send',{}],['fitness','weather','ride',{location:{name:'bad',lat:99,lon:0}}],['fitness','weather','ride',{...ride,interval:{start:1,end:1e12}}]])assert.equal(handoffPayload(a,b,k,v),null);
});
test('background, disabled or aborted sources cannot issue handoffs',async()=>{
 let calls=0;const t=await fixture(()=>{calls++;return{ok:true}});t.state.app='mail';assert.equal((await t.sdk('fitness').send('weather','ride',ride)).ok,false);t.state.app='fitness';t.state.enabled=false;assert.equal((await t.sdk('fitness').send('weather','ride',ride)).ok,false);t.state.enabled=true;t.source.abort();assert.equal((await t.sdk('fitness').send('weather','ride',ride)).ok,false);assert.equal(calls,0);t.host.destroy();
});
test('account replacement, expiry and target navigation reject delayed payload consumption',async()=>{
 for(const mode of ['owner','expiry','abort','navigation','revoked']){let t;t=await fixture(async(target,token,lease)=>{t.state.app=target;if(mode==='owner')t.F.session.view.user.id='beth';if(mode==='expiry')t.state.now+=60001;if(mode==='abort')t.source.abort();if(mode==='navigation')t.state.app='mail';if(mode==='revoked')t.state.enabled=false;assert.equal(t.sdk(target).take(token),null);if(mode!=='navigation')assert.equal(lease.current(),false);return{ok:false,cancelled:true}});assert.equal((await t.sdk('fitness').send('weather','ride',ride)).ok,false);t.host.destroy();}
});
test('double clicks share no payload and timeout revokes the delivery lease',async()=>{
 const gate=defer();let lease;const t=await fixture(async(target,token,l)=>{lease=l;await gate.promise;return{ok:true}},{timeoutMs:20});const first=t.sdk('fitness').send('weather','ride',ride);assert.equal((await t.sdk('fitness').send('weather','ride',ride)).ok,false);await first;assert.equal(lease.current(),false);gate.resolve();t.host.destroy();
});

test('Mail gives Atlas only the selected source reference, consumed once by Atlas',async()=>{
 let t,seen;t=await fixture(async(target,token)=>{assert.equal(target,'atlas');t.state.app=target;seen=t.sdk(target).take(token);assert.equal(t.sdk(target).take(token),null);return{ok:true}});
 t.state.app='mail';
 assert.equal(t.sdk('mail').can('atlas','mail-context'),true);
 assert.equal((await t.sdk('mail').send('atlas','mail-context',{threadId:'thread-a',messageId:'msg-a',subject:'A trip',body:'private email',from:'person@example.test',token:'secret',url:'https://private.test'})).ok,true);
 assert.deepEqual(seen,{kind:'mail-context',threadId:'thread-a',messageId:'msg-a',subject:'A trip'});
 assert.equal(t.sdk('notes').can('atlas','mail-context'),false);assert.equal(t.sdk('atlas').can('mail','send'),false);t.host.destroy();
});

test('Atlas reply and text drafts cannot supply recipients, headers or executable content fields',async()=>{
 const {handoffPayload}=await moduleAt;
 const unsafe={threadId:'thread-a',messageId:'msg-a',subject:'Reply',text:'Thanks\nSee you\u202e\u0000',to:'other@example.test',bcc:['private@example.test'],inReplyTo:'<fake>',html:'<script>alert(1)</script>',send:true};
 assert.deepEqual(handoffPayload('atlas','mail','mail-reply',unsafe),{threadId:'thread-a',messageId:'msg-a',text:'Thanks\nSee you'});
 assert.deepEqual(handoffPayload('atlas','mail','text',unsafe),{subject:'Reply',text:'Thanks\nSee you'});
 assert.equal(handoffPayload('atlas','mail','text',{subject:'Long draft',text:'x'.repeat(16000)}).text.length,16000);
 assert.equal(handoffPayload('atlas','mail','text',{subject:'Too long',text:'x'.repeat(16001)}),null);
 for(const value of [{...unsafe,threadId:'../thread'},{...unsafe,messageId:'x'.repeat(65)},{...unsafe,text:'x'.repeat(16001)},{...unsafe,text:'   '}])assert.equal(handoffPayload('atlas','mail','mail-reply',value),null);
 for(const value of [{threadId:'../thread'},{threadId:'thread-a',messageId:'https://private.test'},{threadId:'x'.repeat(65)}])assert.equal(handoffPayload('mail','atlas','mail-context',value),null);
});

test('Atlas note and event drafts use bounded native fields and validate source and time',async()=>{
 const {handoffPayload}=await moduleAt,source={app:'mail',threadId:'thread-a',body:'private'},note={title:'Meeting agenda',text:'1. Review\n2. Decide',source,save:true};
 assert.deepEqual(handoffPayload('atlas','notes','note-draft',note),{title:'Meeting agenda',text:note.text,source:{app:'mail',threadId:'thread-a'}});
 const event={title:'Review',description:'Discuss next steps',start:1800000000000,end:1800003600000,timezone:'Europe/London',source,attendees:['person@example.test']};
 assert.deepEqual(handoffPayload('atlas','calendar','event-draft',event),{title:event.title,description:event.description,start:event.start,end:event.end,timezone:event.timezone,source:{app:'mail',threadId:'thread-a'}});
 assert.deepEqual(handoffPayload('atlas','calendar','event-draft',{title:'Choose a time'}),{title:'Choose a time',description:''});
 for(const value of [{...note,text:'x'.repeat(64001)},{...note,source:{app:'mail',threadId:'../bad'}},{...note,source:{app:'files',url:'https://private.test'}}])assert.equal(handoffPayload('atlas','notes','note-draft',value),null);
 for(const value of [{...event,end:event.start},{...event,end:undefined},{...event,start:1,end:1e12},{...event,description:'x'.repeat(4001)},{...event,timezone:'Invalid/Timezone'},{...event,source:{app:'mail',threadId:''}}])assert.equal(handoffPayload('atlas','calendar','event-draft',value),null);
 assert.equal(handoffPayload('mail','notes','note-draft',note),null);assert.equal(handoffPayload('atlas','notes','event-draft',event),null);
});

test('revoking only the target capability retires an already issued Atlas handoff',async()=>{
 let t,enabled=true;
 t=await fixture(async(target,token,lease)=>{t.state.app=target;enabled=false;assert.equal(lease.current(),false);assert.equal(t.sdk(target).take(token),null);return{ok:false,cancelled:true}},{available:app=>app!=='atlas'||enabled});
 t.state.app='mail';assert.equal((await t.sdk('mail').send('atlas','mail-context',{threadId:'thread-a'})).ok,false);t.host.destroy();
});
