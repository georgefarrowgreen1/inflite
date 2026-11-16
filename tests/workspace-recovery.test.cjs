const {test}=require('node:test'),assert=require('node:assert/strict');
const source=import('../today/public/roof/workspace-recovery.js');
const later=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
async function fixture(run,options={}){
 const {createWorkspaceRecovery}=await source,life=new AbortController(),events=new EventTarget(),network={onLine:true},handles=new Map(['fitness','weather','mail'].map(app=>[app,{signal:new AbortController().signal}])),retries=[],activity=[];
 const F={signal:life.signal,session:{view:{user:{id:'ann'},apps:{mail:true}},apps:{fitness:true,weather:true,mail:true}},on(){return()=>{}}};
 const recovery=createWorkspaceRecovery(F,{events,network,getHandle:app=>handles.get(app),activity:{put:(id,value)=>activity.push({id,value})},retry:async(app,lease)=>{retries.push({app,lease});return options.retry?options.retry(app,lease):{ok:true}},timeoutMs:options.timeoutMs});
 try{await run({F,recovery,network,events,retries,handles,life,activity});}finally{recovery.destroy()}
}
test('cold load failure is retryable without inventing a module or changing another app',async()=>fixture(async({recovery,retries})=>{
 const weather={draft:'kept'};assert.equal(await recovery.load('weather',async()=>weather),weather);
 assert.equal(await recovery.load('fitness',async()=>null),null);
 assert.equal(recovery.snapshot().apps.find(a=>a.app==='fitness').phase,'error');
 assert.equal(recovery.snapshot().apps.find(a=>a.app==='weather').loaded,true);
 assert.deepEqual(await recovery.recover('fitness'),{ok:true});assert.equal(retries.length,1);assert.equal(weather.draft,'kept');
}));
test('mounted busy drafts are resumed through the same instance and never unmounted or flushed implicitly',async()=>fixture(async({recovery})=>{
 const instance={busy:()=>true,draft:'unsent',flush(){assert.fail('resume must not flush')},unmount(){assert.fail('resume must not unmount')}};
 let mounts=0;const load=async()=>{mounts++;return instance};
 await recovery.load('mail',load);recovery.update('mail','error');
 assert.equal((await recovery.recover('mail')).ok,true);assert.equal(mounts,1);assert.equal(instance.draft,'unsent');
}));
test('online changes are truthful metadata only and never replay a request or recover automatically',async()=>fixture(async({recovery,network,events,retries})=>{
 await recovery.load('fitness',async()=>({}));network.onLine=false;events.dispatchEvent(new Event('offline'));
 assert.equal(recovery.snapshot().online,false);assert.equal(recovery.snapshot().apps[0].retryable,false);
 assert.match((await recovery.recover('fitness')).error,/offline/);assert.equal(retries.length,0);
 network.onLine=true;events.dispatchEvent(new Event('online'));assert.equal(recovery.snapshot().online,true);assert.equal(retries.length,0);
 await recovery.recover('fitness');assert.equal(retries.length,1);
}));
test('a backend offline state remains visible even while navigator reports available networking',async()=>fixture(async({recovery})=>{
 await recovery.load('fitness',async()=>({}));recovery.update('fitness','offline');const row=recovery.snapshot().apps[0];
 assert.equal(row.phase,'offline');assert.equal(row.retryable,true);assert.equal(recovery.actions()[0].id,'retry-fitness');
}));
test('locked, signed-out and disabled sources cannot be recovered through saved controls',async()=>fixture(async({recovery,F,retries})=>{
 await recovery.load('fitness',async()=>({}));const action=recovery.actions().find(a=>a.app==='fitness');
 recovery.update('fitness','locked');assert.equal(action.current(),false);assert.equal((await action.run()).ok,false);
 recovery.update('fitness','signin');assert.equal((await recovery.recover('fitness')).ok,false);
 F.session.apps.fitness=false;assert.equal((await recovery.recover('fitness')).cancelled,true);assert.equal(retries.length,0);
 assert.equal(recovery.snapshot().apps.some(a=>a.app==='fitness'),false);
}));
test('same-app concurrent retries share one bounded operation without duplicating native actions',async()=>{
 const pending=later();await fixture(async({recovery,retries})=>{
  const first=recovery.recover('fitness'),second=recovery.recover('fitness');assert.equal(first,second);
  await Promise.resolve();assert.equal(retries.length,1);assert.equal(recovery.snapshot().apps[0].pending,true);
  pending.resolve({ok:true});await first;assert.equal(recovery.snapshot().apps[0].pending,false);
 },{retry:()=>pending.promise});
});
test('account replacement releases pending results and cannot publish an old failure or activity',async()=>{
 const pending=later();await fixture(async({F,recovery,retries,activity})=>{
  const result=recovery.recover('fitness');await Promise.resolve();assert.equal(retries.length,1);
  F.session.view.user.id='beth';pending.reject(Error('private diagnostic'));assert.deepEqual(await result,{ok:false,cancelled:true});
  assert.deepEqual(recovery.snapshot().apps,[]);assert.equal(activity.filter(a=>a.value.status==='failed').length,0);assert.deepEqual(recovery.actions(),[]);
 },{retry:()=>pending.promise});
});
test('a cancelled requester stops waiting without destroying a co-owned module load',async()=>{
 const pending=later();await fixture(async({recovery})=>{
  const scope=new AbortController();const read=recovery.load('fitness',()=>pending.promise,{signal:scope.signal});
  await Promise.resolve();scope.abort();await assert.rejects(read,e=>e.name==='AbortError');
  pending.resolve({draft:'late'});await Promise.resolve();assert.equal(recovery.snapshot().apps[0].loaded,false);
 });
});
test('destroy releases hung reads and pending recovery callbacks, removes listeners and disables saved commands',async()=>{
 const pending=later();await fixture(async({recovery,life,retries})=>{
  const action=recovery.recover('fitness');await Promise.resolve();const lease=retries[0].lease;
  life.abort();assert.deepEqual(await action,{ok:false,cancelled:true});assert.equal(lease.current(),false);pending.resolve(true);
  assert.deepEqual(recovery.snapshot().apps,[]);assert.deepEqual(recovery.actions(),[]);
 },{retry:()=>pending.promise});
});
test('a load caller whose lease expired cannot start its module or publish private errors',async()=>fixture(async({recovery})=>{
 let calls=0;await assert.rejects(recovery.load('fitness',()=>{calls++;throw Error('private')},{current:()=>false}),e=>e.name==='AbortError');assert.equal(calls,0);
}));
test('each subscription owns its callback registration while records expose no drafts or persisted data',async()=>fixture(async({recovery,network,events})=>{
 let count=0;const fn=()=>count++,old=recovery.subscribe(fn),keep=recovery.subscribe(fn);old();network.onLine=false;events.dispatchEvent(new Event('offline'));
 assert.equal(count,1);keep();network.onLine=true;events.dispatchEvent(new Event('online'));assert.equal(count,1);
 await recovery.load('fitness',async()=>({draft:'secret',token:'private'}));assert.doesNotMatch(JSON.stringify(recovery.snapshot()),/secret|private|token|draft/);
}));

