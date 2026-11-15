// Real shell/frame navigation. The dock must stay outside page transforms and
// View Transition snapshots, with identical viewport geometry throughout.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {Module}=require('node:module'),{readFileSync}=require('node:fs'),{resolve}=require('node:path');
const filename=resolve(__dirname,'files-host-ui.test.cjs'),m=new Module(filename);
m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);
const original=m.require.bind(m);let start,stop;
m.require=id=>id==='node:test'?{test(){},before(fn){start=fn},after(fn){stop=fn}}:original(id);
m._compile(readFileSync(filename,'utf8')+'\nmodule.exports={open};',filename);
before(()=>start());after(()=>stop());

for(const [width,height] of [[320,760],[390,844],[844,390],[1100,800],[1440,950]])for(const fallback of [false,true])test(`dock stays in place across pages at ${width}×${height} (${fallback?'CSS fallback':'View Transitions'})`,async()=>{
 const t=await m.exports.open({width}),{page}=t;try{
  await page.setViewportSize({width,height});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(fallback=>{
   if(fallback)Object.defineProperty(document,'startViewTransition',{configurable:true,value:undefined});
   T.F.nav.go('/',{kind:'section'});T.ws.show(T.F.route);
  },fallback);
  await page.locator('#workspace[data-mode=today]').waitFor();
  await page.evaluate(()=>{
   const dock=document.querySelector('.ws-dock'),host=dock.closest('.ws-dock-host');
   window.dockProbe={dock,host,parent:host.parentElement,samples:[],running:true};
   const sample=()=>{if(!dockProbe.running)return;const r=dock.getBoundingClientRect();dockProbe.samples.push({x:r.x,y:r.y,w:r.width,h:r.height,visible:!!dock.getClientRects().length,same:host.parentElement===dockProbe.parent&&!host.closest('#views')});requestAnimationFrame(sample)};
   requestAnimationFrame(sample);
  });
  for(const path of ['/weather/','/#files','/fitness/','/']){
   await page.evaluate(path=>T.F.nav.go(path,{kind:'tab'}),path);
   if(path==='/#files')await page.getByRole('button',{name:'Select Private folder',exact:true}).waitFor();
   else if(path==='/')await page.locator('#workspace[data-mode=today]').waitFor();
   else await page.getByRole('textbox',{name:path.includes('weather')?'weather draft':'fitness draft',exact:true}).waitFor();
   await page.evaluate(async()=>{await Promise.allSettled(document.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
  }
  const result=await page.evaluate(()=>{
   dockProbe.running=false;const s=dockProbe.samples;
   return {samples:s,position:getComputedStyle(dockProbe.dock).position,name:getComputedStyle(dockProbe.dock).viewTransitionName,count:document.querySelectorAll('.ws-dock').length};
  });
  assert.equal(result.position,'fixed');assert.equal(result.name,'inflite-dock');assert.equal(result.count,1);
  assert.ok(result.samples.length>4);
  const first=result.samples[0];
  for(const r of result.samples){assert.ok(r.same&&r.visible,'dock stays mounted and visible outside page containers');for(const k of ['x','y','w','h'])assert.ok(Math.abs(r[k]-first[k])<=1,`dock ${k} moved from ${first[k]} to ${r[k]}`)}
  await page.evaluate(()=>{document.body.style.minHeight='2400px';scrollTo(0,600)});
  assert.ok(await page.evaluate(()=>scrollY)>0,'the test actually scrolls the page');
  const scrolled=await page.locator('.ws-dock').boundingBox();assert.ok(Math.abs(scrolled.y-first.y)<=1,'scrolling does not move the dock');
  await page.evaluate(()=>T.F.destroy());assert.equal(await page.locator('.ws-dock').count(),0);await t.clean();
 }finally{await t.ctx.close()}
});

test('keyboard and native full-screen chrome policy still control the permanent dock',async()=>{
 const t=await m.exports.open({width:390});try{
  await t.page.evaluate(()=>{T.F.nav.go('/weather/',{kind:'section'});T.F.tabs.away(true)});
  assert.equal(await t.page.locator('.ws-dock').isVisible(),false);
  await t.page.evaluate(()=>T.F.tabs.away(false));assert.equal(await t.page.locator('.ws-dock').isVisible(),true);
  await t.page.evaluate(()=>document.body.classList.add('kb-up'));assert.equal(await t.page.locator('.ws-dock').isVisible(),false);
  await t.page.evaluate(()=>document.body.classList.remove('kb-up'));assert.equal(await t.page.locator('.ws-dock').isVisible(),true);
  await t.clean();
 }finally{await t.ctx.close()}
});
