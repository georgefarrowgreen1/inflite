// Real Activity registry, components and native sheet; only producers are fixtures.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,existsSync,mkdirSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {chromium,webkit}=require('playwright');
const PUBLIC=resolve(__dirname,'../today/public'),ORIGIN='http://activity.ifl.test';
const CSP=/Content-Security-Policy: (.*)/.exec(readFileSync(resolve(PUBLIC,'_headers'),'utf8'))[1];
let browser;
before(async()=>{browser=process.env.WEB_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});});
after(async()=>browser?.close());
const fixture=`
import {openWorkspaceSync} from '/roof/workspace-sync-view.js';
import * as ui from '/roof/ui.js';import {createSheets} from '/roof/sheet.js';import {createActivityRegistry,createWorkspaceActivity} from '/roof/workspace-activity.js';
window.IFL={glyph:()=>'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor"/></svg>'};
const ac=new AbortController(),F={ui,signal:ac.signal,route:{path:'/'},session:{view:{user:{id:'owner-a'}}}};F.sheet=createSheets(F);
const registry=createActivityRegistry(F),files=registry.source('files'),sync=registry.source('workspace-sync'),view=createWorkspaceActivity(F,{registry});
const T=window.T={registry,files,sync,view,ac,F,calls:[],toasts:[],put:(id,patch={})=>files.put(id,{title:'Route.gpx',detail:'My Drive',status:'running',kind:'upload',...patch})};
T.put('upload',{progress:.25,actions:[{id:'cancel',label:'Cancel upload',run(){T.calls.push('cancel');T.put('upload',{status:'cancelled',detail:'Upload cancelled'});return{ok:true};}}]});
T.put('download',{title:'Forecast.csv',status:'handed-off',kind:'download',detail:'Your browser handles this download.'});
sync.put('layout',{title:'Workspace sync',status:'failed',kind:'sync',detail:'Connection lost. Refresh before trying again.',actions:[{id:'retry',label:'Try again',run:async({current,signal})=>{T.calls.push('retry');sync.put('layout',{title:'Workspace sync',status:'running',kind:'sync',detail:'Checking your latest layout'});await new Promise(r=>T.finishSync=r);if(current()&&!signal.aborted)sync.put('layout',{title:'Workspace sync',status:'succeeded',kind:'sync',detail:'Up to date'});return{ok:true};}}]});
F.toast=text=>T.toasts.push(text);
T.syncState={state:'synced',message:'Your workspaces are up to date.',hasCloud:true};T.syncListeners=new Set();
T.setSync=patch=>{Object.assign(T.syncState,patch);for(const fn of T.syncListeners)fn();};
T.openSync=()=>{view.close();T.syncSheet=openWorkspaceSync(F,{status:()=>T.syncState,subscribe:fn=>{T.syncListeners.add(fn);return()=>T.syncListeners.delete(fn);},resolve:async choice=>{T.calls.push(choice);if(T.holdSync)await T.holdSync;T.setSync({state:'synced',message:'Your workspaces are up to date.'});},reviewSaved:()=>T.calls.push('review'),sync:async()=>{T.calls.push('sync');if(T.failSync)throw Error('unavailable');T.setSync({state:'synced'});}});};
document.getElementById('launch').addEventListener('click',()=>view.open());document.getElementById('ready').textContent='Ready';
`;
async function open({width=1280,theme='light',deferCSS=false,failCSS=0,launch=true}={}){
 const ctx=await browser.newContext({viewport:{width,height:850},colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block'}),page=await ctx.newPage(),errors=[],unknown=[];let cssRequests=0,releaseCSS;const cssWait=deferCSS?new Promise(resolve=>releaseCSS=resolve):Promise.resolve();
 page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.violations=[];window.rejections=[];document.addEventListener('securitypolicyviolation',e=>violations.push(e.violatedDirective+' '+e.blockedURI));addEventListener('unhandledrejection',e=>rejections.push(String(e.reason)));});
 await ctx.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;if(url.origin!==ORIGIN){unknown.push(url.href);return route.abort();}
  if(path==='/')return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':CSP},body:'<!doctype html><html data-theme="'+theme+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><script type="module" src="/fixture.js"></script></head><body><main><button id="launch">Open Activity</button><p id="ready"></p></main></body></html>'});
  if(path==='/roof/workspace-activity.css'){cssRequests++;await cssWait;if(cssRequests<=failCSS)return route.fulfill({status:503,contentType:'text/css',body:''});}
  if(path==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:fixture});
  if(path==='/favicon.ico')return route.fulfill({status:204,body:''});
  const file=resolve(PUBLIC,'.'+path);if(!file.startsWith(PUBLIC+'/')||!existsSync(file)){unknown.push(path);return route.fulfill({status:404,body:'Unexpected Activity asset'});}
  return route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream',body:readFileSync(file)});
 });
 await page.goto(ORIGIN,{waitUntil:'domcontentloaded'});await page.getByText('Ready',{exact:true}).waitFor();if(launch)await page.getByRole('button',{name:'Open Activity',exact:true}).click();
 const sheet=page.getByRole('dialog',{name:'Activity',exact:true});if(launch)await sheet.waitFor();
 return{ctx,page,sheet,cssRequests:()=>cssRequests,releaseCSS:()=>releaseCSS?.(),clean:async()=>{assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);assert.deepEqual(await page.evaluate(()=>[violations,rejections]),[[],[]]);}};
}
const row=(t,name)=>t.sheet.getByRole('listitem').filter({has:t.page.getByRole('heading',{name,exact:true})});
test('Activity preserves focused task controls through progress and runs supplied safe actions exactly once',async()=>{
 const t=await open();try{
  const upload=row(t,'Route.gpx'),cancel=upload.getByRole('button',{name:'Cancel upload: Route.gpx',exact:true});await cancel.focus();await t.page.evaluate(()=>{window.originalActivityButton=document.activeElement;T.put('upload',{progress:.75,actions:[{id:'cancel',label:'Cancel upload',run(){T.calls.push('cancel');T.put('upload',{status:'cancelled'});}}]});});
  assert.equal(await t.page.evaluate(()=>document.activeElement===originalActivityButton),true);assert.equal(await upload.locator('progress').evaluate(n=>n.value),.75);
  await cancel.click();await upload.getByText('Cancelled',{exact:true}).waitFor();assert.deepEqual(await t.page.evaluate(()=>T.calls),['cancel']);
  const sync=row(t,'Workspace sync');await sync.getByRole('button',{name:'Try again: Workspace sync',exact:true}).click();await sync.getByText('In progress',{exact:true}).waitFor();
  assert.equal(await sync.locator('progress').getAttribute('value'),null,'indeterminate sync never invents a percentage');
  await t.page.evaluate(()=>T.finishSync());await sync.getByText('Completed',{exact:true}).waitFor();assert.deepEqual(await t.page.evaluate(()=>T.calls),['cancel','retry']);assert.equal(await sync.locator('.wsa-symbol [data-icon=check]').count(),1);
  const download=row(t,'Forecast.csv');await download.getByText('Opened download',{exact:true}).waitFor();assert.equal(await download.getByText('Completed',{exact:true}).count(),0);assert.equal(await download.locator('progress').isHidden(),true);assert.equal(await download.locator('.wsa-symbol [data-icon=download]').count(),1);
  await t.sheet.getByRole('button',{name:'Clear completed',exact:true}).focus();await t.sheet.getByRole('button',{name:'Clear completed',exact:true}).click();assert.equal(await t.sheet.getByRole('listitem').count(),0);await t.sheet.getByText('Uploads, downloads and workspace tasks appear here.',{exact:true}).waitFor();assert.equal(await t.sheet.locator('.wsa-summary').evaluate(n=>n===document.activeElement),true,'clearing the last completed tasks leaves keyboard focus on the updated summary');await t.clean();
 }finally{await t.ctx.close();}
});
test('narrow dark Activity keeps rounded padded controls, escapes filenames and has no horizontal overflow',async()=>{
 const t=await open({width:320,theme:'dark'});try{
  await t.page.evaluate(()=>T.put('long',{title:'<img onerror=window.activityXss=true> '+ 'A'.repeat(145),detail:'Long source '+ 'B'.repeat(260),status:'failed',actions:[{id:'refresh',label:'Refresh folder',run(){return{ok:true};}}]}));
  assert.equal(await t.sheet.locator('img[onerror]').count(),0);assert.equal(await t.page.evaluate(()=>window.activityXss),undefined);
  const overflow=await t.sheet.evaluate(n=>({sheet:n.scrollWidth>n.clientWidth+1,body:document.documentElement.scrollWidth>innerWidth+1}));assert.deepEqual(overflow,{sheet:false,body:false});
  const targets=await t.sheet.locator('button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>({h:n.getBoundingClientRect().height,r:parseFloat(getComputedStyle(n).borderRadius)})));assert.ok(targets.every(n=>n.h>=43&&n.r>=12),JSON.stringify(targets));
  if(process.env.ACTIVITY_SCREENSHOTS&&process.env.WEB_UI_BROWSER!=='webkit'){await t.page.evaluate(()=>T.files.remove('long'));mkdirSync(process.env.ACTIVITY_SCREENSHOTS,{recursive:true});await t.page.screenshot({path:resolve(process.env.ACTIVITY_SCREENSHOTS,'activity-phone-dark.png'),caret:'initial'});}
  await t.clean();
 }finally{await t.ctx.close();}
});
test('retired tasks and account replacement release controls, callbacks and the native sheet',async()=>{
 const t=await open();try{
  await t.page.evaluate(()=>{const entry=T.registry.snapshot().find(e=>e.id==='upload');window.staleActivityEntry=entry;T.files.remove('upload');});assert.equal(await row(t,'Route.gpx').count(),0);
  assert.equal(await t.page.evaluate(async()=> (await T.registry.invoke(staleActivityEntry.key,'cancel',staleActivityEntry.revision)).cancelled),true);assert.deepEqual(await t.page.evaluate(()=>T.calls),[]);
  await t.page.evaluate(()=>{T.F.session.view.user.id='owner-b';T.registry.snapshot();});await t.sheet.waitFor({state:'detached'});assert.deepEqual(await t.page.evaluate(()=>T.registry.snapshot()),[]);assert.equal(await t.page.evaluate(()=>T.files.put('late',{title:'Private old filename',status:'failed'})),false);await t.clean();
 }finally{await t.ctx.close();}
});
test('Escape restores the launcher and reopening Activity does not itself start or retry work',async()=>{
 const t=await open();try{await t.page.keyboard.press('Escape');await t.sheet.waitFor({state:'detached'});assert.equal(await t.page.getByRole('button',{name:'Open Activity',exact:true}).evaluate(n=>n===document.activeElement),true);await t.page.getByRole('button',{name:'Open Activity',exact:true}).click();await t.sheet.waitFor();assert.equal(await t.sheet.getByRole('listitem').count(),3);assert.deepEqual(await t.page.evaluate(()=>T.calls),[]);await t.clean();}finally{await t.ctx.close();}
});

test('Activity owns its stylesheet and cannot open after a delayed route, owner, close or abort change',async()=>{
 for(const change of ['route','owner','close','abort']){const t=await open({width:320,deferCSS:true,launch:false});try{
  await t.page.evaluate(()=>{T.pending=T.view.open()});assert.equal(await t.sheet.count(),0);
  await t.page.evaluate(change=>{if(change==='route')T.F.route={path:'/other'};if(change==='owner')T.F.session.view.user.id='owner-b';if(change==='close')T.view.close();if(change==='abort')T.ac.abort();},change);
  t.releaseCSS();await t.page.evaluate(()=>T.pending);assert.equal(await t.sheet.count(),0);assert.deepEqual(await t.page.evaluate(()=>T.toasts),[]);await t.clean();
 }finally{t.releaseCSS();await t.ctx.close();}}
});
test('Activity CSS failure stays closed, explains the problem and permits an explicit retry',async()=>{
 const t=await open({width:320,deferCSS:true,failCSS:1,launch:false});try{
  await t.page.evaluate(()=>{T.pending=T.view.open()});t.releaseCSS();await t.page.evaluate(()=>T.pending);
  assert.equal(await t.sheet.count(),0);assert.deepEqual(await t.page.evaluate(()=>T.toasts),['Activity couldn’t load. Try again.']);
  await t.page.evaluate(()=>T.view.open());await t.sheet.waitFor();assert.equal(t.cssRequests(),2);await t.clean();
 }finally{t.releaseCSS();await t.ctx.close();}
});
for(const [width,theme] of [[320,'dark'],[1280,'light']])test(`Sync uses rounded shared rows and explicit conflict choices ${width}/${theme}`,async()=>{
 const t=await open({width,theme});try{
  assert.equal(t.cssRequests(),1,'Activity self-loads once without injected fixture CSS');
  await t.page.evaluate(()=>T.openSync());const sheet=t.page.getByRole('dialog',{name:'Workspaces on Devices',exact:true});await sheet.waitFor();
  assert.equal(await sheet.locator('.ifs-body .ifs-acts').count(),0,'no nested sticky footer inside panel content');
  assert.equal(await sheet.getByRole('group',{name:'Resolve workspace conflict'}).isHidden(),true);
  await t.page.evaluate(()=>T.setSync({state:'conflict',message:'Choose which workspace layout to keep.',hasCloud:true}));
  await sheet.getByRole('group',{name:'Resolve workspace conflict'}).waitFor();assert.equal(await sheet.getByRole('button',{name:'Sync now',exact:true}).isHidden(),true);
  const geometry=await sheet.evaluate(root=>({overflow:root.scrollWidth>root.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1,rows:[...root.querySelectorAll('.ifl-row')].map(row=>({padding:parseFloat(getComputedStyle(row).paddingLeft),radius:parseFloat(getComputedStyle(row).borderRadius)})),buttons:[...root.querySelectorAll('button')].filter(n=>n.getClientRects().length).map(n=>({height:n.getBoundingClientRect().height+Math.max(0,-parseFloat(getComputedStyle(n,'::after').top)||0)+Math.max(0,-parseFloat(getComputedStyle(n,'::after').bottom)||0),radius:parseFloat(getComputedStyle(n).borderRadius)}))}));
  assert.equal(geometry.overflow,false);assert.ok(geometry.rows.every(r=>r.padding>=14&&r.radius>=12));assert.ok(geometry.buttons.every(b=>b.height>=43&&b.radius>=12),JSON.stringify(geometry.buttons));
  await sheet.getByRole('button',{name:'Keep this device',exact:true}).click();assert.deepEqual(await t.page.evaluate(()=>T.calls),['local']);
  await t.clean();
 }finally{await t.ctx.close();}
});
test('Sync pending actions release controls safely on account replacement and unexpected failures are explained',async()=>{
 const t=await open();try{
  await t.page.evaluate(()=>{T.openSync();T.failSync=true;});const sheet=t.page.getByRole('dialog',{name:'Workspaces on Devices',exact:true});
  await sheet.getByRole('button',{name:'Sync now',exact:true}).click();assert.deepEqual(await t.page.evaluate(()=>T.toasts),['Sync couldn’t finish. Try again.']);
  await t.page.evaluate(()=>{T.failSync=false;T.setSync({state:'conflict',hasCloud:true});T.holdSync=new Promise(resolve=>T.releaseSync=resolve);});
  await sheet.getByRole('button',{name:'Keep this device',exact:true}).click();assert.equal(await sheet.getByRole('button',{name:'Use cloud workspaces',exact:true}).isEnabled(),false);
  await t.page.evaluate(()=>{T.F.session.view.user.id='owner-b';T.releaseSync();});await sheet.waitFor({state:'detached'});assert.equal(await t.page.evaluate(()=>T.syncListeners.size),0);await t.clean();
 }finally{await t.ctx.close();}
});
