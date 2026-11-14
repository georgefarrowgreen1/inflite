// Actual Frame, loader and recovery sheet; only native module/domain bodies are
// fixtures. Retry uses the real import retry path and preserves singleton nodes.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync,existsSync}=require('node:fs'),{resolve,extname}=require('node:path');
const {chromium,webkit}=require('playwright');
const PUBLIC=resolve(__dirname,'../today/public'),ORIGIN='http://recovery.ifl.test';
const CSP=/Content-Security-Policy: (.*)/.exec(readFileSync(resolve(PUBLIC,'_headers'),'utf8'))[1];
let browser;
before(async()=>{browser=process.env.WEB_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']})});
after(async()=>browser?.close());
const fixture=`
import {createFrame} from '/roof/frame.js';
import {createWorkspaceRecovery} from '/roof/workspace-recovery.js';
import {createWorkspaceRecoveryView} from '/roof/workspace-recovery-view.js';
const T=window.T={user:{id:'ann'},stats:{fitness:{mounts:0,unmounts:0},weather:{mounts:0,unmounts:0}},calls:[],toasts:[],activity:[],errors:[],hold:null};
const byId=id=>document.getElementById(id);
const F=T.F=createFrame({root:byId('in'),header:byId('hd'),views:byId('views'),tabs:byId('tabs'),session:()=>({view:{user:T.user,apps:{mail:true}},hub:true,apps:{fitness:true,weather:true,markets:true,chats:true,mail:true}}),today:{el:byId('today'),title:'Today'}});
F.toast=text=>T.toasts.push(text);
const recovery=T.recovery=createWorkspaceRecovery(F,{getHandle:app=>F.view(app),activity:{put:(id,value)=>T.activity.push({id,status:value.status})},retry:async(app,lease)=>{
 T.calls.push(app);const at=F.route;if(T.hold)await T.hold;
 if(!lease.current()||F.route!==at)return{ok:false,cancelled:true};
 const instance=await recovery.load(app,()=>F.view(app).load(),lease);
 if(!instance||!lease.current()||F.route!==at)return{ok:false,cancelled:true};
 F.nav.go('/'+app+'/',{replace:true,kind:'section'});return{ok:true};
}});
T.view=createWorkspaceRecoveryView(F,recovery);
byId('recover').addEventListener('click',()=>T.view.open());
T.boot=async()=>{await recovery.load('weather',()=>F.view('weather').load());F.nav.go('/weather/',{kind:'section'});await recovery.load('fitness',()=>F.view('fitness').load());T.ready=true};
T.boot();
`;
function moduleFixture(app){return`export const CONTRACT=1,BUILD='recovery-test';export async function mount(root,fw){const s=window.T.stats.${app};s.mounts++;const input=fw.ui.el('input',{'aria-label':'${app} draft'});root.append(input);return{show(){fw.header.set({title:'${app}'});},hide(){},busy:()=>!!input.value,flush:async()=>({lost:0}),unmount(){s.unmounts++;root.replaceChildren()}}}`}
async function open(width=1440,options={}){
 const ctx=await browser.newContext({viewport:{width,height:840},serviceWorkers:'block',reducedMotion:'reduce',colorScheme:options.theme||'light'}),errors=[],unknown=[];let attempts=0,cssRequests=0,releaseCSS;const cssWait=options.deferCSS?new Promise(resolve=>releaseCSS=resolve):Promise.resolve();
 await ctx.route('**/*',async route=>{
  const u=new URL(route.request().url()),path=u.pathname;
  if(u.origin!==ORIGIN){unknown.push(u.href);return route.abort()}
  if(path==='/')return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':CSP},body:'<!doctype html><html lang="en" data-theme="'+(options.theme||'light')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><script type="module" src="/fixture.js"></script></head><body><div id="in"><header id="hd"></header><div id="views"><main id="today"><button id="recover" type="button">Connection &amp; recovery</button></main></div><nav id="tabs"></nav></div></body></html>'});
  if(path==='/roof/workspace-recovery.css'){cssRequests++;await cssWait;if(cssRequests<=(options.failCSS||0))return route.fulfill({status:503,contentType:'text/css',body:''});}
  if(path==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:fixture});
  const app=/^\/(fitness|weather)\/roof\/\1\.js$/.exec(path)?.[1];
  if(app){if(app==='fitness'&&attempts++===0)return route.fulfill({status:503,contentType:'text/javascript',body:'Temporarily unavailable'});return route.fulfill({contentType:'text/javascript',body:moduleFixture(app)})}
  if(/^\/(fitness|weather|markets|chats|mail)\/roof\/connector\.js$/.test(path))return route.fulfill({contentType:'text/javascript',body:'export const connector={files:[],lazy:[]};'});
  if(/^\/(fitness|weather)\/version$/.test(path))return route.fulfill({json:{build:'recovery-test'}});
  if(/^\/(fitness|weather)\/.+\.css$/.test(path))return route.fulfill({contentType:'text/css',body:''});
  const f=resolve(PUBLIC,'.'+path);if(!f.startsWith(PUBLIC+'/')||!existsSync(f)){unknown.push(path);return route.fulfill({status:404,body:''})}
  return route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extname(f)]||'application/octet-stream',body:readFileSync(f)});
 });
 const page=await ctx.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.__csp=[];window.__rejected=[];document.addEventListener('securitypolicyviolation',event=>__csp.push(event.violatedDirective+' '+event.blockedURI));addEventListener('unhandledrejection',event=>__rejected.push(String(event.reason)))});
 await page.goto(ORIGIN,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>T.ready);
 if(!options.deferCSS&&!options.failCSS)await page.waitForFunction(()=>document.querySelector('link[href="/roof/workspace-recovery.css"]')?.dataset.loaded);
 return{ctx,page,releaseCSS:()=>releaseCSS?.(),cssRequests:()=>cssRequests,clean:async()=>{assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);assert.deepEqual(await page.evaluate(()=>[__csp,__rejected]),[[],[]])}};
}
test('a failed native import retries while another app keeps its exact unsent draft and singleton',async()=>{
 const t=await open();try{
  const weather=t.page.getByRole('textbox',{name:'weather draft',exact:true});await weather.fill('Unsent weather note');
  await t.page.evaluate(()=>{T.weatherNode=document.querySelector('[aria-label="weather draft"]');T.view.open()});
  await t.page.getByRole('button',{name:'Try again Fitness',exact:true}).click();
  const fitness=t.page.getByRole('textbox',{name:'fitness draft',exact:true});await fitness.fill('Keep this ride draft');
  assert.equal(await t.page.locator('dialog[data-sheet=workspace-recovery][open]').count(),0);
  await t.page.evaluate(()=>{T.fitnessNode=document.querySelector('[aria-label="fitness draft"]');T.recovery.update('fitness','error');T.view.open()});
  await t.page.getByRole('button',{name:'Try again Fitness',exact:true}).click();await fitness.waitFor();
  assert.equal(await fitness.inputValue(),'Keep this ride draft');
  assert.equal(await t.page.evaluate(()=>T.fitnessNode===document.querySelector('[aria-label="fitness draft"]')&&T.weatherNode.value==='Unsent weather note'),true);
  assert.deepEqual(await t.page.evaluate(()=>T.stats),{fitness:{mounts:1,unmounts:0},weather:{mounts:1,unmounts:0}});await t.clean();
 }finally{await t.ctx.close()}
});
test('offline recovery stays honest, keeps editable drafts and never retries automatically after reconnect',async()=>{
 const t=await open(320);try{
  const draft=t.page.getByRole('textbox',{name:'weather draft',exact:true});await draft.fill('Offline draft');
  await t.ctx.setOffline(true);await t.page.evaluate(()=>T.view.open());
  await t.page.getByRole('status').filter({hasText:'You’re offline'}).waitFor();
  assert.equal(await t.page.getByRole('button',{name:'Resume Weather',exact:true}).isEnabled(),false);
  assert.equal(await t.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await t.page.locator('dialog[data-sheet=workspace-recovery] [data-close]').click();await draft.fill('Edited while offline');
  await t.ctx.setOffline(false);await t.page.waitForFunction(()=>T.recovery.snapshot().online);assert.equal(await t.page.evaluate(()=>T.calls.length),0);
  await t.page.evaluate(()=>T.view.open());await t.page.getByRole('button',{name:'Resume Weather',exact:true}).click();
  assert.equal(await draft.inputValue(),'Edited while offline');assert.equal(await t.page.evaluate(()=>T.stats.weather.mounts),1);await t.clean();
 }finally{await t.ctx.close()}
});
test('a delayed recovery cannot navigate after the user moves elsewhere or replaces the account',async()=>{
 const t=await open();try{
  await t.page.evaluate(()=>{T.hold=new Promise(resolve=>T.release=resolve);T.view.open()});
  await t.page.getByRole('button',{name:'Resume Weather',exact:true}).click();
  await t.page.evaluate(()=>{T.F.nav.go('/',{kind:'section'});T.release()});
  await t.page.waitForFunction(()=>!T.recovery.snapshot().apps.find(a=>a.app==='weather').pending);
  assert.equal(new URL(t.page.url()).pathname,'/');assert.equal(await t.page.evaluate(()=>T.activity.at(-1).status),'cancelled');
  await t.page.evaluate(()=>{T.hold=new Promise(resolve=>T.release=resolve);T.view.open()});
  await t.page.getByRole('button',{name:'Resume Weather',exact:true}).click();
  await t.page.evaluate(()=>{T.user={id:'beth'};T.F.destroy();T.release()});
  assert.equal(await t.page.locator('dialog[open]').count(),0);assert.deepEqual(await t.page.evaluate(()=>T.recovery.snapshot().apps),[]);await t.clean();
 }finally{await t.ctx.close()}
});

for(const [width,theme] of [[320,'dark'],[1440,'light']])test(`Recovery loads its own CSS and aligns every app row ${width}/${theme}`,async()=>{
 const t=await open(width,{theme});try{
  assert.equal(t.cssRequests(),1,'the production view primes its stylesheet without fixture injection');
  assert.equal(await t.page.locator('dialog[open]').count(),0,'priming does not open a sheet');
  await t.page.evaluate(()=>T.view.open());await t.page.getByText('Your apps and drafts stay in place.',{exact:true}).waitFor();
  await t.page.getByRole('button',{name:'Open Markets',exact:true}).waitFor();
  assert.equal(await t.page.getByText('Ready to continue',{exact:true}).count(),1);
  const geometry=await t.page.locator('.ws-recovery-list').evaluate(list=>({style:getComputedStyle(list).listStyleType,display:getComputedStyle(list).display,overflow:document.documentElement.scrollWidth>innerWidth+1,rows:[...list.children].map(row=>{const img=row.querySelector('img'),copy=row.querySelector('div'),button=row.querySelector('button'),r=row.getBoundingClientRect(),i=img.getBoundingClientRect(),c=copy.getBoundingClientRect(),b=button.getBoundingClientRect();return{source:img.getAttribute('src'),loaded:img.complete&&img.naturalWidth>0,width:i.width,height:i.height,radius:parseFloat(getComputedStyle(row).borderRadius),gap:c.left-i.right,buttonGap:b.left-c.right,inside:r.left>=0&&r.right<=innerWidth&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom,center:Math.abs((i.top+i.bottom-b.top-b.bottom)/2)}})}));
  assert.equal(geometry.style,'none');assert.equal(geometry.display,'grid');assert.equal(geometry.overflow,false);assert.equal(geometry.rows.length,5);
  assert.deepEqual(geometry.rows.map(row=>row.source),['/apps/fitness.svg','/apps/weather.svg','/apps/markets.svg','/apps/chat.svg','/apps/mail.svg']);
  for(const row of geometry.rows){assert.equal(row.loaded,true);assert.equal(row.width,36);assert.equal(row.height,36);assert.ok(row.radius>=16);assert.ok(row.gap>=8);assert.ok(row.buttonGap>=8);assert.equal(row.inside,true);assert.ok(row.center<1);}
  assert.equal(t.cssRequests(),1);await t.clean();
 }finally{await t.ctx.close()}
});
test('delayed Recovery CSS cannot open after route, account or explicit close changes',async()=>{
 for(const change of ['route','owner','close','abort']){const t=await open(320,{deferCSS:true});try{
  await t.page.evaluate(()=>{T.pendingOpen=T.view.open()});
  assert.equal(await t.page.locator('dialog[open]').count(),0,'no unstyled sheet before CSS');
  await t.page.evaluate(change=>{if(change==='route')T.F.nav.go('/',{kind:'section'});if(change==='owner')T.user={id:'beth'};if(change==='close')T.view.close();if(change==='abort')T.F.destroy();},change);
  t.releaseCSS();assert.equal(await t.page.evaluate(()=>T.pendingOpen),false);assert.equal(await t.page.locator('dialog[open]').count(),0);assert.equal(await t.page.evaluate(()=>T.toasts.length),0);await t.clean();
 }finally{t.releaseCSS();await t.ctx.close()}}
});
test('a failed Recovery stylesheet stays closed, reports honestly and can be retried',async()=>{
 const t=await open(320,{deferCSS:true,failCSS:1});try{
  await t.page.evaluate(()=>{T.pendingOpen=T.view.open()});t.releaseCSS();
  assert.equal(await t.page.evaluate(()=>T.pendingOpen),false);assert.equal(await t.page.locator('dialog[open]').count(),0);
  assert.deepEqual(await t.page.evaluate(()=>T.toasts),['Recovery couldn’t load. Try again.']);
  await t.page.evaluate(()=>T.view.open());await t.page.locator('dialog[data-sheet=workspace-recovery][open]').waitFor();assert.equal(t.cssRequests(),2);await t.clean();
 }finally{t.releaseCSS();await t.ctx.close()}
});
