const {test}=require('node:test');
const assert=require('node:assert/strict');
const moduleAt=import('../today/public/roof/workspace-activity-state.js');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function fixture(run,opts={}){const{createActivityRegistry}=await moduleAt,ac=new AbortController(),F={signal:ac.signal,session:{view:{user:{id:'ann'}}}};let at=100;const registry=createActivityRegistry(F,{now:()=>++at,...opts});try{await run({F,registry,ac});}finally{registry.destroy();}}
const task=(patch={})=>({title:'Upload plan.gpx',detail:'My Drive',status:'running',kind:'upload',...patch});

test('activity snapshots are bounded safe immutable metadata, never callback or unknown data',async()=>fixture(({registry})=>{
 const source=registry.source('files');assert.equal(source.put('one',task({title:'<script>x</script>\u202e',progress:.5,body:'private bytes',token:'secret',actions:[{id:'cancel',label:'Cancel',run(){}}]})),true);
 const [entry]=registry.snapshot();assert.equal(entry.title,'<script>x</script>');assert.equal(entry.progress,.5);assert.equal(entry.kind,'upload');assert.equal(entry.body,undefined);assert.equal(entry.token,undefined);assert.equal(entry.actions[0].run,undefined);assert.equal(Object.isFrozen(entry),true);assert.equal(Object.isFrozen(entry.actions),true);
 assert.equal(source.put('bad/id',task()),false);assert.equal(source.put('bad',task({status:'done'})),false);assert.equal(source.put('two',task({progress:Infinity})),true);assert.equal(registry.snapshot()[0].progress,null);
}));

test('registry has no transport side effects and only dispatches the observed explicit action',async()=>fixture(async({registry})=>{
 let calls=0;const source=registry.source('files');source.put('one',task({actions:[{id:'cancel',label:'Cancel upload',run(){calls++;}}]}));const old=registry.snapshot()[0];registry.snapshot();assert.equal(calls,0);
 source.put('one',task({progress:.2,actions:[{id:'cancel',label:'Cancel upload',run(){calls++;}}]}));assert.deepEqual(await registry.invoke(old.key,'cancel',old.revision),{ok:false,cancelled:true});assert.equal(calls,0);
 const fresh=registry.snapshot()[0];assert.deepEqual(await registry.invoke(fresh.key,'missing',fresh.revision),{ok:false,cancelled:true});assert.deepEqual(await registry.invoke(fresh.key,'cancel',fresh.revision),{ok:true});assert.equal(calls,1);
}));

test('progress updates preserve an in-flight owned action and prevent duplicate dispatch',async()=>fixture(async({registry})=>{
 const wait=defer();let calls=0,lease;const source=registry.source('files');const actions=[{id:'cancel',label:'Cancel',run:async value=>{calls++;lease=value;await wait.promise;return{ok:true};}}];source.put('one',task({actions}));const entry=registry.snapshot()[0],pending=registry.invoke(entry.key,'cancel',entry.revision);
 assert.equal(calls,1);assert.equal(lease.current(),true);assert.equal(registry.snapshot()[0].pending,true);source.put('one',task({progress:.8,actions}));assert.equal(lease.current(),true);
 const again=registry.snapshot()[0];assert.equal(again.actions[0].enabled,false);assert.equal((await registry.invoke(again.key,'cancel',again.revision)).cancelled,true);assert.equal(calls,1);
 wait.resolve();assert.deepEqual(await pending,{ok:true});assert.equal(registry.snapshot()[0].pending,false);
}));

test('an explicit safe retry can change its failed task to running and completed without aborting itself',async()=>fixture(async({registry})=>{
 const source=registry.source('workspace-sync');let lease;source.put('sync',task({status:'failed',kind:'sync',actions:[{id:'retry',label:'Try again',run:async value=>{lease=value;source.put('sync',task({status:'running',kind:'sync'}));assert.equal(value.signal.aborted,false);assert.equal(value.current(),true);await turn();source.put('sync',task({status:'succeeded',kind:'sync'}));return{ok:true};}}]}));
 const entry=registry.snapshot()[0];assert.equal((await registry.invoke(entry.key,'retry',entry.revision)).ok,true);assert.equal(lease.signal.aborted,false);assert.equal(registry.snapshot()[0].status,'succeeded');assert.equal(registry.snapshot()[0].pending,false);
}));

test('account replacement and teardown wipe metadata and abort every action lease',async()=>fixture(async({F,registry})=>{
 const wait=defer();let lease;const source=registry.source('files');source.put('one',task({actions:[{id:'retry',label:'Retry',run:async value=>{lease=value;await wait.promise;return{ok:true};}}]}));const entry=registry.snapshot()[0],pending=registry.invoke(entry.key,'retry',entry.revision);F.session.view.user.id='ben';assert.deepEqual(registry.snapshot(),[]);assert.equal(lease.current(),false);assert.equal(lease.signal.aborted,true);assert.equal(source.put('two',task()),false);wait.resolve();assert.equal((await pending).cancelled,true);assert.deepEqual(registry.snapshot(),[]);
}));