test('a command keeps its durable authorization while its own recovery becomes pending',async()=>{
 const gate=later();await fixture(async({recovery,retries})=>{
  await recovery.load('fitness',async()=>({}));recovery.update('fitness','error');const action=recovery.actions().find(a=>a.app==='fitness');
  assert.equal(action.enabled,true);const request=action.run({current:action.current});await Promise.resolve();
  assert.equal(recovery.snapshot().apps[0].pending,true);assert.equal(action.current(),true);assert.equal(retries[0].lease.current(),true);
  gate.resolve({ok:true});assert.deepEqual(await request,{ok:true});
 },{retry:()=>gate.promise});
});

test('a lock arriving during resume revokes the in-flight action and remains authoritative',async()=>{
 const gate=later();await fixture(async({recovery,retries})=>{
  await recovery.load('fitness',async()=>({}));const request=recovery.recover('fitness');await Promise.resolve();
  recovery.update('fitness','locked');assert.equal(retries[0].lease.current(),false);gate.resolve({ok:true});
  assert.deepEqual(await request,{ok:false,cancelled:true});assert.equal(recovery.snapshot().apps[0].phase,'locked');
 },{retry:()=>gate.promise});
});
test('resuming a view does not pretend a failed backend has synced successfully',async()=>fixture(async({recovery})=>{
 await recovery.load('fitness',async()=>({}));recovery.update('fitness','offline');await recovery.recover('fitness');
 assert.equal(recovery.snapshot().apps[0].phase,'offline');recovery.update('fitness','ready');assert.equal(recovery.snapshot().apps[0].phase,'ready');
}));

