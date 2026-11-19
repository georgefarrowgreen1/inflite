const{test}=require('node:test'),assert=require('node:assert/strict');
const origin='https://inflite.ai',owner='owner_a';
const request=(path,init={})=>new Request(origin+'/api/organise/'+path,{...init,headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','X-Inflite':'1','X-Inflite-Owner':owner,'Content-Type':'application/json',Cookie:'__Secure-account='+'a'.repeat(32),...init.headers}});
test('private app proxy fixes capabilities, body size, owner and upstream, with no credential leakage',async()=>{const{organiseAPI}=await import('../today/src/organise.js');const seen=[],env={ACCOUNT_ORIGIN:'https://account.inflite.ai',TODAY_AS:origin,APPS:{fetch:async r=>{seen.push(r);return Response.json({records:[],cursor:null},{headers:{'Set-Cookie':'do-not-forward=1','Cache-Control':'public'}})}}};let r=await organiseAPI(request('list',{method:'POST',body:'{"kind":"notes"}'}),env);assert.equal(r.status,200);assert.equal(seen[0].url,'https://account.inflite.ai/api/account/today/organise/list');assert.equal(seen[0].headers.get('X-Inflite-Owner'),owner);assert.equal(r.headers.get('Set-Cookie'),null);assert.match(r.headers.get('Cache-Control'),/no-store/);for(const [path,init,status]of [['list',{method:'GET'},404],['list',{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'},403],['record?kind=notes&id='+'a'.repeat(32),{headers:{'X-Inflite-Owner':''}},401],['record?kind=notes&id='+'a'.repeat(32)+'&url=https://evil.test',{},400],['record',{method:'PUT',body:'x'.repeat(512*1024+1)},413]])assert.equal((await organiseAPI(request(path,init),env)).status,status,path);assert.equal(seen.length,1)});
test('native app documents use Root CSP and routes while assets and version stay first party',async()=>{const{organisePage}=await import('../today/src/organise.js'),{PAGE_HEADERS}=await import('../today/src/roof.js');const env={ASSETS:{fetch:async r=>new Response(new URL(r.url).pathname,{headers:{'Content-Type':'text/html','ETag':'old'}})}};for(const app of ['calendar','notes','people']){const r=await organisePage(new Request(origin+'/'+app+'/'),env);assert.equal(r.status,200);assert.equal(await r.text(),'/');assert.equal(r.headers.get('Content-Security-Policy'),PAGE_HEADERS['Content-Security-Policy']);assert.equal(r.headers.get('ETag'),null);assert.equal((await organisePage(new Request(origin+'/'+app),env)).status,308);assert.equal((await(await organisePage(new Request(origin+'/'+app+'/version'),env)).json()).build,'4.32.3');assert.equal((await organisePage(new Request(origin+'/'+app+'/'),{...env,ROOF_OFF:'1'})).status,503)}});

test('native app release graphs keep code and styles together across future deployments',async()=>{
 const {readFileSync}=require('node:fs'),{resolve}=require('node:path'),{REGISTRY}=await import('../today/public/roof/router.js');
 const pub=resolve(__dirname,'../today/public');
 for(const app of ['calendar','notes','people']){
  const R=REGISTRY[app],release=/\/releases\/(\d+\.\d+\.\d+)\//.exec(R.entry)?.[1];assert.equal(release,'4.32.3');
  assert.ok(R.css.every(p=>p.includes('/releases/'+release+'/')));
  const entry=readFileSync(resolve(pub,'.'+R.entry),'utf8');assert.ok(entry.includes('/organise/releases/'+release+'/app.js'));
  const connector=readFileSync(resolve(pub,'.'+R.connector),'utf8');assert.ok(connector.includes('/organise/releases/'+release+'/editor.js'));assert.ok(connector.includes('/organise/releases/'+release+'/editor.css'));
  for(const name of ['app.js','editor.js','store.js','model.js','links.js','actions.js','connected.js','import.js','organise.css','editor.css'])assert.equal(readFileSync(resolve(pub,'organise/releases',release,name),'utf8'),readFileSync(resolve(pub,'organise',name),'utf8'));
 }
});

test('release generation refuses to overwrite a published graph',()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync}=require('node:fs'),{tmpdir}=require('node:os'),{resolve}=require('node:path'),{spawnSync}=require('node:child_process');
 const root=mkdtempSync(resolve(tmpdir(),'ifl-release-'));
 try{
  mkdirSync(resolve(root,'tools'),{recursive:true});mkdirSync(resolve(root,'today/public/organise'),{recursive:true});writeFileSync(resolve(root,'tools/build-organise.mjs'),readFileSync(resolve(__dirname,'../tools/build-organise.mjs')));
  for(const f of ['app.js','store.js','model.js','editor.js','links.js','actions.js','connected.js','import.js','organise.css','editor.css'])writeFileSync(resolve(root,'today/public/organise',f),'original '+f);
  for(const app of ['calendar','notes','people']){mkdirSync(resolve(root,'today/public',app,'roof'),{recursive:true});writeFileSync(resolve(root,'today/public',app,'roof',app+'.js'),"import '/organise/app.js'");writeFileSync(resolve(root,'today/public',app,'roof/connector.js'),"export const connector={files:['/organise/editor.js']}")}
  assert.equal(spawnSync(process.execPath,['tools/build-organise.mjs','4.2.1'],{cwd:root}).status,0);
  writeFileSync(resolve(root,'today/public/organise/app.js'),'a different future build');
  const retry=spawnSync(process.execPath,['tools/build-organise.mjs','4.2.1'],{cwd:root});assert.notEqual(retry.status,0);assert.match(String(retry.stderr),/Release assets are immutable/);assert.equal(readFileSync(resolve(root,'today/public/organise/releases/4.2.1/app.js'),'utf8'),'original app.js');
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('lazy native exports preserve exact note text and calendar dates, and stop after account release',async()=>{
 const {exportValue}=await import('../today/public/organise/actions.js'),controller=new AbortController(),files=[],F={signal:controller.signal,workspace:{files:{save:async file=>{files.push(file);return {ok:true}}}}};
 await exportValue(F,'notes',{title:'Trip / plan',text:'Bring the lights.',checklist:[]});assert.equal(files[0].name,'Trip - plan.txt');assert.equal(files[0].type,'text/plain');assert.match(await files[0].text(),/Bring the lights\./);
 await exportValue(F,'calendar',{id:'a'.repeat(32),title:'A day out',allDay:true,startDate:'2026-11-17',endDate:'2026-11-18',description:''});assert.equal(files[1].name,'A day out.ics');assert.equal(files[1].type,'text/calendar');assert.match(await files[1].text(),/DTEND;VALUE=DATE:20261118/);
 controller.abort();await exportValue(F,'notes',{title:'Old account',text:'Not exported'});assert.equal(files.length,2);
});
