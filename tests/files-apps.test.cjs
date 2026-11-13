const {test}=require('node:test');
const assert=require('node:assert/strict');
const modules=Promise.all([import('../today/public/roof/files-apps.js'),import('../today/public/roof/workspace-files.js')]);
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const file=(app='mail',name='Invoice.pdf',id='invoice')=>({id:app+':file:'+id,app,name,mime:'application/pdf',objectId:id,intent:'open-file',downloadIntent:'download-file',source:'Account attachment'});
async function setup(options={}){
 const [{createAppFilesIndex},{createWorkspaceFiles}]=await modules,life=new AbortController(),calls=[],runs=[],opens=[],finds=[];
 const F={signal:life.signal,ui:{},session:{view:{user:{id:'ann'},apps:{mail:true}}},toast(){}};
 let sources=options.sources||[{app:'mail',name:'Mail',status:'ready'}];
 const index=createAppFilesIndex(F,{sources:()=>sources,load:async(app,query,current)=>{calls.push({app,query,current});return options.load?options.load(app,query,current):{status:'ready',files:[file(app)]};},runIntent:async(app,intent,id,lease)=>{runs.push({app,intent,id,current:lease.current});return options.run?options.run(app,intent,id,lease):{ok:true};},openApp:app=>opens.push(app),onFind:query=>finds.push(query)});
 return{index,F,life,calls,runs,opens,finds,createWorkspaceFiles,setSources:value=>sources=value};
}

test('app index explicitly reads without a dialog and retains only100 safe items per source with honest more',async()=>{
 const t=await setup({load:()=>({status:'ready',files:Array.from({length:130},(_,i)=>({...file('mail','Invoice '+i+'.pdf','a'+i),url:'https://private/?token=x',body:'PRIVATE'}))})});
 try{const answer=await t.index.read();assert.equal(t.calls.length,1);assert.equal(answer.files.length,100);assert.equal(answer.sources[0].more,true);assert.equal(t.index.snapshot()[0].files.length,100);assert.equal(JSON.stringify(answer).includes('PRIVATE'),false);assert.equal(JSON.stringify(answer).includes('https:'),false);assert.equal(answer.files[0].id,'mail:file:a0');}finally{t.index.destroy();}
});

test('global file search is RAM-only and guarded commands cannot adopt another account',async()=>{
 const t=await setup();try{
  assert.deepEqual((await t.index.search('invoice')).map(e=>e.title),['Find “invoice” in Files']);assert.equal(t.calls.length,0);
  await t.index.read();const saved=(await t.index.search('invoice')).find(e=>e.app==='mail');assert.ok(saved);assert.equal(t.calls.length,1);
  await saved.run();assert.equal(t.runs.length,1);t.F.session.view.user.id='bea';await saved.run();assert.equal(t.runs.length,1);assert.deepEqual(await t.index.search('invoice'),[]);assert.deepEqual(t.index.snapshot(),[]);
 }finally{t.index.destroy();}
});

test('same-query readers share one request while one abandoned caller cannot cancel another',async()=>{
 const gate=defer();let first=true;const t=await setup({load:()=>gate.promise});try{
  const a=t.index.read({current:()=>first}),b=t.index.read({current:()=>true});await Promise.resolve();assert.equal(t.calls.length,1);first=false;gate.resolve({status:'ready',files:[file()]});
  const results=await Promise.allSettled([a,b]);assert.equal(results[0].status,'rejected');assert.equal(results[0].reason.name,'AbortError');assert.equal(results[1].value.files[0].name,'Invoice.pdf');assert.equal(t.index.snapshot()[0].files.length,1);
 }finally{t.index.destroy();}
});

test('independent queries keep their own replies and older completion cannot replace the latest RAM cache',async()=>{
 const alpha=defer(),beta=defer(),t=await setup({load:(_app,q)=>q==='alpha'?alpha.promise:beta.promise});try{
  const a=t.index.read({query:'alpha'}),b=t.index.read({query:'beta'});await Promise.resolve();beta.resolve({status:'ready',files:[file('mail','Beta.pdf','b')]});const rb=await b;alpha.resolve({status:'ready',files:[file('mail','Alpha.pdf','a')]});const ra=await a;
  assert.deepEqual(ra.files.map(f=>f.name),['Alpha.pdf']);assert.deepEqual(rb.files.map(f=>f.name),['Beta.pdf']);assert.deepEqual(t.index.snapshot()[0].files.map(f=>f.name),['Beta.pdf']);
  assert.equal((await t.index.run(ra.files[0],'open-file')).ok,true,'a still-current caller can use its own read after another query');assert.equal(t.runs[0].id,'a');
 }finally{t.index.destroy();}
});

