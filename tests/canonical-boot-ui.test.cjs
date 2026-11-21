// The actual deployed shell and bootstrap, with a failed canonical app endpoint.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,existsSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {chromium,webkit}=require('playwright');
const PUBLIC=resolve(__dirname,'../today/public'),ORIGIN='https://inflite.ai';
let browser;
before(async()=>{browser=process.env.WEB_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});});
after(async()=>browser?.close());
for(const state of ['no','module-off','loading'])test(`canonical Weather startup with the hub ${state}`,async()=>{
 const ctx=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce',viewport:{width:390,height:844}});let probes=0,docs=0,retry=false;const errors=[];
 let releaseDockCSS;
 const dockCSS=new Promise(resolve=>{releaseDockCSS=resolve});
 await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==ORIGIN)return route.abort();
 if(u.pathname==='/api/hub'){probes++;return route.fulfill({json:{ready:retry||state!=='no',roof:true,apps:{weather:retry||state==='loading',markets:false,fitness:false,chats:false,mail:false}}});}
 if(u.pathname==='/api/session')return route.fulfill({json:retry?{signedIn:false}:{signedIn:true,user:{id:'ann',name:'Ann'},prefs:{},links:{weather:'https://weather.inflite.ai'}}});
 if(u.pathname.startsWith('/api/'))return route.fulfill({json:{}});
 if(u.pathname==='/version')return route.fulfill({json:{build:'3.00'}});
 const file=resolve(PUBLIC,'.'+(u.pathname==='/weather/'?'/index.html':u.pathname));
 if(!file.startsWith(PUBLIC+'/')||!existsSync(file))return route.fulfill({status:404,body:'Not found'});
 if(u.pathname==='/roof/workspace.css')await dockCSS;
 if(route.request().isNavigationRequest())docs++;
 const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'}[extname(file)]||'application/octet-stream';
 return route.fulfill({contentType:type,body:readFileSync(file)});
 });
 const page=await ctx.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 try{
 if(state==='loading'){
  const dockRequest=page.waitForRequest(request=>request.url()===ORIGIN+'/roof/workspace.css');
  await Promise.all([dockRequest,page.goto(ORIGIN+'/weather/#radar',{waitUntil:'domcontentloaded'})]);
  await page.locator('#in').waitFor();
  assert.equal(await page.locator('#tabs, .ifl-tabs').count(),0,'the signed-in shell does not build the retired bar while the dock loads');
  releaseDockCSS();
  const dock=page.locator('.ws-dock');
  await dock.waitFor();
  assert.equal(await dock.evaluate(node=>getComputedStyle(node).position),'fixed');
  assert.equal(await page.locator('#tabs, .ifl-tabs').count(),0);
  assert.equal(await page.locator('.ws-dock-host > .ws-sidebar').isVisible(),false,'the desktop sidebar does not appear under Weather on mobile');
  await page.locator('link[href="/roof/workspace.css"]').evaluate(link=>{link.disabled=true});
  assert.equal(await page.locator('.ws-dock-host').isVisible(),false,'unstyled chrome cannot enter the page flow');
  return;
 }
 await page.goto(ORIGIN+'/weather/#radar');await page.getByText('Weather is temporarily unavailable. Try again in a moment.').waitFor();
 assert.equal(docs,1);assert.equal(probes,1);assert.equal(page.url(),ORIGIN+'/weather/#radar');assert.equal(await page.locator('#out').isVisible(),false);assert.equal(await page.locator('#sessionState').getAttribute('aria-busy'),'false');
 retry=true;await page.locator('#sessionRetry').click();await page.locator('#out:not([hidden])').waitFor({state:'attached'});
 assert.equal(await page.locator('#signin').isVisible(),true);assert.equal(probes,2);assert.equal(docs,1);assert.equal(page.url(),ORIGIN+'/weather/#radar');assert.deepEqual(errors,[]);
 }finally{releaseDockCSS();await ctx.close();}
});
