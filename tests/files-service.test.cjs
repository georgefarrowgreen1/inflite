// Real service, app index and Drive client; only fetch/XHR and native host
// capabilities are fixture transports. Actual workerd/D1/R2 browser tests live
// in the companion integration suite.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const moduleAt=import('../today/public/roof/files-service.js');
const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32),NOW=1700000000000;
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function until(fn){for(let n=0;n<40;n++){if(fn())return;await turn();}assert.fail('fixture operation did not reach its expected boundary');}
const node=(id=A,patch={})=>({id,parentId:null,kind:'file',name:'Notes.txt',mime:'text/plain',size:4,createdAt:NOW,modifiedAt:NOW,version:1,status:'ready',...patch});
const folder=(id,patch={})=>node(id,{kind:'folder',name:'Folder',mime:'inode/directory',size:0,...patch});
const appFile=(app='mail',patch={})=>({id:app+':file:invoice',app,name:'Invoice.pdf',mime:'application/pdf',objectId:'invoice',intent:'open-file',downloadIntent:'download-file',...patch});
const driveLocation=(folderId=null)=>({kind:'drive',folderId,view:'folder'});
async function fixture(run,options={}){
 const {createFilesService}=await moduleAt,life=new AbortController(),calls=[],native=[],opens=[],events=[],xhrs=[],nodes=new Map((options.nodes||[]).map(n=>[n.id,{...n}]));
 let next=1000,active=0,maxActive=0,revision=1;
 const F={signal:life.signal,ui:{},session:{view:{user:{id:'ann'},apps:{mail:true}},lost(){F.lost++;}},lost:0,toast(){}};
 const state={nodes,calls,xhrs,get active(){return active;},get maxActive(){return maxActive;}};
 let sources=options.sources||[{app:'mail',name:'Mail',status:'ready'}];
 function answer(items,params){const parent=params.parentId||null,view=params.view||'folder',query=(params.q||'').toLowerCase(),kind=params.kind;
  let list=(items||[...nodes.values()]).filter(n=>(view!=='folder'||n.parentId===parent)&&(!query||n.name.toLowerCase().includes(query))&&(!kind||n.kind===kind));
  list.sort((a,b)=>params.sort==='modified'?b.modifiedAt-a.modifiedAt:params.sort==='size'?b.size-a.size:a.name.localeCompare(b.name));
  const offset=Number((params.cursor||'0:0').split(':')[1]);const page=list.slice(offset,offset+100),selected=parent?nodes.get(parent):null;
  return{folder:selected||null,ancestors:selected?[selected]:[],items:page,cursor:offset+100<list.length?revision+':'+(offset+100):null,revision,usage:{used:4,reserved:0,limit:10485760,nodes:nodes.size,nodeLimit:10000,fileLimit:25*1024*1024}};
 }
 async function server(url,spec={}){
  const u=new URL(url,'https://os.inflite.ai'),action=u.pathname.slice('/api/files/'.length),method=spec.method||'GET',body=spec.body?JSON.parse(spec.body):null,params=Object.fromEntries(u.searchParams);
  const call={url:String(url),action,method,body,params,spec};calls.push(call);
  if(options.fetch){const value=await options.fetch(call,state);if(value!==undefined)return value;}
  if(action==='list'||action==='search')return Response.json(answer(null,method==='POST'?body:params));
  const id=params.id||body?.id,found=nodes.get(id);
  if(action==='item'&&method==='GET')return found?Response.json({item:found}):Response.json({error:'Missing'},{status:404});
  if(action==='content')return new Response(options.content||'data',{headers:{'content-type':'application/octet-stream'}});
  if(action==='uploads'||action==='folders'){
   const id=String(++next).padStart(32,'0'),value=action==='folders'?folder(id,{name:body.name,parentId:body.parentId}):node(id,{name:body.name,mime:body.mime,size:body.size,parentId:body.parentId,status:'pending'});
   nodes.set(id,value);revision++;return Response.json({item:value},{status:201});
  }
  if((action==='item'&&['PATCH','DELETE'].includes(method))||action==='move'){
   const version=Number(params.version||body.version);if(!found)return Response.json({error:'Missing'},{status:404});if(version!==found.version)return Response.json({error:'Conflict'},{status:409});
   if(method==='DELETE'){nodes.delete(id);revision++;return Response.json({ok:true});}
   const value={...found,version:found.version+1,modifiedAt:found.modifiedAt+1,...(action==='move'?{parentId:body.parentId}:{name:body.name})};nodes.set(id,value);revision++;return Response.json({item:value});
  }
  return Response.json({error:'Unknown fixture endpoint'},{status:404});
 }
 const previous={fetch:global.fetch,XMLHttpRequest:global.XMLHttpRequest};
 global.fetch=(url,spec={})=>new Promise((resolve,reject)=>{
  const signal=spec.signal,stop=()=>{signal?.removeEventListener('abort',stop);reject(new DOMException('Aborted','AbortError'));};
  if(signal?.aborted)return stop();signal?.addEventListener('abort',stop,{once:true});
  Promise.resolve().then(()=>server(url,spec)).then(value=>{signal?.removeEventListener('abort',stop);resolve(value);},error=>{signal?.removeEventListener('abort',stop);reject(error);});
 });
 class XHR{
  constructor(){this.upload={};this.headers={};this.responseText='';this.status=0;this.finished=false;xhrs.push(this);}
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(k,v){this.headers[k]=v;}
  send(file){this.file=file;active++;maxActive=Math.max(maxActive,active);if(options.autoUpload)queueMicrotask(()=>this.complete());}
  progress(loaded){this.upload.onprogress?.({loaded});}
  complete(){if(this.finished)return;this.finished=true;active--;const id=new URL(this.url,'https://os.inflite.ai').searchParams.get('id'),old=nodes.get(id),ready={...old,status:'ready',version:old.version+1};nodes.set(id,ready);this.status=200;this.responseText=JSON.stringify({item:ready});this.onload?.();}
  fail(){if(this.finished)return;this.finished=true;active--;this.onerror?.();}
  abort(){if(this.finished)return;this.finished=true;if(this.file)active--;this.aborted=true;this.onabort?.();}
 }
 global.XMLHttpRequest=XHR;
 const service=createFilesService(F,{sources:()=>sources,load:async(app,query,current)=>{native.push({type:'load',app,query,current});return options.load?options.load(app,query,current):{status:'ready',files:[appFile(app)]};},runIntent:async(app,intent,id,lease)=>{native.push({type:'run',app,intent,id,current:lease.current});return options.run?options.run(app,intent,id,lease):{ok:true};},openApp:app=>opens.push({app}),openExplorer:(query,location)=>opens.push({query,location})});
 const off=service.subscribe(change=>events.push(change));
 try{await run({...state,state,F,life,service,calls,xhrs,native,opens,events,setSources:value=>sources=value,answer,off});}
 finally{off();service.destroy();await turn();Object.assign(global,previous);}
}