test('late cancelled reads cannot publish filenames or notify subscribers after account teardown',async()=>{
 for(const mode of ['caller','account','destroy']){
  const gate=defer();let current=true;const t=await setup({load:()=>gate.promise});try{
   const pending=t.index.read({current:()=>current});await Promise.resolve();
   if(mode==='caller')current=false;else if(mode==='account')t.life.abort();else t.index.destroy();
   gate.resolve({status:'ready',files:[file('mail','Old secret.pdf')]});await assert.rejects(pending,e=>e.name==='AbortError');
   assert.equal(JSON.stringify(t.index.snapshot()).includes('Old secret'),false);
  }finally{t.index.destroy();}
 }
});

test('manual destruction and explicit abort release a read even if its provider never settles',async()=>{
 for(const mode of ['caller','destroy']){
  const t=await setup({load:()=>new Promise(()=>{})}),signal=new AbortController();
  const pending=t.index.read({signal:signal.signal});await Promise.resolve();if(mode==='caller')signal.abort();else t.index.destroy();
  await assert.rejects(pending,e=>e.name==='AbortError');t.index.destroy();
 }
});

test('transient snapshots purge in-place recalls and conversation switches, including saved command controls',async()=>{
 const eligible=[file('chats','Private photo','peer:one')],source={app:'chats',name:'Chats',status:'ready',transient:true,files:eligible},t=await setup({sources:[source]});try{
  const result=await t.index.read(),saved=(await t.index.search('Private')).find(e=>e.app==='chats');assert.equal(t.calls.length,0);assert.ok(saved);
  eligible.splice(0,1);t.index.changed('chats');assert.deepEqual(t.index.snapshot()[0].files,[]);await saved.run();assert.deepEqual(t.runs,[]);assert.deepEqual(t.index.retain(result.files),[]);
  source.files=[file('chats','Other conversation','peer:two')];t.index.changed('chats');assert.ok((await t.index.search('Other')).some(e=>e.app==='chats'));assert.equal(t.calls.length,0);
  for(const status of ['loading','locked','signin','error']){source.status=status;t.index.update();assert.equal(t.index.snapshot()[0].files.length,0,status);}
 }finally{t.index.destroy();}
});

test('a cold transient source bootstraps once and its canonical snapshot alone may publish ready metadata',async()=>{
 const gate=defer(),source={app:'chats',name:'Chats',status:'loading',transient:true,files:[]},t=await setup({sources:[source],load:()=>gate.promise});try{
  const a=t.index.read(),b=t.index.read();await Promise.resolve();assert.equal(t.calls.length,1);gate.resolve({status:'ready',files:[file('chats','Not canonical yet','peer:old')]});
  for(const answer of await Promise.all([a,b]))assert.equal(answer.files.length,0);
  await t.index.read();assert.equal(t.calls.length,1);source.status='ready';source.files=[file('chats','Current photo','peer:new')];t.index.changed('chats');
  assert.deepEqual((await t.index.read()).files.map(f=>f.name),['Current photo']);assert.equal(t.calls.length,1);
 }finally{t.index.destroy();}
});

test('locks, source removal and later re-addition permanently revoke previously issued references',async()=>{
 const source={app:'mail',name:'Mail',status:'ready'},t=await setup({sources:[source]});try{
  const f=(await t.index.read()).files[0];source.status='locked';t.index.changed('mail');assert.equal(t.index.snapshot()[0].files.length,0);assert.equal((await t.index.run(f)).cancelled,true);assert.equal(t.index.gate('mail'),true);assert.deepEqual(t.opens,['mail']);
  source.status='ready';await t.index.read({refresh:true});assert.equal((await t.index.run(f)).cancelled,true);
  t.setSources([]);t.index.update();assert.deepEqual(t.index.snapshot(),[]);t.setSources([source]);await t.index.read();assert.equal((await t.index.run(f)).cancelled,true);
 }finally{t.index.destroy();}
});

test('explicit disabled Mail entitlement cannot be overridden by a ready source descriptor',async()=>{
 const t=await setup();try{t.F.session.view.apps.mail=false;assert.deepEqual(await t.index.read(),{sources:[],files:[]});assert.equal(t.calls.length,0);assert.equal(t.index.gate('mail'),false);}finally{t.index.destroy();}
});

test('read results are detached and frozen while invalid native intents cannot be forged',async()=>{
 const raw=file(),t=await setup({load:()=>({status:'ready',files:[raw]})});try{
  const answer=await t.index.read(),f=answer.files[0];raw.name='Changed outside';answer.sources[0].files.length=0;assert.equal(t.index.snapshot()[0].files[0].name,'Invoice.pdf');assert.ok(Object.isFrozen(f));
  assert.equal((await t.index.run({...f})).cancelled,true);assert.equal((await t.index.run(f,'delete-everything')).cancelled,true);assert.equal(t.runs.length,0);
 }finally{t.index.destroy();}
});

