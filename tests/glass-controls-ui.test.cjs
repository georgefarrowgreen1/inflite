// The real early Appearance runtime and shared materials, with an isolated
// account transport. Account form keyboard/save behavior is covered by Apps'
// appearance-ui suite; these checks exercise the Root's public runtime contract.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{resolve,extname}=require('node:path');
const {chromium,webkit}=require('playwright');
const PUBLIC=resolve(__dirname,'../today/public'),ORIGIN='https://inflite.ai',KEY='inflite:appearance:v1';
let browser;
before(async()=>{browser=process.env.WEB_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']})});
after(async()=>browser?.close());
const fixture=`import * as ui from '/roof/ui.js';import {createSheets} from '/roof/sheet.js';
const el=ui.el,T=window.T={clicks:0,clickDefaults:[]};
const ac=new AbortController(),sheets=createSheets({ui,signal:ac.signal});T.sheet=()=>T.handle=sheets.open({sheet:'glass-controls-test',title:'Glass controls sheet',body:el('p',{class:'ifl-sub',text:'Readable floating material'})});
const action=ui.btn('Neutral glass action',{run(){T.clicks++}}),primary=ui.btn('Primary action',{primary:true,run(){}});
const card=ui.card({title:'Glass preference fixture',body:[el('p',{class:'ifl-sub',text:'Supporting text retains its palette.'}),ui.field({label:'Private draft',value:'Keep this private draft'}),action,primary]});
card.id='glass-card';action.id='glass-action';primary.id='primary-action';document.querySelector('main').append(card);T.card=card;T.action=action;
document.addEventListener('click',event=>T.clickDefaults.push(event.defaultPrevented));T.ready=true;`;
const layout='html,body{margin:0;min-height:100%;}main{min-height:150vh;padding:100px 24px;}#glass-card{max-width:480px;min-height:240px;padding:24px;}#glass-card .ifl-field{margin:20px 0;}#glass-card .ifl-btn{margin:8px;}';
async function open({cached,blocked=false,touch=false,motion='no-preference',preferences={}}={}){
 const ctx=await browser.newContext({viewport:{width:touch?390:1100,height:900},isMobile:touch,hasTouch:touch,colorScheme:'light',reducedMotion:motion,serviceWorkers:'block'}),errors=[],writes=[];
 await ctx.addInitScript(({cached,blocked,key,preferences})=>{
  if(cached&&localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify(cached));
  if(blocked){Storage.prototype.getItem=()=>{throw Error('Storage unavailable')};Storage.prototype.setItem=()=>{throw Error('Storage unavailable')}}
  // WebKit has no native reduced-transparency emulation. Override only this
  // browser preference boundary; all runtime listeners/cleanup remain real.
  const original=window.matchMedia.bind(window),queries=[],state={...preferences};
  window.matchMedia=query=>{const m=original(query),feature=['prefers-reduced-transparency','prefers-contrast'].find(f=>query.includes(f));if(!feature)return m;
   Object.defineProperty(m,'matches',{get:()=>Object.hasOwn(state,feature)?state[feature]:original(query).matches});queries.push({m,feature});return m};
  window.__glassPreference=(feature,on)=>{state[feature]=on;for(const {m,feature:f}of queries)if(f===feature){const e=new Event('change');Object.defineProperties(e,{matches:{value:m.matches},media:{value:m.media}});m.dispatchEvent(e)}};
 },{cached,blocked,key:KEY,preferences});
 await ctx.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.origin!==ORIGIN)return route.abort();
  if(!['GET','HEAD'].includes(route.request().method()))writes.push({path:u.pathname,method:route.request().method()});
  if(u.pathname==='/account/api/account/appearance')return route.fulfill({json:{signedIn:false}});
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/theme.js"></script><script src="/capture-glass.js"></script><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/roof/controls.css"><link rel="stylesheet" href="/glass-fixture.css"></head><body><main></main><script type="module" src="/glass-fixture.js"></script></body></html>'});
  if(u.pathname==='/capture-glass.js')return route.fulfill({contentType:'text/javascript',body:'window.firstGlass={snapshot:InFliteAppearance.snapshot(),mode:document.documentElement.dataset.glass,strength:document.documentElement.style.getPropertyValue("--ifl-glass-strength")};'});
  if(u.pathname==='/glass-fixture.js')return route.fulfill({contentType:'text/javascript',body:fixture});
  if(u.pathname==='/glass-fixture.css')return route.fulfill({contentType:'text/css',body:layout});
  try{const file=resolve(PUBLIC,'.'+u.pathname);if(!file.startsWith(PUBLIC+'/'))return route.abort();return route.fulfill({contentType:{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[extname(file)]||'application/octet-stream',body:readFileSync(file)})}catch{return route.fulfill({status:404,body:''})}
 });
 const page=await ctx.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));await page.goto(ORIGIN);await page.waitForFunction(()=>window.T?.ready);await frames(page);
 return{ctx,page,errors,writes};
}
async function frames(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))}
async function cached(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY)}
async function glass(page){return page.evaluate(()=>InFliteAppearance.snapshot())}
async function noPointer(page){await frames(page);assert.equal(await page.locator('[data-ifl-pointer]').count(),0,'no surface retains pointer state');assert.equal(await page.locator('[style*="--ifl-pointer-"]').count(),0,'local pointer coordinates are removed')}
async function hoverCard(page,x=40,y=30){const box=await page.locator('#glass-card').boundingBox();await page.mouse.move(box.x+x,box.y+y);await frames(page)}
async function finish(t){assert.deepEqual(t.errors,[]);assert.deepEqual(t.writes,[],'Appearance runtime never writes account preferences');await t.ctx.close()}