test('global search is RAM-only, and explicit app and Drive reads populate one account search cache',async()=>{
 await fixture(async({service,calls,native})=>{
  assert.ok((await service.search('Invoice')).some(e=>e.title.includes('Find')));assert.equal(calls.length,0);assert.equal(native.length,0);
  await service.browse({kind:'apps',app:'mail'});await service.browse(driveLocation());const before=[calls.length,native.length];
  assert.ok((await service.search('Invoice')).some(e=>e.title==='Invoice.pdf'));assert.ok((await service.search('Notes')).some(e=>e.title==='Notes.txt'));assert.deepEqual([calls.length,native.length],before);
 },{nodes:[node()]});
});

test('app and Drive browse results remain independent while Move pages pass folder-only controls to the real client',async()=>{
 await fixture(async({service,calls})=>{
  const root=await service.browse(driveLocation());const selected=await service.browse(driveLocation(B),{foldersOnly:true,query:'Destination'});const app=await service.browse({kind:'apps',app:'mail'});
  assert.equal(root.items.find(i=>i.id===A).name,'Notes.txt');assert.equal(selected.items.length,1);assert.equal(selected.items[0].kind,'folder');assert.equal(app.items[0].name,'Invoice.pdf');
  const request=calls.find(c=>c.action==='search');assert.equal(request.body.kind,'folder');assert.equal(request.body.parentId,B);assert.equal(request.url.includes('Destination'),false);
 },{nodes:[node(),folder(B),folder(C,{parentId:B,name:'Destination'})]});
});

