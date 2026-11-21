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

test('Today opens global search from the header icon and Apps from the dock', async () => {
 const t = await m.exports.open({width: 390});
 try {
  const { page } = t;
  await page.evaluate(() => T.F.nav.go('/'));
  const header = page.locator('#workspace').getByRole('banner');
  const search = header.getByRole('button', { name: 'Search InFlite', exact: true });
  for (const width of [390, 1440]) {
   await page.setViewportSize({ width, height: 844 });
   await search.waitFor();
   assert.equal(await header.getByText('Search InFlite', { exact: true }).count(), 0);
   const icon = await search.boundingBox();
   assert.ok(icon.width >= 44 && icon.width <= 64 && icon.height >= 44);
   await search.click();
   const input = page.getByRole('combobox', { name: 'Search everything', exact: true });
   await input.waitFor();
   assert.equal(await input.evaluate(node => node === document.activeElement), true);
   await page.keyboard.press('Escape');
   await input.waitFor({ state: 'hidden' });
   await page.waitForFunction(() => document.activeElement?.matches('[data-ws-action="search"]'));
  }
  await page.locator('.ws-dock').getByRole('button', { name: 'All apps', exact: true }).click();
  await page.getByRole('dialog', { name: 'Your apps', exact: true }).waitFor();
  await t.clean();
 } finally {
  await t.ctx.close();
 }
});

for(const width of [390,1440])test(`dock resumes routes, scroll and the same draft nodes at ${width}px`,async()=>{
 const t=await m.exports.open({width}),{page}=t;try{
  await page.evaluate(()=>T.F.nav.go('/weather/#radar',{kind:'section'}));
  const draft=page.getByRole('textbox',{name:'weather draft',exact:true});await draft.fill('Keep this draft');
  await page.evaluate(()=>{window.keptDraft=document.querySelector('[aria-label="weather draft"]');const root=keptDraft.parentElement;root.style.minHeight='2600px';const scroller=document.createElement('div');scroller.id='kept-inner';scroller.style.cssText='height:90px;overflow:auto';scroller.innerHTML='<div style="height:600px">Inner view</div>';root.append(scroller);scroller.scrollTop=180;scrollTo(0,520)});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  const before=await page.evaluate(()=>{window.leftRoute=T.F.route;return scrollY});assert.ok(before>400);
  await page.evaluate(()=>document.querySelector('[data-ws-action="app:fitness"]').click());await page.getByRole('textbox',{name:'fitness draft',exact:true}).fill('Second draft');
  await page.evaluate(()=>document.querySelector('[data-ws-action="app:weather"]').click());
  await page.waitForFunction(()=>location.hash==='#radar'&&scrollY>400);
  assert.equal(await page.evaluate(()=>T.F.route!==leftRoute),true,'resume creates a new route identity so old asynchronous work stays retired');assert.equal(await draft.inputValue(),'Keep this draft');assert.equal(await page.evaluate(()=>keptDraft===document.querySelector('[aria-label="weather draft"]')),true);
  assert.equal(await page.locator('#kept-inner').evaluate(n=>n.scrollTop),180);assert.ok(Math.abs(await page.evaluate(()=>scrollY)-before)<=2);
  const same=await page.evaluate(async()=>{const length=history.length,route=T.F.route;await document.querySelector('[data-ws-action="app:weather"]').click();return length===history.length&&T.F.route===route});assert.equal(same,true,'reselecting the active app does not add history or restart its view');
  await page.evaluate(()=>T.F.nav.go('/weather/#days',{kind:'section'}));assert.equal(new URL(page.url()).hash,'#days','explicit destinations override the remembered view');
  await page.evaluate(()=>document.querySelector('[data-ws-action="app:weather"]').click());assert.equal(new URL(page.url()).hash,'#days','an active app never jumps back to an older remembered section');
  await page.evaluate(()=>document.querySelector('[data-ws-action="app:fitness"]').click());assert.equal(await page.getByRole('textbox',{name:'fitness draft',exact:true}).inputValue(),'Second draft');
  await t.clean();
 }finally{await t.ctx.close()}
});

test('Files resumes its folder and private search without putting either text into history',async()=>{
 const t=await m.exports.open({width:390}),{page}=t;try{
  await page.evaluate(()=>T.ws.openFiles());await page.getByRole('button',{name:'Select Private folder',exact:true}).click();await page.getByRole('button',{name:'Select Private note.txt',exact:true}).waitFor();
  const search=page.getByRole('searchbox');await search.fill('Private note');await page.waitForFunction(()=>T.reads.some(r=>r.query==='Private note'));
  await page.evaluate(()=>document.querySelector('[data-ws-action="app:weather"]').click());await page.getByRole('textbox',{name:'weather draft',exact:true}).waitFor();await page.evaluate(()=>T.ws.openFiles());await search.waitFor();
  assert.equal(await search.inputValue(),'Private note');assert.equal(new URL(page.url()).hash,'#files='+'a'.repeat(32));
  const safe=await page.evaluate(()=>JSON.stringify({url:location.href,history:history.state,storage:{...localStorage,...sessionStorage}}));assert.equal(safe.includes('Private note'),false);
  await page.evaluate(()=>T.F.nav.go('/',{resume:true}));await page.locator('#workspace[data-mode=today]').waitFor();assert.equal(new URL(page.url()).hash.includes('files'),false,'Today and Files keep separate resume routes');await t.clean();
 }finally{await t.ctx.close()}
});