test('cached glass preferences and legacy defaults apply before the first page script',async()=>{
 for(const prefs of [{appearance:'dark',palette:'iris',id:'ann',glass:false,glassStrength:28},{appearance:'light',palette:'coast',id:'ann',glass:true,glassStrength:92},{appearance:'auto',palette:'inflite'}]){
  const t=await open({cached:prefs});try{const first=await t.page.evaluate(()=>firstGlass);assert.equal(first.snapshot.glass,prefs.glass??true);assert.equal(first.snapshot.glassStrength,prefs.glassStrength??70);assert.equal(first.mode,(prefs.glass??true)?'on':'off');assert.equal(parseFloat(first.strength),prefs.glass===false?0:(prefs.glassStrength??70)/100);if(prefs.glass===false){await t.page.evaluate(()=>T.sheet());assert.equal(await t.page.locator('dialog.ifl-sheet').evaluate(n=>getComputedStyle(n).backdropFilter||getComputedStyle(n).webkitBackdropFilter||'none'),'none','master off removes floating backdrop filtering');await t.page.evaluate(()=>T.handle.now())}assert.equal(await t.page.getByRole('textbox',{name:'Private draft'}).inputValue(),'Keep this private draft');await finish(t)}finally{await t.ctx.close()}
 }
});

test('glass previews leave the committed cache intact, cancel restores it and commits survive reload',async()=>{
 const t=await open({cached:{appearance:'light',palette:'coast',id:'ann',glass:true,glassStrength:70}});try{
  const saved=await cached(t.page),input=t.page.getByRole('textbox',{name:'Private draft'});await input.fill('Retain my focused draft');await input.focus();
  await t.page.evaluate(()=>InFliteAppearance.setGlass({glassStrength:18},{preview:true}));assert.deepEqual(await cached(t.page),saved);assert.equal(await t.page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ifl-glass-strength'))),.18);assert.equal(await input.evaluate(n=>n===document.activeElement),true);
  await t.page.evaluate(()=>InFliteAppearance.cancelGlassPreview());assert.equal((await glass(t.page)).glassStrength,70);assert.deepEqual(await cached(t.page),saved);
  await t.page.evaluate(()=>{InFliteAppearance.setGlass({glassStrength:84},{preview:true});InFliteAppearance.setGlass({glassStrength:84})});assert.equal((await cached(t.page)).glassStrength,84);
  await t.page.evaluate(()=>InFliteAppearance.setGlass({glass:false}));assert.equal((await cached(t.page)).glass,false);assert.equal((await cached(t.page)).glassStrength,84);assert.equal(await input.inputValue(),'Retain my focused draft');
  await t.page.reload();await t.page.waitForFunction(()=>window.T?.ready);assert.equal((await glass(t.page)).glass,false);assert.equal((await glass(t.page)).glassStrength,84);await finish(t);
 }finally{await t.ctx.close()}
});

test('omitted glass fields preserve the current owner while a different owner starts from defaults',async()=>{
 const t=await open({cached:{appearance:'light',palette:'coast',id:'ann',glass:false,glassStrength:31}});try{
  await t.page.evaluate(()=>InFliteAppearance.accept({appearance:'dark',palette:'rose',id:'ann'}));let p=await glass(t.page);assert.equal(p.glass,false);assert.equal(p.glassStrength,31);
  await t.page.evaluate(()=>InFliteAppearance.accept({appearance:'light',palette:'iris'}));p=await glass(t.page);assert.equal(p.id,'ann');assert.equal(p.glass,false);assert.equal(p.glassStrength,31);
  await t.page.evaluate(()=>InFliteAppearance.accept({appearance:'dark',palette:'ember',id:'ben'}));p=await glass(t.page);assert.equal(p.id,'ben');assert.equal(p.glass,true);assert.equal(p.glassStrength,70);assert.equal((await cached(t.page)).id,'ben');await finish(t);
 }finally{await t.ctx.close()}
});

test('pointer light follows one neutral surface, bounds frame work and leaves clicks and draft input native',async()=>{
 const t=await open();try{
  await hoverCard(t.page);const first=await t.page.locator('#glass-card').evaluate(n=>({x:n.style.getPropertyValue('--ifl-pointer-x'),y:n.style.getPropertyValue('--ifl-pointer-y'),image:getComputedStyle(n).backgroundImage}));assert.equal(await t.page.locator('[data-ifl-pointer]').count(),1);assert.ok(Number.isFinite(parseFloat(first.x))&&Number.isFinite(parseFloat(first.y)));
  await hoverCard(t.page,150,60);const next=await t.page.locator('#glass-card').evaluate(n=>({x:n.style.getPropertyValue('--ifl-pointer-x'),y:n.style.getPropertyValue('--ifl-pointer-y'),image:getComputedStyle(n).backgroundImage}));assert.notDeepEqual(next,first,'light position follows the pointer');assert.notEqual(first.image,'none','pointer light is rendered');assert.notEqual(next.image,first.image,'the rendered gradient resolves the local pointer coordinates');
  const burst=await t.page.evaluate(async()=>{const n=T.card,r=n.getBoundingClientRect(),original=CSSStyleDeclaration.prototype.setProperty;let writes=0;CSSStyleDeclaration.prototype.setProperty=function(k,...args){if(k==='--ifl-pointer-x'||k==='--ifl-pointer-y')writes++;return original.call(this,k,...args)};try{for(let i=0;i<120;i++)n.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:r.x+30+i,clientY:r.y+30}));const immediate=writes;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return{immediate,writes,active:document.querySelectorAll('[data-ifl-pointer]').length}}finally{CSSStyleDeclaration.prototype.setProperty=original}});
  assert.equal(burst.immediate,0,'moves are coalesced until a frame');assert.ok(burst.writes<=4,'one bounded x/y update per frame: '+JSON.stringify(burst));assert.equal(burst.active,1);
  await t.page.getByRole('button',{name:'Neutral glass action',exact:true}).click();assert.equal(await t.page.evaluate(()=>T.clicks),1);assert.deepEqual(await t.page.evaluate(()=>T.clickDefaults),[false]);
  const input=t.page.getByRole('textbox',{name:'Private draft'});await input.fill('Pointer light cannot replace this draft');assert.equal(await input.inputValue(),'Pointer light cannot replace this draft');
  await t.page.mouse.move(1,1);await noPointer(t.page);await finish(t);
 }finally{await t.ctx.close()}
});