test('native app refs retain issued identity, survive another query and reject unsupported CRUD',async()=>{
 await fixture(async({service,calls,native})=>{
  const listing=await service.browse({kind:'apps',app:'mail'}),resource=listing.items[0];assert.deepEqual(resource.actions.map(a=>a.id),['open-file','download-file']);
  await service.browse({kind:'apps',app:'mail'},{query:'unmatched'});assert.equal((await service.run(resource.key,'open-file')).ok,true);
  for(const action of ['rename','move','delete','create-folder'])assert.equal((await service.run(resource.key,action)).ok,false);
  assert.equal(native.filter(c=>c.type==='run').length,1);assert.equal(calls.length,0);
 });
});

test('Chat recall and source removal revoke saved service resource keys and native handoff leases',async()=>{
 const gate=defer(),source={app:'chats',name:'Chats',status:'ready',transient:true,files:[appFile('chats')]};let effects=0;
 await fixture(async({service})=>{
  const key=(await service.browse({kind:'apps',app:'chats'})).items[0].key,pending=service.run(key,'open-file');await turn();source.files=[];service.changed('chats');gate.resolve();
  assert.equal((await pending).cancelled,true);assert.equal(effects,0);assert.equal((await service.run(key,'open-file')).ok,false);
 },{sources:[source],run:async(_a,_i,_id,{current})=>{await gate.promise;if(current())effects++;return{ok:true};}});
});

test('app categories survive resource projection for opaque-MIME images and audio',async()=>{
 await fixture(async({service})=>{const result=await service.browse({kind:'apps',app:'chats'});assert.equal(result.items[0].category,'image');},{sources:[{app:'chats',status:'ready',transient:true,files:[appFile('chats',{mime:'application/octet-stream',category:'image'})]}]});
});

test('Drive preview actions match the Explorer MIME allowlist and text byte threshold',async()=>{
 const cases=[['image/png',4,true],['image/avif',4,true],['audio/mpeg',4,true],['audio/flac',4,true],['text/plain',262144,true],['text/csv',262145,false],['application/json',262145,false],['application/pdf',4,false],['text/html',4,false],['image/svg+xml',4,false],['audio/opus',4,false]];
 await fixture(async({service})=>{const resources=(await service.browse(driveLocation())).items;for(let i=0;i<cases.length;i++){const [mime,,yes]=cases[i],resource=resources.find(r=>r.id===String(i+1).padStart(32,'0'));assert.equal(resource.actions.some(a=>a.id==='preview'),yes,mime);assert.equal(resource.primaryAction,yes?'preview':'download',mime);assert.ok(resource.actions.some(a=>a.id==='download'));}},{nodes:cases.map(([mime,size],i)=>node(String(i+1).padStart(32,'0'),{mime,size,name:'File '+i}))});
});

test('preview reads fresh metadata, preserves MIME and refuses changed versions before content is requested',async()=>{
 await fixture(async({service,nodes,calls})=>{
  const resource=(await service.browse(driveLocation())).items[0];const good=await service.run(resource.key,'preview',{input:{version:resource.version}});assert.equal(await good.blob.text(),'data');assert.equal(good.blob.type,'text/plain');
  nodes.set(A,node(A,{version:2}));const before=calls.filter(c=>c.action==='content').length;const stale=await service.run(resource.key,'preview',{input:{version:resource.version}});assert.equal(stale.ok,false);assert.equal(calls.filter(c=>c.action==='content').length,before);
 },{nodes:[node()]});
});