test('an action-specific authorization revoked during its await prevents a late side effect',async()=>fixture(async({registry})=>{
 const wait=defer();let authorized=true,effects=0;const source=registry.source('recovery');source.put('retry',task({status:'failed',actions:[{id:'retry',label:'Try again',current:()=>authorized,run:async({current})=>{await wait.promise;if(current())effects++;return{ok:true};}}]}));const entry=registry.snapshot()[0],pending=registry.invoke(entry.key,'retry',entry.revision);authorized=false;wait.resolve();assert.equal((await pending).cancelled,true);assert.equal(effects,0);assert.equal(registry.snapshot()[0].pending,false);assert.equal(registry.snapshot()[0].actions[0].enabled,false);
}));

test('source retirement, late source cleanup and row replacement cannot control newer jobs',async()=>fixture(async({registry})=>{
 const first=registry.source('files');first.put('one',task({status:'succeeded'}));const old=registry.snapshot()[0];const second=registry.source('files');let calls=0;second.put('one',task({actions:[{id:'open',label:'Open folder',run(){calls++;}}]}));first.destroy();assert.equal(first.remove('one'),false);assert.equal(registry.snapshot().length,1);assert.equal((await registry.invoke(old.key,'open',old.revision)).cancelled,true);const entry=registry.snapshot()[0];assert.equal((await registry.invoke(entry.key,'open',entry.revision)).ok,true);assert.equal(calls,1);
}));

test('source signal and source current() permanently retire unavailable activity metadata',async()=>fixture(({registry})=>{
 const signal=new AbortController();let available=true;const source=registry.source('files',{signal:signal.signal,current:()=>available});source.put('one',task());available=false;assert.deepEqual(registry.snapshot(),[]);available=true;assert.equal(source.put('two',task()),false);const other=registry.source('files',{signal:signal.signal});other.put('one',task());signal.abort();assert.deepEqual(registry.snapshot(),[]);
}));

test('capacity evicts completed metadata first and never silently drops active tasks',async()=>fixture(({registry})=>{
 const source=registry.source('files');for(let n=0;n<8;n++)assert.equal(source.put(String(n),task()),true);assert.equal(source.put('too-many',task()),false);source.put('0',task({status:'succeeded'}));assert.equal(source.put('replacement',task()),true);assert.equal(registry.snapshot().some(item=>item.id==='0'),false);registry.clearCompleted();assert.equal(registry.snapshot().length,8);source.put('1',task({status:'handed-off',kind:'download'}));registry.clearCompleted();assert.equal(registry.snapshot().length,7);assert.equal(registry.snapshot().some(item=>item.id==='replacement'),true);
},{limit:8}));

test('the default registry can display the full Files upload queue alongside workspace sync',async()=>fixture(({registry})=>{
 const files=registry.source('files'),sync=registry.source('workspace-sync');for(let n=0;n<100;n++)assert.equal(files.put('upload-'+n,task({status:'queued'})),true);assert.equal(sync.put('sync',task({title:'Workspace sync',kind:'sync'})),true);assert.equal(registry.snapshot().length,101);
}));

test('failed actions do not invent task success or retry, and native handoffs remain distinct',async()=>fixture(async({registry})=>{
 const source=registry.source('files');let calls=0;source.put('one',task({status:'failed',actions:[{id:'refresh',label:'Refresh folder',run(){calls++;throw Error('Refresh unavailable');}}]}));const entry=registry.snapshot()[0];assert.deepEqual(await registry.invoke(entry.key,'refresh',entry.revision),{ok:false,error:'Refresh unavailable'});assert.equal(registry.snapshot()[0].status,'failed');assert.equal(calls,1);source.put('download',task({status:'handed-off',kind:'download',progress:undefined,detail:'Your browser handles this download.'}));const handoff=registry.snapshot()[0];assert.equal(handoff.status,'handed-off');assert.equal(handoff.progress,null);
}));

test('listener registrations are individually owned and reentrant teardown stops notifications',async()=>fixture(({registry})=>{
 const source=registry.source('files');let calls=0;const callback=()=>calls++;const first=registry.subscribe(callback),second=registry.subscribe(callback);first();source.put('one',task());assert.equal(calls,1);second();source.put('two',task());assert.equal(calls,1);registry.subscribe(()=>registry.destroy());registry.subscribe(()=>assert.fail('retired listener must not run'));source.put('three',task());assert.equal(registry.live(),false);
}));
