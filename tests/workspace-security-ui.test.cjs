// Independent host/controller lifecycle checks. Real frame, sheets, routing and
// workspace controller; tiny cooperative module fixtures expose asynchronous
// ownership without relying on a particular domain editor implementation.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,existsSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {chromium,webkit}=require('playwright');
const PUBLIC=resolve(__dirname,'../today/public'),ORIGIN='http://os.test';
let browser;
before(async()=>{browser=process.env.WEB_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});});
after(async()=>browser?.close());
function moduleFixture(app){return `export const CONTRACT=1,BUILD='workspace-security';export async function mount(root,fw){
 const s=window.audit;s.mounts.${app}++;root.replaceChildren(fw.ui.el('p',{text:'${app} account view'}));let off=()=>{},provided=false;
 return {workspace(){if(!fw.workspace||provided)return;provided=true;s.capabilities.${app}=fw.workspace;off=fw.workspace.provide({snapshot(){if(s.loadingApp==='${app}')return{status:'loading',files:[],actions:[]};if(s.delaySnapshot==='${app}')return s.wait.then(()=>({status:'ready',files:[{id:'route-current',app:'fitness',name:'Private route.gpx',objectId:'route-current',mime:'application/gpx+xml',intent:'view-route',downloadIntent:'export-route'}],actions:[{id:'inspect',label:'Inspect app',enabled:true}]}));return{status:'ready',files:'${app}'==='fitness'?[{id:'route-current',app:'fitness',name:'Private route.gpx',objectId:'route-current',mime:'application/gpx+xml',intent:'view-route',downloadIntent:'export-route'}]:[],actions:[{id:'inspect',label:'Inspect app',enabled:true}]}},async run(intent){s.runs.push({app:'${app}',intent,context:fw.workspace.context.get()});if(s.failRun){await s.wait;throw new Error('Fixture action failed')}return{ok:true}}});},
 async show(){this.workspace();if(s.delayShow==='${app}'){s.waitingShows++;await s.wait}},hide(){},flush(){return s.delayFlush==='${app}'?s.wait.then(()=>({lost:0})):Promise.resolve({lost:0})},unmount(){off();s.unmounts.${app}++;}};
}`;}
async function open(){
 const ctx=await browser.newContext({viewport:{width:1440,height:940},reducedMotion:'reduce',serviceWorkers:'block'}),unknown=[];
 let workspaceCloud={revision:0,state:null,updatedAt:0};await ctx.route('**/*',r=>{const u=new URL(r.request().url()),p=u.pathname;if(u.origin!==ORIGIN){unknown.push(u.href);return r.abort()}
  if(p==='/api/workspaces'){const req=r.request();if(req.method()==='PUT'){const body=req.postDataJSON();if(body.revision!==workspaceCloud.revision)return r.fulfill({status:409,json:{error:'Conflict',...workspaceCloud}});workspaceCloud={revision:workspaceCloud.revision+1,state:body.state,updatedAt:Date.now()};}return r.fulfill({json:workspaceCloud});}if(p==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"></head><body><div id="in"><header id="hd"></header><div id="views"><main id="today">Today</main><main id="workspace" hidden></main></div><nav id="tabs"></nav></div></body></html>'});
  if(p==='/api/files/list')return r.fulfill({json:{folder:null,ancestors:[],items:[],cursor:null,revision:1,usage:{used:0,reserved:0,limit:1073741824,nodes:0,nodeLimit:5000,fileLimit:26214400}}});
  if(p==='/api/organise/preferences')return r.fulfill({json:{prefs:{hidden:[],version:0}}});if(p==='/api/organise/calendar-events')return r.fulfill({json:{events:[],warnings:[],calendars:[]}});if(p==='/api/organise/list')return r.fulfill({json:{records:[],cursor:null}});if(p.startsWith('/api/system/'))return r.fulfill({json:p.endsWith('/focus')?{dismissed:[]}:{actions:[],cursor:null,counts:{open:0,done:0}}});if(p==='/api/files/search')return r.fulfill({json:{items:[],folder:null,ancestors:[],revision:1,cursor:null,usage:{used:0,reserved:0,limit:1073741824,nodes:0,nodeLimit:5000,fileLimit:26214400}}});
  const app=/^\/(fitness|weather)\/roof\/\1\.js$/.exec(p)?.[1];if(app)return r.fulfill({contentType:'text/javascript',body:moduleFixture(app)});
  if(/^\/(fitness|weather)\/roof\/connector\.js$/.test(p))return r.fulfill({contentType:'text/javascript',body:'export const connector={files:[],lazy:[]};'});
  if(/^\/(fitness|weather)\/version$/.test(p))return r.fulfill({json:{build:'workspace-security'}});
  if(/^\/(fitness|weather)\/.+\.css$/.test(p))return r.fulfill({contentType:'text/css',body:'/* fixture */'});
  const f=resolve(PUBLIC,'.'+p);if(!f.startsWith(PUBLIC+'/')||!existsSync(f)){unknown.push(p);return r.fulfill({status:404,body:'Unexpected fixture resource'})}
  return r.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extname(f)]||'application/octet-stream',body:readFileSync(f)});
 });
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);await page.goto(ORIGIN);
 await page.evaluate(async()=>{
  const {createFrame}=await import('/roof/frame.js'),{createWorkspace}=await import('/roof/workspace.js'),byId=id=>document.getElementById(id);
  const s=window.audit={user:{id:'owner-a',name:'Owner A'},enabled:{fitness:true,weather:true},mounts:{fitness:0,weather:0},unmounts:{fitness:0,weather:0},runs:[],capabilities:{},waitingShows:0};
  s.wait=new Promise(r=>s.release=r);let ws;
  const F=s.F=createFrame({root:byId('in'),header:byId('hd'),views:byId('views'),tabs:byId('tabs'),session:()=>({view:{user:s.user},hub:true,apps:s.enabled}),hubAgain:async()=>{},today:{el:byId('today'),title:'Today'},workspace:{el:byId('workspace'),title:'Workspace',onShow:r=>ws?.show(r),onHide:()=>ws?.hide()}});
  s.nativeAway=F.tabs.away;s.toasts=[];const toast=F.toast;F.toast=(text,...rest)=>{s.toasts.push(text);return toast(text,...rest)};
  ws=s.ws=await createWorkspace(F,{root:byId('workspace'),today:byId('today'),dockRoot:byId('in')});F.nav.go('/weather/',{kind:'section'});
 });
 await page.waitForFunction(()=>audit.mounts.weather===1&&audit.capabilities.weather);
 await page.evaluate(()=>audit.F.nav.go('/fitness/',{kind:'section'}));
 await page.waitForFunction(()=>audit.mounts.fitness===1&&audit.mounts.weather===1&&audit.capabilities.fitness&&audit.capabilities.weather);
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await settle();
 return {ctx,page,settle,clean:async()=>{assert.deepEqual(errors,[]);assert.deepEqual(unknown,[])}};
}
async function routeDownload(page){
 await page.locator('.ifx-locations').getByRole('button',{name:'Fitness',exact:true}).click();
 await page.getByRole('button',{name:'Select Private route.gpx',exact:true}).click();
 await page.locator('.ifx-inspector').getByRole('button',{name:'Download',exact:true}).click();
}
test('a disabled app cannot reappear and re-enabling after disposal mounts one fresh owned view',async()=>{
 const {ctx,page,settle,clean}=await open();try{
  await page.evaluate(()=>{audit.oldWeather=audit.F.view('weather');audit.oldCapability=audit.capabilities.weather;audit.enabled.weather=false;audit.F.setRoof(undefined,audit.enabled)});
  await page.waitForFunction(()=>audit.oldWeather.signal.aborted);
  assert.equal(await page.locator('#m-weather').count(),0);
  await page.evaluate(()=>{audit.enabled.weather=true;audit.F.setRoof(undefined,audit.enabled);audit.F.nav.go('/weather/',{kind:'section'})});
  await page.waitForFunction(()=>audit.mounts.weather===2);await settle();
  const stale=await page.evaluate(async()=>{let reads=0,deliveries=0;const old=audit.oldCapability;old.provide({snapshot(){reads++;return{files:[{name:'Obsolete route.gpx'}]}},run(){audit.runs.push('obsolete')}});old.context.subscribe(()=>deliveries++);const update=old.context.update({location:{name:'Obsolete location',lat:52,lon:1}},{source:'weather:place'});audit.capabilities.fitness.context.update({location:{name:'New location',lat:53,lon:2}},{source:'fitness:weather-for-ride'});old.changed();await Promise.resolve();return{reads,deliveries,update,old:old.context.get()}});assert.deepEqual(stale,{reads:0,deliveries:0,update:false,old:{location:null,interval:null}});
  assert.deepEqual(await page.evaluate(()=>({weather:audit.mounts.weather,fitness:audit.mounts.fitness,connected:!audit.F.view('weather').el.hidden&&!audit.F.view('weather').signal.aborted,count:document.querySelectorAll('#m-weather').length})),{weather:2,fitness:1,connected:true,count:1});await clean();
 }finally{await ctx.close()}
});
test('a quick entitlement return preserves the same module while an older flush is outstanding',async()=>{
 const {ctx,page,settle,clean}=await open();try{
  await page.evaluate(()=>{audit.delayFlush='weather';audit.oldWeather=audit.F.view('weather');audit.enabled.weather=false;audit.F.setRoof(undefined,audit.enabled);audit.enabled.weather=true;audit.F.setRoof(undefined,audit.enabled);audit.F.nav.go('/weather/',{kind:'section'});audit.release()});await settle();
  assert.deepEqual(await page.evaluate(()=>({same:audit.oldWeather===audit.F.view('weather'),dead:audit.oldWeather.signal.aborted,mounts:audit.mounts.weather,visible:audit.F.view('weather').fw.visible()})),{same:true,dead:false,mounts:1,visible:true});
  await page.evaluate(()=>audit.F.search.open());await page.getByRole('combobox',{name:'Search everything'}).fill('inspect weather');await page.getByRole('option').filter({hasText:'Inspect app'}).click();await page.waitForFunction(()=>audit.runs.length===1);assert.equal(await page.evaluate(()=>audit.runs[0].app==='weather'&&audit.runs[0].intent==='inspect'),true,'idempotent adapter provider and its actions survive the entitlement round trip');await clean();
 }finally{await ctx.close()}
});
test('account disposal scrubs retired context and makes old providers and callbacks inert',async()=>{
 const {ctx,page,settle,clean}=await open();try{
  const result=await page.evaluate(async()=>{const cap=audit.capabilities.fitness;cap.context.update({location:{name:'Private start',lat:51.1,lon:-.2}},{source:'fitness:weather-for-ride'});audit.delaySnapshot='fitness';cap.changed();await Promise.resolve();audit.F.destroy();audit.user={id:'owner-b',name:'Owner B'};audit.release();await Promise.resolve();const old=cap.context.get();const update=cap.context.update({location:{name:'Wrong account',lat:52,lon:1}},{source:'fitness:weather-for-ride'});cap.provide({snapshot:()=>({files:[{name:'Old private route'}]}),run:()=>audit.runs.push('obsolete')});return{old,update,disposed:audit.F.signal.aborted,views:document.querySelectorAll('#m-fitness,#m-weather').length}});await settle();
  assert.deepEqual(result,{old:{location:null,interval:null},update:false,disposed:true,views:0});assert.equal(await page.locator('body').innerText().then(x=>x.includes('Old private route')),false);await clean();
 }finally{await ctx.close()}
});
test('an intent waiting for an app cannot run after replacement navigation',async()=>{
 const {ctx,page,settle,clean}=await open();try{
  await page.evaluate(()=>audit.F.nav.go('/#workspace',{kind:'section'}));await settle();
  await page.getByRole('button',{name:'Files',exact:true}).click();await page.evaluate(()=>{audit.delayShow='fitness'});
  await routeDownload(page);await page.waitForFunction(()=>audit.waitingShows>0);
  await page.evaluate(()=>{audit.F.nav.go('/weather/',{kind:'section'});audit.release()});await settle();
  assert.deepEqual(await page.evaluate(()=>audit.runs),[],'a route/file intent belongs to its initiating workspace episode');await clean();
 }finally{await ctx.close()}
});

