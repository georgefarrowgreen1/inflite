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
