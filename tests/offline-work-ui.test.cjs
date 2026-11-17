// Real IndexedDB, Web Crypto, private File bytes, Drive queue and framework UI.
// The HTTP fixture replaces only transport; D1/R2 ownership is tested separately.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {readFileSync,existsSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {chromium,webkit}=require('playwright');
let devices=new Map();
let browser,server,origin,requests=[],objects=new Map(),operations=new Map(),prefs={order:['weather','fitness','markets','chat'],hidden:[]};
const html='<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/roof/controls.css"><main id="today"></main>';
before(async()=>{
 server=createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost'),path=u.pathname;
  const answer=(v,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(v))};
  if(path.startsWith('/api/files/')){
   const chunks=[];
   try { for await(const c of req)chunks.push(c); }
   catch(error){ if(req.aborted)return;throw error; }
   const bytes=Buffer.concat(chunks),action=path.split('/').at(-1),owner=req.headers['x-inflite-files-owner'];requests.push({action,owner,method:req.method});
   const data=req.headers['content-type']?.startsWith('application/json')?JSON.parse(bytes.toString()||'{}'):null;
   if(action==='preferences'){if(req.method==='GET')return answer({prefs});if(JSON.stringify(data.expected)!==JSON.stringify(prefs))return answer({error:'Changed on another device'},409);prefs={...data};delete prefs.expected;return answer({prefs})}
   if(action==='open-tabs'){
    const owned=devices.get(owner)||[];
    if(req.method==='GET')return answer({tabs:owned.filter(t=>t.target&&t.id!==u.searchParams.get('id')).map(t=>({...t,remainingMs:150000}))});
    const prior=owned.find(t=>t.tab===data.tab);
    if(!prior||prior.seq<data.seq)devices.set(owner,[...owned.filter(t=>t.tab!==data.tab),{...data,updatedAt:Date.now()}]);
    return answer({ok:true});
   }
   if(action==='uploads'){const prior=operations.get(owner+data.operationId);if(prior)return answer({item:prior});const id=String(objects.size+1).padStart(32,'0'),item={id,parentId:data.parentId,name:data.name,kind:'file',mime:data.mime,size:data.size,status:'pending',createdAt:Date.now(),modifiedAt:Date.now(),version:1};operations.set(owner+data.operationId,item);objects.set(id,{item,owner});return answer({item})}
   if(action==='content'&&req.method==='PUT'){const record=objects.get(u.searchParams.get('id'));if(!record||record.owner!==owner)return answer({error:'Missing'},404);record.bytes=bytes;Object.assign(record.item,{status:'ready',version:2});return answer({item:record.item})}
   return answer({error:'Unknown fixture action'},404);
  }
  if(path==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(html)}
  const file=resolve(__dirname,'../today/public','.'+path),base=resolve(__dirname,'../today/public');if(!file.startsWith(base+'/')||!existsSync(file)){res.writeHead(404);return res.end()}
  res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=process.env.WEB_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r))});