test('Files can wake its owning app from Today and complete the requested action once ready',async()=>{
 const {ctx,page,settle,clean}=await open();try{
  await page.evaluate(()=>audit.F.nav.go('/#workspace',{kind:'section'}));await settle();
  await page.getByRole('button',{name:'Files',exact:true}).click();
  await routeDownload(page);
  await page.waitForFunction(()=>audit.runs.length===1);
  assert.deepEqual(await page.evaluate(()=>({intents:audit.runs.map(r=>r.intent),route:audit.F.route.app,active:audit.capabilities.fitness.active()})),{intents:['export-route'],route:'fitness',active:true});await clean();
 }finally{await ctx.close()}
});
test('returning home cancels a pending native action',async()=>{
 const {ctx,page,settle,clean}=await open();try{
  await page.evaluate(()=>audit.F.nav.go('/#workspace',{kind:'section'}));await settle();
  await page.getByRole('button',{name:'Files',exact:true}).click();await page.evaluate(()=>{audit.delayShow='fitness'});
  await routeDownload(page);await page.waitForFunction(()=>audit.waitingShows>0);
  await page.evaluate(()=>{audit.F.nav.go('/#workspace=ride',{replace:true,kind:'section'});audit.release()});await settle();
  assert.deepEqual(await page.evaluate(()=>audit.runs),[],'same workspace id does not make an older presentation current again');await clean();
 }finally{await ctx.close()}
});
test('a slow abandoned app presentation cannot overwrite the active full-app title',async()=>{
 const {ctx,page,settle,clean}=await open();try{
  await page.evaluate(()=>{audit.F.nav.go('/#workspace',{kind:'section'});audit.delayShow='fitness'});await settle();
  await page.getByRole('button',{name:'Files',exact:true}).click();
  await routeDownload(page);await page.waitForFunction(()=>audit.waitingShows>0);
  await page.evaluate(()=>{audit.F.nav.go('/weather/',{kind:'section'});audit.release()});await settle();
  assert.equal(await page.title(),'Weather — InFlite');assert.deepEqual(await page.evaluate(()=>audit.runs),[]);await clean();
 }finally{await ctx.close()}
});
test('account release keeps the restored title after an old app finally resolves',async()=>{
 const {ctx,page,settle,clean}=await open();try{
  await page.evaluate(()=>{audit.F.nav.go('/#workspace',{kind:'section'});audit.delayShow='fitness'});await settle();
  await page.getByRole('button',{name:'Files',exact:true}).click();
  await routeDownload(page);await page.waitForFunction(()=>audit.waitingShows>0);
  await page.evaluate(()=>{audit.F.destroy();audit.releasedTitle=document.title;audit.release()});await settle();
  assert.equal(await page.title(),await page.evaluate(()=>audit.releasedTitle));assert.deepEqual(await page.evaluate(()=>audit.runs),[]);await clean();
 }finally{await ctx.close()}
});