test('a loaded cache avoids subscribe/read feedback and changed marks data dirty without hidden HTTP',async()=>{
 const t=await setup();let notifications=0;const off=t.index.subscribe(()=>{notifications++;t.index.read().catch(()=>{});});try{
  await t.index.read();await Promise.resolve();await Promise.resolve();assert.equal(t.calls.length,1);assert.ok(notifications>0);
  off();t.index.changed('mail');assert.equal(t.calls.length,1);await t.index.read();assert.equal(t.calls.length,2);await t.index.read();assert.equal(t.calls.length,2);
 }finally{off();t.index.destroy();}
});

test('quick Files and an Explorer caller share one index without owning each other’s lifetime or query selection',async()=>{
 const t=await setup();const quick=t.createWorkspaceFiles(t.F,{index:t.index});try{
  const explorer=await t.index.read({app:'mail'});assert.equal(explorer.files[0].name,'Invoice.pdf');assert.ok((await quick.search('Invoice')).some(e=>e.app==='mail'));assert.equal(t.calls.length,1);
  quick.destroy();assert.ok((await t.index.search('Invoice')).some(e=>e.app==='mail'));assert.equal((await t.index.run(explorer.files[0])).ok,true);
 }finally{quick.destroy();t.index.destroy();}
});

test('seeded and transient snapshots both expose honest truncation before a provider is called',async()=>{
 for(const transient of [false,true]){
  const source={app:'mail',name:'Mail',status:'ready',transient,files:Array.from({length:125},(_,i)=>file('mail','Invoice '+i,'i'+i))},t=await setup({sources:[source]});
  try{const snapshot=t.index.snapshot()[0];assert.equal(snapshot.files.length,100);assert.equal(snapshot.more,true);await t.index.search('Invoice');assert.equal(t.calls.length,0);}finally{t.index.destroy();}
 }
});

test('each subscription cleanup owns its registration even when a stable callback is reused',async()=>{
 const t=await setup();let calls=0;const listener=()=>calls++;
 try{
  const old=t.index.subscribe(listener);old();const current=t.index.subscribe(listener);old();
  t.index.snapshot();await Promise.resolve();assert.equal(calls,1,'a retired cleanup cannot remove a new registration');
  const other=t.index.subscribe(listener);current();current();t.index.update();await Promise.resolve();assert.equal(calls,2,'one independent registration survives another cleanup');other();
 }finally{t.index.destroy();}
});

test('canonical Chat readiness during its cold bootstrap resolves the latest snapshot without cancelling other sources',async()=>{
 const chat={app:'chats',name:'Chats',status:'loading',transient:true,files:[]};let t;
 t=await setup({sources:[chat,{app:'mail',name:'Mail',status:'ready'}],load:app=>{
  if(app==='chats'){chat.status='ready';chat.files=[file('chats','Canonical current photo','peer:new')];t.index.changed('chats');return{status:'ready',files:[file('chats','Obsolete bootstrap photo','peer:old')]};}
  return{status:'ready',files:[file()]};
 }});
 try{const answer=await t.index.read();assert.deepEqual(answer.files.map(f=>f.name).sort(),['Canonical current photo','Invoice.pdf']);assert.equal(t.calls.filter(c=>c.app==='chats').length,1);assert.equal(JSON.stringify(answer).includes('Obsolete'),false);}finally{t.index.destroy();}
});

test('transient recall and conversation switch revoke an already-running native action lease',async()=>{
 for(const mode of ['recall','switch']){
  const gate=defer(),source={app:'chats',name:'Chats',status:'ready',transient:true,files:[file('chats','Private photo','peer:old')]};let effects=0;
  const t=await setup({sources:[source],run:async(_app,_intent,_id,{current})=>{await gate.promise;if(current())effects++;return{ok:true};}});
  try{
   const f=(await t.index.read()).files[0],pending=t.index.run(f);await Promise.resolve();
   source.files=mode==='recall'?[]:[file('chats','Other photo','peer:new')];t.index.changed('chats');gate.resolve();
   assert.equal((await pending).cancelled,true,mode);assert.equal(effects,0,mode);assert.equal(t.runs[0].current(),false,mode);
  }finally{t.index.destroy();}
 }
});

test('a caller cancelled before cold bootstrap begins does not consume the source’s single bootstrap',async()=>{
 const source={app:'chats',name:'Chats',status:'loading',transient:true,files:[]},t=await setup({sources:[source],load:()=>({status:'loading',files:[]})});
 try{
  const signal=new AbortController(),cancelled=t.index.read({signal:signal.signal});signal.abort();await assert.rejects(cancelled,e=>e.name==='AbortError');assert.equal(t.calls.length,0);
  await t.index.read();assert.equal(t.calls.length,1,'the first actual loader call is still allowed');await t.index.read();assert.equal(t.calls.length,1);
 }finally{t.index.destroy();}
});
