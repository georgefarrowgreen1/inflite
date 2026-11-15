// Real startup script and framework CSS, with an isolated account transport.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{resolve}=require('node:path'),{chromium,webkit}=require('playwright');
const PUBLIC=resolve(__dirname,'../today/public');let browser;
before(async()=>{browser=process.env.WEB_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});});
after(async()=>browser?.close());
async function open({cached,blocked=false,hold=false}={}){
 const ctx=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light',reducedMotion:'reduce',serviceWorkers:'block'});
 await ctx.addInitScript(({cached,blocked})=>{if(cached)localStorage.setItem('inflite:appearance:v1',JSON.stringify(cached));if(blocked){Storage.prototype.getItem=()=>{throw new Error('Storage blocked')};Storage.prototype.setItem=()=>{throw new Error('Storage blocked')};}},{cached,blocked});
 const errors=[];let release,answer={signedIn:false};const gate=new Promise(r=>release=r);
 await ctx.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!=='https://inflite.ai')return route.abort();
  if(u.pathname==='/account/api/account/appearance'){if(hold)await gate;return route.fulfill({json:answer});}
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="theme-color" content="#fff"><script src="/theme.js"></script><script src="/capture.js"></script><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"></head><body><main><section class="ifl-card"><h1>Appearance</h1><p class="secondary">Your colours</p><input aria-label="Private draft" value="Keep this draft"><button class="ifl-btn primary" type="button">Continue</button></section></main></body></html>'});
  if(u.pathname==='/capture.js')return route.fulfill({contentType:'text/javascript',body:'window.firstTheme={palette:document.documentElement.dataset.palette,appearance:document.documentElement.dataset.theme,page:document.documentElement.style.getPropertyValue("--ifl-page")};'});
  try{return route.fulfill({contentType:u.pathname.endsWith('.js')?'text/javascript':'text/css',body:readFileSync(resolve(PUBLIC,'.'+u.pathname))});}catch{return route.fulfill({status:404,body:''});}
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://inflite.ai/');
 return{ctx,page,errors,reply:p=>{answer=p;release();}};
}
const luminance=c=>{const a=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('every theme has readable real CSS surfaces and actions, without replacing a draft',async()=>{
 const t=await open();try{
  const input=t.page.getByRole('textbox',{name:'Private draft'});await input.fill('Keep my unfinished message');
  await t.page.evaluate(()=>window.originalDraft=document.querySelector('input'));
  for(const palette of ['inflite','coast','iris','ember','rose','graphite'])for(const appearance of ['light','dark']){
   await t.page.evaluate(p=>InFliteAppearance.accept(p),{palette,appearance});
   // WebKit can retire inherited computed colours a frame after their parent.
   // Wait for the visible controls to settle, with a strict latency bound.
   await t.page.waitForFunction(({palette,appearance})=>{const p=InFliteAppearance.palettes[palette][appearance],rgb=hex=>'rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';return getComputedStyle(document.querySelector('h1')).color===rgb(p[3])&&getComputedStyle(document.querySelector('button')).color===rgb(p[7]);},{palette,appearance},{timeout:1000});
   const pairs=await t.page.evaluate(()=>{const r=document.documentElement,cs=getComputedStyle(r),colour=v=>{const e=document.createElement('span');e.style.color=`var(--ifl-${v})`;document.body.append(e);const c=getComputedStyle(e).color;e.remove();return c;};return{ink:colour('text'),muted:colour('muted'),link:colour('accent-ink'),surfaces:['page','surface','surface-2','accent-wash'].map(colour),on:colour('on-accent'),action:colour('accent-fill'),button:getComputedStyle(document.querySelector('button')).color,heading:getComputedStyle(document.querySelector('h1')).color,buttonOn:getComputedStyle(document.querySelector('button')).getPropertyValue('--ifl-on-accent'),rootText:cs.getPropertyValue('--text'),bodyText:getComputedStyle(document.body).getPropertyValue('--text'),bodyColour:getComputedStyle(document.body).color,mode:r.dataset.theme,rootOn:cs.getPropertyValue('--ifl-on-accent')};});
   for(const bg of pairs.surfaces){assert.ok(contrast(pairs.ink,bg)>=4.5,`${palette}/${appearance} text`);assert.ok(contrast(pairs.muted,bg)>=4.5,`${palette}/${appearance} secondary`);assert.ok(contrast(pairs.link,bg)>=4.5,`${palette}/${appearance} link`);}
   assert.ok(contrast(pairs.heading,pairs.surfaces[1])>=4.5,`${palette}/${appearance} heading: ${JSON.stringify(pairs)}`);
   assert.ok(contrast(pairs.on,pairs.action)>=4.5,`${palette}/${appearance} button`);
   assert.ok(contrast(pairs.button,pairs.action)>=4.5,`${palette}/${appearance} real button text: ${JSON.stringify(pairs)}`);
   assert.equal(await input.inputValue(),'Keep my unfinished message');assert.equal(await input.evaluate(el=>el===window.originalDraft),true);
  }
  assert.deepEqual(t.errors,[]);
 }finally{await t.ctx.close();}
});
test('cached theme is applied synchronously and delayed account data cannot undo a newer choice',async()=>{
 const t=await open({cached:{palette:'iris',appearance:'dark',id:'ann'},hold:true});try{
  assert.deepEqual(await t.page.evaluate(()=>firstTheme),{palette:'iris',appearance:'dark',page:'#16121e'});
  await t.page.evaluate(()=>InFliteAppearance.accept({palette:'coast',appearance:'light',id:'ann'}));
  const response=t.page.waitForResponse('**/account/api/account/appearance');t.reply({signedIn:true,palette:'ember',appearance:'dark',id:'ann'});await response;
  await t.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await t.page.evaluate(()=>InFliteAppearance.snapshot().palette),'coast');
  assert.equal(await t.page.evaluate(()=>InFliteAppearance.accept({palette:'__proto__',appearance:'dark'})),false);
  assert.deepEqual(t.errors,[]);
 }finally{await t.ctx.close();}
});
test('blocked storage and malformed cached preferences leave startup usable',async()=>{
 for(const options of [{blocked:true},{cached:{palette:'url(bad)',appearance:'dark'}}]){const t=await open(options);try{assert.equal(await t.page.evaluate(()=>InFliteAppearance.snapshot().palette),'inflite');assert.ok(await t.page.getByRole('button',{name:'Continue'}).isVisible());assert.deepEqual(t.errors,[]);}finally{await t.ctx.close();}}
});