test('master off, zero intensity and live accessibility preferences clear pointer light immediately',async()=>{
 const t=await open();try{
  for(const preference of ['glass','strength','motion','prefers-reduced-transparency','prefers-contrast','forced-colors']){
   await hoverCard(t.page);assert.equal(await t.page.locator('[data-ifl-pointer]').count(),1,preference+' starts with one active surface');
   if(preference==='glass')await t.page.evaluate(()=>InFliteAppearance.setGlass({glass:false}));else if(preference==='strength')await t.page.evaluate(()=>InFliteAppearance.setGlass({glassStrength:0}));else if(preference==='motion')await t.page.emulateMedia({reducedMotion:'reduce'});else if(preference==='forced-colors')await t.page.emulateMedia({forcedColors:'active'});else await t.page.evaluate(name=>__glassPreference(name,true),preference);
   await noPointer(t.page);await hoverCard(t.page,100,35);await noPointer(t.page);
   if(preference==='glass')await t.page.evaluate(()=>InFliteAppearance.setGlass({glass:true}));else if(preference==='strength')await t.page.evaluate(()=>InFliteAppearance.setGlass({glassStrength:70}));else if(preference==='motion')await t.page.emulateMedia({reducedMotion:'no-preference'});else if(preference==='forced-colors')await t.page.emulateMedia({forcedColors:'none'});else await t.page.evaluate(name=>__glassPreference(name,false),preference);
   await t.page.mouse.move(1,1);
  }
  await hoverCard(t.page);await t.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});await noPointer(t.page);await finish(t);
 }finally{await t.ctx.close()}
});