test('mutations use observed versions and emit both old and new parent events after confirmed writes',async()=>{
 await fixture(async({service,calls,events,nodes})=>{
  const key=(await service.browse(driveLocation())).items.find(r=>r.id===A).key;events.length=0;
  assert.equal((await service.run(key,'rename',{input:{name:'Renamed.txt',version:1}})).ok,true);assert.equal((await service.run(key,'move',{input:{parentId:B,version:2}})).ok,true);assert.equal((await service.run(key,'delete',{input:{version:3}})).ok,true);
  assert.deepEqual(calls.filter(c=>['PATCH','POST','DELETE'].includes(c.method)).map(c=>c.body?.version||Number(c.params.version)),[1,2,3]);assert.equal(nodes.has(A),false);assert.ok(events.some(e=>e.folderId===B));assert.ok(events.some(e=>e.folderId===null));
 },{nodes:[node(),folder(B)]});
});

test('a newer browse cannot silently upgrade a stale destructive confirmation to a newer item version',async()=>{
 await fixture(async({service,nodes,calls})=>{
  const original=(await service.browse(driveLocation())).items[0];nodes.set(A,node(A,{name:'Changed elsewhere.txt',version:2}));await service.browse(driveLocation());const before=calls.length;
  await assert.rejects(service.run(original.key,'delete',{input:{version:original.version}}),e=>e.status===409);assert.equal(calls.length,before+1);assert.equal(calls.at(-1).params.version,String(original.version),'the backend receives the observed version, never the newer cached version');assert.equal(nodes.has(A),true);
 },{nodes:[node()]});
});

test('accepted writes register busy before the first asynchronous Drive initialization and flush cannot miss them',async()=>{
 const gate=defer();await fixture(async({service})=>{
  const pending=service.run(null,'create-folder',{input:{name:'Work',parentId:null}});assert.equal(service.busy(),true);assert.deepEqual(await service.flush({timeoutMs:0}),{lost:1});gate.resolve();assert.equal((await pending).ok,true);assert.equal(service.busy(),false);
 },{fetch:async call=>{if(call.action==='folders')await gate.promise;}});
});

test('two-upload concurrency and flush include every queued wave, with the original destination captured before navigation',async()=>{
 await fixture(async({service,xhrs,calls,state})=>{
  let accepting=true;const files=Array.from({length:5},(_,i)=>new File(['data'],'File '+i+'.txt',{type:'text/plain'}));assert.deepEqual(await service.upload(files,{folderId:B,current:()=>accepting}),{queued:5});accepting=false;await until(()=>xhrs.length===2);assert.equal(service.busy(),true);await service.browse(driveLocation(C));
  let flushed=false;const flush=service.flush({timeoutMs:5000}).then(r=>{flushed=true;return r;});
  xhrs[0].complete();xhrs[1].complete();await until(()=>xhrs.length===4);assert.equal(flushed,false);xhrs[2].complete();xhrs[3].complete();await until(()=>xhrs.length===5);assert.equal(flushed,false);xhrs[4].complete();assert.deepEqual(await flush,{lost:0});
  assert.ok(calls.filter(c=>c.action==='uploads').every(c=>c.body.parentId===B));assert.equal(service.transfers().every(t=>t.status==='done'),true);assert.equal(state.maxActive,2);assert.equal(service.busy(),false);
 },{nodes:[folder(B),folder(C)]});
});

test('upload admission rejects coerced destination objects before retaining or sending any file',async()=>{
 await fixture(async({service,calls})=>{await assert.rejects(service.upload([new File(['data'],'File.txt')],{folderId:{toString(){return B;}}}));assert.equal(service.transfers().length,0);assert.equal(calls.length,0);});
});

test('queued cancellation drops its file and active cancellation uses fresh versioned reservation cleanup',async()=>{
 await fixture(async({service,xhrs,calls,nodes})=>{
  await service.upload(Array.from({length:3},(_,i)=>new File(['data'],'File '+i+'.txt')));await until(()=>xhrs.length===2);const records=service.transfers();service.cancelTransfer(records[2].id);service.cancelTransfer(records[0].id);await until(()=>calls.some(c=>c.method==='DELETE'));
  assert.equal(xhrs[0].aborted,true);assert.equal(service.transfers().find(t=>t.id===records[2].id).status,'cancelled');xhrs[1].complete();assert.deepEqual(await service.flush(),{lost:0});assert.equal(xhrs.length,2);assert.equal([...nodes.values()].filter(n=>n.status==='pending').length,0);
 });
});