async function boot(page,owner='offline_a'){
 await page.goto(origin);await page.evaluate(async owner=>{
  const ui=await import('/roof/ui.js'),{createSheets}=await import('/roof/sheet.js');window.IFL={glyph:()=>'<svg viewBox="0 0 24 24"></svg>'};
  const ac=new AbortController();window.T={ac,toasts:[],events:new Map(),applied:[],cloud:{order:['weather','fitness','markets','chat'],hidden:[]}};
  T.F={ui,signal:ac.signal,session:{view:{user:{id:owner}},apps:{}},route:{kind:'tab',tab:'today'},toast:t=>T.toasts.push(t),on:(key,fn)=>{T.events.set(key,fn);return()=>T.events.delete(key)},nav:{go:path=>T.path=path}};T.F.sheet=createSheets(T.F);
 },owner);
}
test('encrypted account journal survives a closed tab, returns exact File bytes and purges without late resurrection',async()=>{
 const ctx=await browser.newContext(),page=await ctx.newPage();await boot(page);
 await page.evaluate(async()=>{const {openOfflineStore}=await import('/roof/offline-store.js');T.store=await openOfflineStore('offline_a',{signal:T.ac.signal});await T.store.put({id:'upload_1',kind:'upload',name:'private.txt',mime:'text/plain',file:new File(['secret contents\u0000\ufffd'],'private.txt')});const db=await new Promise((yes,no)=>{const r=indexedDB.open('ifl:offline:v1:offline_a');r.onsuccess=()=>yes(r.result);r.onerror=no});T.raw=await new Promise((yes,no)=>{const r=db.transaction('work').objectStore('work').get('upload_1');r.onsuccess=()=>yes(new TextDecoder().decode(r.result.data));r.onerror=no});db.close()});
 assert.doesNotMatch(await page.evaluate(()=>T.raw),/secret contents|private.txt/);await page.close();
 const reopened=await ctx.newPage();await boot(reopened);assert.deepEqual(await reopened.evaluate(async()=>{const {openOfflineStore}=await import('/roof/offline-store.js');T.store=await openOfflineStore('offline_a',{signal:T.ac.signal});const records=await T.store.list(),other=await openOfflineStore('offline_b');const count=(await other.list()).length;other.close();return {text:await records[0].file.text(),name:records[0].file.name,other:count}}),{text:'secret contents\u0000\ufffd',name:'private.txt',other:0});
 assert.equal(await reopened.evaluate(async()=>{window.dispatchEvent(new CustomEvent('inflite:purge-offline',{detail:{owner:'offline_a'}}));try{await T.store.put({id:'late',text:'private'});return false}catch(e){return e.name==='AbortError'}}),true);await ctx.close();
});
test('a durable queued upload resumes after closing its tab with the captured folder and exact bytes',async()=>{
 const ctx=await browser.newContext(),page=await ctx.newPage();await boot(page,'queued_owner');
 await page.evaluate(async()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});const {createFilesService}=await import('/roof/files-service.js');T.service=createFilesService(T.F,{sources:()=>[]});await T.service.upload([new File(['durable binary\u0000\ufffd'],'queued.txt',{type:'text/plain'})],{folderId:'A'.repeat(32)});});
 assert.equal(await page.evaluate(()=>T.service.transfers()[0].status),'queued');await page.close();
 const next=await ctx.newPage();await boot(next,'queued_owner');await next.evaluate(async()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});const {createFilesService}=await import('/roof/files-service.js');T.service=createFilesService(T.F,{sources:()=>[]})});await next.waitForFunction(()=>T.service.transfers().length===1);assert.equal(await next.evaluate(()=>T.service.transfers()[0].status),'queued');
 await next.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'))});await next.waitForFunction(()=>T.service.transfers()[0].status==='done');const record=[...objects.values()].find(v=>v.owner==='queued_owner');assert.equal(record.item.parentId,'A'.repeat(32));assert.equal(record.bytes.toString(),'durable binary\u0000\ufffd');assert.equal(requests.filter(r=>r.owner==='queued_owner'&&r.action==='uploads').length,1);await ctx.close();
});
test('offline Today edits survive reopening and require a choice before overwriting another device',async()=>{
 prefs={order:['weather','fitness','markets','chat'],hidden:[]};const ctx=await browser.newContext(),page=await ctx.newPage();await boot(page,'prefs_owner');
 await page.evaluate(async()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});const {createOfflinePrefs}=await import('/roof/offline-prefs.js');T.preferences=await createOfflinePrefs(T.F,{owner:'prefs_owner',root:document.querySelector('main'),cloud:()=>T.cloud,apply:p=>T.applied.push(p),ack:p=>T.cloud=p});T.preferences.change({...T.cloud,density:'compact'})});await page.getByText('Today layout kept on this device. Waiting for a connection.',{exact:true}).waitFor();await page.close();
 prefs={...prefs,hidden:['weather']};const next=await ctx.newPage();await boot(next,'prefs_owner');await next.evaluate(async()=>{const {createOfflinePrefs}=await import('/roof/offline-prefs.js');T.preferences=await createOfflinePrefs(T.F,{owner:'prefs_owner',root:document.querySelector('main'),cloud:()=>T.cloud,apply:p=>T.applied.push(p),ack:p=>T.cloud=p})});await next.getByRole('button',{name:'Review layouts'}).waitFor();assert.equal(prefs.density,undefined);assert.equal(await next.evaluate(()=>T.applied[0].density),'compact');
 await next.getByRole('button',{name:'Review layouts'}).click();await next.getByRole('button',{name:'Use account layout',exact:true}).click();await next.waitForFunction(()=>T.applied.at(-1).hidden.includes('weather'));assert.equal(prefs.density,undefined);await ctx.close();
});

test('closing one tab withdraws just that handoff while Today stays open on another device',async()=>{
 const owner='continuation_owner', first=await browser.newContext(),second=await browser.newContext();
 async function open(context,path){
  const page=await context.newPage();await boot(page,owner);
  await page.evaluate(async({owner,path})=>{
   const {connectContinuity}=await import('/roof/continuity.js');
   const {parse}=await import('/roof/router.js'),{createResumeState}=await import('/roof/restore.js');
   const resume=createResumeState({owner,signal:T.ac.signal});
   T.F.route=parse(path,{roof:true,workspace:true});
   T.F.session.apps={chats:true,weather:true};T.F.continuationTarget=()=>resume.targetFor(T.F.route);
   connectContinuity(T.F,{owner,root:document.querySelector('main')});
  },{owner,path});return page;
 }
 try{
  const chat=await open(first,'/chats/#open=friend_42'),weather=await open(first,'/weather/');
  const desktop=await open(second,'/');
  const chatRow=desktop.getByRole('button',{name:/Chats/}),weatherRow=desktop.getByRole('button',{name:/Weather/});
  await chatRow.waitFor();await weatherRow.waitFor();
  assert.equal(await chat.getByRole('button',{name:/Weather/}).count(),0);
  assert.equal(await desktop.evaluate(()=>T.path),undefined);
  await chatRow.click();await desktop.waitForFunction(()=>T.path==='/chats/#open=friend_42');
  await weather.close();await weatherRow.waitFor({state:'hidden',timeout:20000});assert.ok(await chatRow.isVisible());
  await chat.close();await desktop.locator('.continuation-card').waitFor({state:'hidden',timeout:20000});
 }finally{await first.close();await second.close()}
});