test('coarse touch has no sticky pointer light and a tap still activates the native button once',async()=>{
 const t=await open({touch:true});try{
  assert.equal(await t.page.evaluate(()=>matchMedia('(pointer: coarse)').matches),true);const action=t.page.getByRole('button',{name:'Neutral glass action',exact:true}),box=await action.boundingBox();await t.page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await noPointer(t.page);assert.equal(await t.page.evaluate(()=>T.clicks),1);assert.deepEqual(await t.page.evaluate(()=>T.clickDefaults),[false]);
  await t.page.evaluate(()=>{T.sheet();document.querySelector('dialog[open]').focus()});
  const sheet=t.page.getByRole('dialog',{name:'Glass controls sheet'});
  assert.deepEqual(await sheet.evaluate(el=>[el===document.activeElement,getComputedStyle(el).outlineStyle]),[true,'none']);
  await finish(t);
 }finally{await t.ctx.close()}
});

test('glass controls remain usable when preference storage is blocked',async()=>{
 const t=await open({blocked:true});try{await t.page.evaluate(()=>{InFliteAppearance.setGlass({glassStrength:43},{preview:true});InFliteAppearance.cancelGlassPreview();InFliteAppearance.setGlass({glass:false})});assert.equal((await glass(t.page)).glass,false);assert.equal((await glass(t.page)).glassStrength,70);assert.ok(await t.page.getByRole('button',{name:'Neutral glass action',exact:true}).isVisible());await finish(t)}finally{await t.ctx.close()}
});

// Shared storage is already committed by the sending page. A receiver must
// apply that value without writing it back and racing a later user commit.
test('two same-owner pages apply storage changes without echoing writes back',async()=>{
 const t=await open({cached:{appearance:'light',palette:'coast',id:'ann',glass:true,glassStrength:70}});try{
  const other=await t.ctx.newPage();other.setDefaultTimeout(6000);other.on('pageerror',e=>t.errors.push(e.message));await other.goto(ORIGIN);await other.waitForFunction(()=>window.T?.ready);await frames(other);
  for(const page of [t.page,other])await page.evaluate(key=>{const original=Storage.prototype.setItem;window.__glassCacheWrites=[];Storage.prototype.setItem=function(name,value){if(this===localStorage&&name===key)window.__glassCacheWrites.push(JSON.parse(value));return original.call(this,name,value)}},KEY);
  await t.page.evaluate(()=>InFliteAppearance.setGlass({glassStrength:61}));await other.waitForFunction(()=>InFliteAppearance.snapshot().glassStrength===61);
  assert.equal((await glass(other)).id,'ann');assert.equal(await t.page.evaluate(()=>__glassCacheWrites.length),1,'the initiating page persists its change once');assert.equal(await other.evaluate(()=>__glassCacheWrites.length),0,'the receiving page never echoes the incoming storage value');
  await other.evaluate(()=>InFliteAppearance.setGlass({glassStrength:64}));await t.page.waitForFunction(()=>InFliteAppearance.snapshot().glassStrength===64);
  assert.equal(await other.evaluate(()=>__glassCacheWrites.length),1,'the second user commit persists once');assert.equal(await t.page.evaluate(()=>__glassCacheWrites.length),1,'the first page never echoes the newer incoming value');
  assert.equal((await cached(t.page)).glassStrength,64);assert.equal((await cached(other)).glassStrength,64);assert.equal((await glass(t.page)).glassStrength,64);assert.equal((await glass(other)).glassStrength,64);await finish(t);
 }finally{await t.ctx.close()}
});