test('account abort cancels active and queued transfers, closes XHR handlers and makes stale callbacks inert',async()=>{
 await fixture(async({service,xhrs,life,events})=>{
  await service.upload([new File(['data'],'One.txt'),new File(['data'],'Two.txt'),new File(['data'],'Three.txt')]);await until(()=>xhrs.length===2);const old=xhrs[0].upload.onprogress;life.abort();await turn();const count=events.length;old?.({loaded:2});assert.equal(service.busy(),false);assert.deepEqual(service.transfers(),[]);assert.deepEqual(await service.search('One'),[]);assert.equal(events.length,count);assert.ok(xhrs.every(x=>x.aborted));assert.ok(xhrs.every(x=>x.onload===null&&x.upload.onprogress===null));
 });
});

test('a caller cancelled during a browse cannot populate Drive search or dispatch later writes',async()=>{
 const gate=defer();await fixture(async({service,calls})=>{
  const life=new AbortController(),pending=service.browse(driveLocation(),{signal:life.signal});await until(()=>calls.length===1);life.abort();gate.resolve();await assert.rejects(pending,e=>e.name==='AbortError');assert.equal((await service.search('Notes')).some(e=>e.title==='Notes.txt'),false);
 },{nodes:[node()],fetch:async call=>{if(call.action==='list')await gate.promise;}});
});

test('Drive and transfer history caches remain bounded and stale evicted keys do not become mutation targets',async()=>{
 const all=Array.from({length:1100},(_,i)=>node(String(i+1).padStart(32,'0'),{name:'Cache '+String(i).padStart(4,'0')}));await fixture(async({service,calls})=>{
  for(let offset=0;offset<1100;offset+=100)await service.browse({kind:'drive',view:'recent'},{cursor:offset?'1:'+offset:null});
  assert.equal((await service.search('Cache 0000')).some(e=>e.title==='Cache 0000'),false);assert.ok((await service.search('Cache 1099')).some(e=>e.title==='Cache 1099'));const before=calls.length;assert.equal((await service.run('drive:'+String(1).padStart(32,'0'),'delete',{input:{version:1}})).ok,false);assert.equal(calls.length,before);
 },{nodes:all});
 await fixture(async({service})=>{await service.upload(Array.from({length:45},(_,i)=>new File(['x'],'File '+i+'.txt')));await service.flush({timeoutMs:5000});assert.ok(service.transfers().length<=40);assert.equal(service.busy(),false);},{autoUpload:true});
});

test('subscription cleanup is owned, idempotent and does not remove a later stable registration',async()=>{
 await fixture(async({service})=>{
  let count=0;const fn=()=>count++,old=service.subscribe(fn);old();const current=service.subscribe(fn);old();
  await service.run(null,'create-folder',{input:{name:'One',parentId:null}});assert.equal(count,1);const other=service.subscribe(fn);current();current();await service.run(null,'create-folder',{input:{name:'Two',parentId:null}});assert.equal(count,2);other();
 });
});

test('open forwards only normalized location metadata while private search text stays in account memory',async()=>{
 await fixture(async({service,opens,calls})=>{
  service.open('Private query',{kind:'drive',folderId:B,view:'folder',name:'Private name',token:'secret'});assert.deepEqual(opens,[{query:'Private query',location:driveLocation(B)}]);assert.equal(calls.length,0);service.open('x',{kind:'drive',folderId:'../private'});assert.equal(opens.length,1);
 });
});

test('transfer display metadata cannot retain bidi override/isolate controls from untrusted File names',async()=>{
 await fixture(async({service})=>{
  let rejected=false;try{await service.upload([new File(['data'],'דוח\u202eexe.txt\u2066')]);}catch(_){rejected=true;}
  if(!rejected){const records=service.transfers();assert.ok(records.every(t=>!/[\u202a-\u202e\u2066-\u2069]/.test(t.name)));assert.ok(records[0].name.includes('דוח'));}
 });
});