test('a reentrant status update never delivers an older unlocked snapshot after a lock',async()=>fixture(async({recovery})=>{
 let entered=false;const received=[];recovery.subscribe(value=>{if(!entered&&value.apps[0].phase==='ready'){entered=true;recovery.update('fitness','locked')}});
 recovery.subscribe(value=>received.push(value.apps[0].phase));await recovery.load('fitness',async()=>({}));
 assert.equal(received.at(-1),'locked');assert.equal(received.includes('ready'),false);
}));

test('an owned busy-editor refusal retains its bounded product reason instead of implying an outage',async()=>fixture(async({recovery,activity})=>{
 await recovery.load('fitness',async()=>({draft:'unsent'}));const answer=await recovery.recover('fitness');
 assert.deepEqual(answer,{ok:false,error:'Finish editing in Fitness before refreshing it.'});
 assert.equal(activity.at(-1).value.detail,answer.error);assert.equal(recovery.snapshot().apps[0].phase,'ready');
},{retry:()=>({ok:false,error:'Finish editing in Fitness before refreshing it.'})}));


test('availability reports unsynced writes until producer confirmation, including after reconnect',async()=>fixture(async({recovery,network,events})=>{
 const {recoveryDetail}=await source;await recovery.load('fitness',async()=>({}));
 recovery.update('fitness',{status:'ready',availability:{local:true,pending:2,saving:true}});
 let row=recovery.snapshot().apps[0];assert.equal(row.unsynced,2);assert.equal(recoveryDetail(row,true),'Saving changes…');
 network.onLine=false;events.dispatchEvent(new Event('offline'));recovery.update('fitness',{status:'ready',availability:{local:true,pending:2}});
 assert.match(recoveryDetail(recovery.snapshot().apps[0],false),/Keep it open/);
 network.onLine=true;events.dispatchEvent(new Event('online'));row=recovery.snapshot().apps[0];assert.equal(row.unsynced,2);assert.match(recoveryDetail(row,true),/need to sync/);
 recovery.update('fitness',{status:'ready',availability:{local:true,pending:0}});assert.equal(recovery.snapshot().apps[0].unsynced,0);
}));
test('availability is a bounded metadata allowlist and cannot bypass sign-in or lock states',async()=>fixture(async({recovery})=>{
 const {availabilityOf,recoveryDetail}=await source;assert.deepEqual(availabilityOf({local:'yes',pending:99999,saving:true,draft:true,error:true,updatedAt:'bad',text:'private'}),{local:false,pending:1000,saving:true,draft:true,error:true,updatedAt:null});
 await recovery.load('mail',async()=>({}));recovery.update('mail',{status:'locked',availability:{local:true,pending:1,draft:true}});
 assert.equal(recoveryDetail(recovery.snapshot().apps.find(a=>a.app==='mail'),false),'Unlock to continue');
}));
