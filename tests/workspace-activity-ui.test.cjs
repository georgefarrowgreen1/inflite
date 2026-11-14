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
import * as ui from '/roof/ui.js';import {createSheets} from '/roof/sheet.js';import {createActivityRegistry,createWorkspaceActivity} from '/roof/workspace-activity.js';
window.IFL={glyph:()=>'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor"/></svg>'};
const ac=new AbortController(),F={ui,signal:ac.signal,session:{view:{user:{id:'owner-a'}}}};F.sheet=createSheets(F);
const registry=createActivityRegistry(F),files=registry.source('files'),sync=registry.source('workspace-sync'),view=createWorkspaceActivity(F,{registry});
const T=window.T={registry,files,sync,view,ac,F,calls:[],put:(id,patch={})=>files.put(id,{title:'Route.gpx',detail:'My Drive',status:'running',kind:'upload',...patch})};
T.put('upload',{progress:.25,actions:[{id:'cancel',label:'Cancel upload',run(){T.calls.push('cancel');T.put('upload',{status:'cancelled',detail:'Upload cancelled'});return{ok:true};}}]});
T.put('download',{title:'Forecast.csv',status:'handed-off',kind:'download',detail:'Your browser handles this download.'});
sync.put('layout',{title:'Workspace sync',status:'failed',kind:'sync',detail:'Connection lost. Refresh before trying again.',actions:[{id:'retry',label:'Try again',run:async({current,signal})=>{T.calls.push('retry');sync.put('layout',{title:'Workspace sync',status:'running',kind:'sync',detail:'Checking your latest layout'});await new Promise(r=>T.finishSync=r);if(current()&&!signal.aborted)sync.put('layout',{title:'Workspace sync',status:'succeeded',kind:'sync',detail:'Up to date'});return{ok:true};}}]});
document.getElementById('launch').addEventListener('click',()=>view.open());document.getElementById('ready').textContent='Ready';
`;
async function open({width=1280,theme='light'}={}){
 const ctx=await browser.newContext({viewport:{width,height:850},colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block'}),page=await ctx.newPage(),errors=[],unknown=[];
 page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.violations=[];window.rejections=[];document.addEventListener('securitypolicyviolation',e=>violations.push(e.violatedDirective+' '+e.blockedURI));addEventListener('unhandledrejection',e=>rejections.push(String(e.reason)));});
 await ctx.route('**/*',route=>{
  const url=new URL(route.request().url()),path=url.pathname;if(url.origin!==ORIGIN){unknown.push(url.href);return route.abort();}
  if(path==='/')return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':CSP},body:'<!doctype html><html data-theme="'+theme+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/roof/workspace-activity.css"><script type="module" src="/fixture.js"></script></head><body><main><button id="launch">Open Activity</button><p id="ready"></p></main></body></html>'});
  if(path==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:fixture});
  if(path==='/favicon.ico')return route.fulfill({status:204,body:''});
  const file=resolve(PUBLIC,'.'+path);if(!file.startsWith(PUBLIC+'/')||!existsSync(file)){unknown.push(path);return route.fulfill({status:404,body:'Unexpected Activity asset'});}
  return route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream',body:readFileSync(file)});
 });
 await page.goto(ORIGIN);await page.getByText('Ready',{exact:true}).waitFor();await page.getByRole('button',{name:'Open Activity',exact:true}).click();
 const sheet=page.getByRole('dialog',{name:'Activity',exact:true});await sheet.waitFor();
 return{ctx,page,sheet,clean:async()=>{assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);assert.deepEqual(await page.evaluate(()=>[violations,rejections]),[[],[]]);}};
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