test('stale preview details cannot adopt a newer shared-cache version or MIME after another independent browse',async()=>{
 await fixture(async({service,nodes,calls})=>{
  const original=(await service.browse(driveLocation())).items[0];nodes.set(A,node(A,{version:2,name:'New image.png',mime:'image/png'}));await service.browse(driveLocation());const before=calls.filter(c=>c.action==='content').length;
  const answer=await service.run(original.key,'preview',{input:{version:original.version}});assert.equal(answer.ok,false);assert.equal(calls.filter(c=>c.action==='content').length,before);
 },{nodes:[node()]});
});

test('cancellation cleanup remains busy and flush-owned until its versioned DELETE finishes',async()=>{
 const gate=defer();await fixture(async({service,xhrs,calls})=>{
  await service.upload([new File(['data'],'Cancel.txt')]);await until(()=>xhrs.length===1);service.cancelTransfer(service.transfers()[0].id);await until(()=>calls.some(c=>c.method==='DELETE'));
  assert.equal(service.busy(),true);assert.deepEqual(await service.flush({timeoutMs:0}),{lost:1});gate.resolve();assert.deepEqual(await service.flush({timeoutMs:1000}),{lost:0});assert.equal(service.busy(),false);
 },{fetch:async call=>{if(call.method==='DELETE')await gate.promise;}});
});

test('a flush deadline reports uncertain queued work without retrying or dropping accepted uploads',async()=>{
 await fixture(async({service,xhrs,calls})=>{
  await service.upload([new File(['data'],'One.txt')]);await until(()=>xhrs.length===1);assert.deepEqual(await service.flush({timeoutMs:0}),{lost:1});assert.equal(service.busy(),true);assert.equal(calls.filter(c=>c.action==='uploads').length,1);
  xhrs[0].complete();assert.deepEqual(await service.flush({timeoutMs:1000}),{lost:0});assert.equal(xhrs.length,1);
 });
});

test('app reference caches stay within500 even while independent readers retain older result objects',async()=>{
 await fixture(async({service,native})=>{
  let first,last;for(let i=0;i<6;i++){const answer=await service.browse({kind:'apps',app:'mail'},{query:'batch'+i});first ||=answer.items[0];last=answer.items.at(-1);assert.equal(answer.items.length,100);}
  const before=native.filter(c=>c.type==='run').length;assert.equal((await service.run(first.key,'open-file')).ok,false);assert.equal(native.filter(c=>c.type==='run').length,before);assert.equal((await service.run(last.key,'open-file')).ok,true);
 },{load:(app,q)=>({status:'ready',files:Array.from({length:100},(_,i)=>appFile(app,{id:'mail:file:'+q+':'+i,objectId:q+':'+i,name:q+' invoice '+i}))})});
});

test('source removal and caller cancellation revoke service refs before any native effect or Drive request',async()=>{
 const gate=defer();let effects=0;await fixture(async({service,setSources,calls})=>{
  const key=(await service.browse({kind:'apps',app:'mail'})).items[0].key,life=new AbortController(),pending=service.run(key,'open-file',{signal:life.signal});await turn();life.abort();gate.resolve();assert.equal((await pending).cancelled,true);assert.equal(effects,0);
  setSources([]);service.update();assert.equal((await service.run(key,'open-file')).ok,false);assert.equal(calls.length,0);
 },{run:async(_a,_i,_id,{current})=>{await gate.promise;if(current())effects++;return{ok:true};}});
});

test('invalid observed mutation versions are rejected rather than replaced by a cached valid version',async()=>{
 await fixture(async({service,calls})=>{
  const key=(await service.browse(driveLocation())).items[0].key;
  for(const version of [undefined,null,'1',-1,NaN]){const before=calls.length;await assert.rejects(service.run(key,'delete',{input:{version}}),e=>e.status===400);assert.equal(calls.length,before);}
 },{nodes:[node()]});
});