test('retired workspace context cannot relay locations between apps',async()=>{
 const {ctx,page,clean}=await open();try{
  const seen=await page.evaluate(()=>{const cap=audit.capabilities.fitness,seen=[];cap.context.subscribe(value=>{if(value.location?.name==='Original')cap.context.update({location:{name:'Replacement',lat:53,lon:2}},{source:'fitness:weather-for-ride'})});audit.capabilities.weather.context.subscribe(value=>seen.push(value.location?.name));cap.context.update({location:{name:'Original',lat:52,lon:1}},{source:'fitness:weather-for-ride'});return seen});
  assert.deepEqual(seen,[]);await clean();
 }finally{await ctx.close()}
});

test('search omits app actions that require the retired shared workspace context',async()=>{
 const {ctx,page,clean}=await open();try{
  await page.evaluate(()=>{audit.capabilities.fitness.provide({snapshot:()=>({status:'ready',files:[],actions:[{id:'weather-for-ride',label:'Weather at route start'},{id:'inspect',label:'Inspect route'}]}),run:()=>{throw Error('Retired context action')}});audit.F.search.open()});
  await page.getByRole('combobox',{name:'Search everything'}).fill('route');
  await page.getByRole('option').filter({hasText:'Inspect route'}).waitFor();
  assert.equal(await page.getByRole('option').filter({hasText:'Weather at route start'}).count(),0);await clean();
 }finally{await ctx.close()}
});
test('an action rejected after its app was left cannot toast in the new screen',async()=>{
 const {ctx,page,settle,clean}=await open();try{
  await page.evaluate(()=>{audit.failRun=true});await page.evaluate(()=>audit.F.search.open());await page.getByRole('combobox',{name:'Search everything'}).fill('inspect weather');await page.getByRole('option').filter({hasText:'Inspect app'}).click();await page.waitForFunction(()=>audit.runs.length===1);
  await page.evaluate(()=>{audit.F.nav.go('/#workspace',{kind:'section'});audit.release()});await settle();
  assert.deepEqual(await page.evaluate(()=>audit.toasts),[]);await clean();
 }finally{await ctx.close()}
});
test('the real native chrome policy controls the external OS dock and releases its wrapper on destroy',async()=>{
 const {ctx,page,settle,clean}=await open();try{
  await page.evaluate(()=>audit.F.nav.go('/weather/',{kind:'section'}));await settle();
  const state=await page.evaluate(()=>{audit.F.tabs.away(true);const hidden={dock:document.querySelector('.ws-dock').hidden,marked:document.documentElement.hasAttribute('data-os-dock-away'),external:document.querySelector('.ws-dock-host').parentElement.id};audit.F.tabs.away(false);const shown=!document.querySelector('.ws-dock').hidden&&!document.documentElement.hasAttribute('data-os-dock-away');audit.F.destroy();return{hidden,shown,restored:audit.F.tabs.away===audit.nativeAway,marked:document.documentElement.hasAttribute('data-os-dock-away'),dock:!!document.querySelector('.ws-dock')}});
  assert.deepEqual(state,{hidden:{dock:true,marked:true,external:'in'},shown:true,restored:true,marked:false,dock:false});await clean();
 }finally{await ctx.close()}
});