test('cancelled uploads reconcile an unacknowledged reservation with the exact operation and delete only unchanged pending metadata',async()=>{
 for(const mode of ['pending','ready','newer']){
  const responseGate=defer(),id='d'.repeat(32);let original,attempts=0;
  try{await fixture(async({service,calls,nodes,xhrs})=>{
   await service.upload([new File(['data'],'Reserved.txt',{type:'text/plain'})],{folderId:B});await until(()=>nodes.has(id)&&calls.filter(c=>c.action==='uploads').length===1);
   assert.equal(xhrs.length,0,'the first reservation reply has not reached the client');service.cancelTransfer(service.transfers()[0].id);
   assert.deepEqual(await service.flush({timeoutMs:1000}),{lost:0});assert.equal(attempts,2,'only the cancellation cleanup performs one exact idempotent replay');
   const reservations=calls.filter(c=>c.action==='uploads');assert.deepEqual(reservations[1].body,reservations[0].body);assert.equal(reservations[0].body.parentId,B);assert.equal(reservations[0].body.operationId,service.transfers()[0].id);
   assert.equal(xhrs.length,0);assert.equal(service.transfers()[0].status,'cancelled');
   const deletes=calls.filter(c=>c.method==='DELETE');
   if(mode==='pending'){assert.equal(nodes.has(id),false);assert.equal(deletes.length,1);assert.equal(deletes[0].params.version,'1');}
   else{assert.equal(nodes.has(id),true,'another same-account continuation is preserved');assert.equal(deletes.length,0);assert.equal(nodes.get(id).version,mode==='ready'?2:3);}
  },{nodes:[folder(B)],fetch:async(call,state)=>{
   if(call.action!=='uploads')return;
   attempts++;if(attempts===1){original=structuredClone(call.body);state.nodes.set(id,node(id,{name:call.body.name,parentId:call.body.parentId,mime:call.body.mime,size:call.body.size,status:'pending'}));await responseGate.promise;return Response.json({item:state.nodes.get(id)||node(id,{status:'pending'})},{status:201});}
   assert.deepEqual(call.body,original);if(mode!=='pending')state.nodes.set(id,{...state.nodes.get(id),status:'ready',version:mode==='ready'?2:3,name:mode==='newer'?'Renamed elsewhere.txt':original.name});
   return Response.json({item:state.nodes.get(id)},{status:201});
  }});}finally{responseGate.resolve();await turn();}
 }
});

test('account replacement before or during reservation reconciliation cannot replay or delete for the new owner',async()=>{
 for(const when of ['before-replay','during-replay']){
  const first=defer(),second=defer(),id='e'.repeat(32);let attempts=0;
  try{await fixture(async({service,calls,nodes,life,F})=>{
   await service.upload([new File(['data'],'Account private.txt')]);await until(()=>nodes.has(id));
   if(when==='during-replay'){service.cancelTransfer(service.transfers()[0].id);await until(()=>attempts===2);}
   F.session.view.user.id='bea';life.abort();await turn();second.resolve();first.resolve();await turn();
   assert.equal(calls.filter(c=>c.action==='uploads').length,when==='before-replay'?1:2);assert.equal(calls.some(c=>c.action==='item'||c.method==='DELETE'),false);assert.equal(nodes.has(id),true);assert.deepEqual(service.transfers(),[]);assert.equal(service.busy(),false);
  },{fetch:async(call,state)=>{
   if(call.action!=='uploads')return;
   attempts++;if(attempts===1){state.nodes.set(id,node(id,{name:call.body.name,mime:call.body.mime,size:call.body.size,status:'pending'}));await first.promise;}
   else await second.promise;
   return Response.json({item:state.nodes.get(id)},{status:201});
  }});}finally{first.resolve();second.resolve();await turn();}
 }
});

test('an uncertain non-cancelled reservation failure is not automatically replayed',async()=>{
 const id='f'.repeat(32);await fixture(async({service,calls,nodes})=>{
  await service.upload([new File(['data'],'Uncertain.txt')]);assert.deepEqual(await service.flush({timeoutMs:1000}),{lost:0});assert.equal(calls.filter(c=>c.action==='uploads').length,1);assert.equal(calls.some(c=>c.method==='DELETE'),false);assert.equal(nodes.has(id),true);assert.equal(service.transfers()[0].status,'failed');
 },{fetch:async(call,state)=>{if(call.action==='uploads'){state.nodes.set(id,node(id,{name:call.body.name,mime:call.body.mime,size:call.body.size,status:'pending'}));throw Error('Reservation committed but acknowledgement was lost');}}});
});
