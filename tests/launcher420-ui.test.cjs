const{test,before,after}=require('node:test'),assert=require('node:assert/strict'),{Module}=require('node:module'),{readFileSync,mkdirSync}=require('node:fs'),{resolve}=require('node:path');
const filename=resolve(__dirname,'files-host-ui.test.cjs'),m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);const original=m.require.bind(m);let start,stop;m.require=id=>id==='node:test'?{test(){},before(fn){start=fn},after(fn){stop=fn}}:original(id);m._compile(readFileSync(filename,'utf8')+'\nmodule.exports={open};',filename);before(()=>start());after(()=>stop());
const settle=page=>page.evaluate(async()=>{for(let i=0;i<3;i++)await Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished))});
async function open(width=390){const t=await m.exports.open({width});await t.ctx.route(u=>u.origin===new URL(t.page.url()).origin&&u.pathname==='/api/status-banner',r=>r.fulfill({json:{banner:null}}));await t.ctx.route('blob:**',r=>new URL(r.request().url()).origin===new URL(t.page.url()).origin?r.continue():r.abort());const source=readFileSync(resolve(__dirname,'../today/public/app.js'),'utf8'),a=source.indexOf("// ==== InFlite's menu, shared:"),end="// ==== end of InFlite's menu ====",block=source.slice(a,source.indexOf(end,a)+end.length);await t.ctx.route('**/launcher-shared.js',r=>r.fulfill({contentType:'text/javascript',body:block+'\nwindow.IFL=IFL;'}));await t.page.addScriptTag({url:'/launcher-shared.js'});await t.page.setViewportSize({width,height:844});await t.page.emulateMedia({reducedMotion:'no-preference'});return t}
test('favourites edit the real fixed dock; search keeps its input and tiles stable', async () => {
  const t = await open();
  try {
    const {page} = t, menu = page.locator('dialog[data-sheet=workspace-apps]');
    const button = name => menu.getByRole('button', {name, exact:true});
    await page.getByRole('button',{name:'All apps',exact:true}).click();
    await settle(page);
    if (process.env.LAUNCHER_SCREENSHOTS) {
      mkdirSync(process.env.LAUNCHER_SCREENSHOTS,{recursive:true});
      for (const theme of ['light','dark']) {
        await page.evaluate(t => {document.documentElement.dataset.theme=t; document.documentElement.style.colorScheme=t},theme);
        await settle(page);
        await page.screenshot({path:resolve(process.env.LAUNCHER_SCREENSHOTS,`library-${theme}.png`)});
      }
    }
    await menu.locator('[data-launcher-app=weather]').evaluate(n => window.originalWeatherTile = n);
    await button('Search apps').click();
    await settle(page);
    const search = menu.getByRole('searchbox',{name:'Search apps'}), y = (await search.boundingBox()).y;
    assert.ok(await search.evaluate(el => el === document.activeElement));
    await search.fill('unmatched');
    await menu.getByText('No apps found').waitFor();
    await search.fill('WEATHER');
    assert.equal(await menu.locator('.wsl-app:visible').count(),1);
    assert.ok(await button('Weather').evaluate(el => el === window.originalWeatherTile));
    assert.equal((await search.boundingBox()).y,y);
    assert.ok((await menu.locator('.wsl-apps').boundingBox()).height < 100);
    await button('Back').click();
    assert.equal(await menu.locator('.wsl-app:visible').count(),10);
    assert.equal(await button('Atlas').isVisible(),true);
    assert.equal(await button('Atlas').locator('img').getAttribute('src'),'/atlas.svg');
    assert.equal(await button('Atlas').isDisabled(),true,'Atlas needs the account entitlement before it can open');
    await button('Actions').click();
    await button('Edit dock').click();
    assert.equal(await button('Pin Atlas').isDisabled(),true,'an unavailable Atlas cannot be added to the dock');
    await button('Unpin Weather').click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ifl:launcher:v1:ann')).includes('weather')),false);
    await button('Pin Weather').click();
    await button('Done').click();
    await page.keyboard.press('Escape');
    await menu.waitFor({state:'detached'});
    assert.equal(await page.locator('.ws-dock button').count(),6);
    assert.equal(await page.locator('.ws-dock').getByRole('button',{name:'Weather',exact:true}).count(),1);
    const state = await page.evaluate(()=>JSON.stringify({url:location.href,state:history.state,storage:{...localStorage,...sessionStorage}}));
    assert.ok(!state.includes('WEATHER') && !state.includes('weather draft'));
    await t.clean();
  } finally { await t.ctx.close(); }
});
for(const fallback of [false,true])test(`icon launches and returns keep drafts, dock and route ownership (${fallback?'fallback':'native'})`,async()=>{const t=await open();try{const{page}=t;if(fallback)await page.evaluate(()=>Object.defineProperty(document,'startViewTransition',{configurable:true,value:undefined}));const before=await page.locator('.ws-dock').boundingBox();await page.getByRole('button',{name:'All apps',exact:true}).click();let menu=page.getByRole('dialog',{name:'Your apps',exact:true});await menu.waitFor();await settle(page);await menu.getByRole('button',{name:'Weather',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.vt),'launch');const draft=page.getByRole('textbox',{name:'weather draft',exact:true});await draft.fill('Keep this draft');await settle(page);await page.evaluate(()=>window.keptWeather=document.querySelector('[aria-label="weather draft"]'));await page.getByRole('button',{name:'All apps',exact:true}).click();menu=page.getByRole('dialog',{name:'Your apps',exact:true});await menu.waitFor();await settle(page);assert.ok((await menu.locator('[data-launcher-app=weather]').boundingBox()).width>44);await menu.getByRole('button',{name:'Weather',exact:true}).click();await draft.waitFor();await settle(page);assert.equal(await draft.inputValue(),'Keep this draft');assert.equal(await page.evaluate(()=>keptWeather===document.querySelector('[aria-label="weather draft"]')),true);assert.deepEqual(await page.locator('.ws-dock').boundingBox(),before);assert.equal(await page.evaluate(()=>document.documentElement.dataset.vt||''),'');assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--ifl-launch-from')),'');await page.evaluate(()=>{document.querySelector('[data-ws-action="app:weather"]').click();T.F.nav.go('/fitness/',{kind:'section'});T.F.nav.go('/weather/',{kind:'section'})});await draft.waitFor();await settle(page);assert.equal(await draft.inputValue(),'Keep this draft');await page.evaluate(()=>T.F.destroy());assert.equal(await page.locator('.ws-dock').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.dataset.vt||''),'');assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--ifl-launch-from')),'');await t.clean()}finally{await t.ctx.close()}});
test('reduced motion and account release cancel a pending launch without stale chrome',async()=>{const t=await open(320);try{const{page}=t;await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Weather',exact:true}).click();await page.getByRole('textbox',{name:'weather draft',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dataset.vt||''),'');await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>{T.F.nav.go('/fitness/',{kind:'launch',launch:{x:20,y:700,width:36,height:36,vw:320,vh:844}});T.F.destroy()});await settle(page);assert.equal(await page.locator('.ws-dock').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.dataset.vt||''),'');assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--ifl-launch-from')),'');await t.clean()}finally{await t.ctx.close()}});

test('rapid Apps taps retain one launcher and one account-owned dock',async()=>{const t=await open();try{const{page}=t;await page.getByRole('button',{name:'Weather',exact:true}).click();await page.getByRole('textbox',{name:'weather draft',exact:true}).waitFor();await settle(page);await page.evaluate(()=>{const button=document.querySelector('.ws-dock-launcher');button.click();button.click();button.click()});await page.getByRole('dialog',{name:'Your apps',exact:true}).first().waitFor();await settle(page);assert.equal(await page.getByRole('dialog',{name:'Your apps',exact:true}).count(),1);assert.equal(await page.locator('.ws-dock').count(),1);await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'Your apps',exact:true}).waitFor({state:'detached'});await page.getByRole('button',{name:'All apps',exact:true}).click();assert.equal(await page.getByRole('dialog',{name:'Your apps',exact:true}).count(),1);await t.clean()}finally{await t.ctx.close()}});
for (const width of [320,390,1440]) test(`launcher has one aligned glass window at ${width}px`, async () => {
  const t = await open(width);
  try {
    const {page} = t, menu = page.locator('dialog[data-sheet=workspace-apps]');
    await page.getByRole('button',{name:'All apps',exact:true}).click();
    await settle(page);
    const layout = await menu.evaluate(n => {
      const header = n.querySelector('.ifs-head h2'), grid = n.querySelector('.wsl-apps'), css = getComputedStyle(n);
      return {padding:[css.paddingLeft,css.paddingRight,css.paddingBottom],
        layer:getComputedStyle(n.querySelector('.ifs-head'),'::before').content,
        aligned:Math.abs(header.getBoundingClientRect().left-grid.getBoundingClientRect().left)<1,
        height:n.getBoundingClientRect().height};
    });
    assert.deepEqual(layout.padding,['0px','0px','0px']);
    assert.equal(layout.layer,'none');
    assert.ok(layout.aligned && layout.height<=440,JSON.stringify(layout));
    assert.equal(await menu.getByRole('searchbox').count(),0);
    assert.ok(await menu.getByRole('button',{name:'Search apps',exact:true}).isVisible());
    await menu.getByRole('button',{name:'Actions',exact:true}).click();
    await menu.getByRole('heading',{name:'Actions',exact:true}).waitFor();
    assert.equal(await menu.getByRole('group',{name:'Apps',exact:true}).count(),0);
    await menu.getByRole('button',{name:'Security',exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await menu.getByRole('heading',{name:'Your apps',exact:true}).waitFor();
    const sizes=await page.locator('.ws-dock .ws-dock-symbol').evaluateAll(nodes=>nodes.map(n=>[n.offsetWidth,n.offsetHeight]));
    for (const size of sizes) assert.deepEqual(size,[36,36]);
    await t.clean();
  } finally { await t.ctx.close(); }
});
test('long press opens actions without launching; Back and Escape pop within the library',async()=>{const t=await open();try{const{page}=t;await page.getByRole('button',{name:'All apps',exact:true}).click();const menu=page.locator('dialog[data-sheet=workspace-apps]');await settle(page);const app=menu.getByRole('button',{name:'Weather',exact:true}),box=await app.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(600);await page.mouse.up();await menu.getByRole('button',{name:'Open Weather',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/');assert.equal(await page.locator('dialog[open]').count(),1);assert.equal(await menu.locator('.ifs-page').count(),1);assert.equal(await menu.evaluate(n=>n.classList.contains('closing')),false,'releasing the held icon must not dismiss the resized sheet');await page.keyboard.press('Escape');await settle(page);await menu.getByRole('button',{name:'Search apps',exact:true}).waitFor();await menu.getByRole('button',{name:'Weather',exact:true}).click({button:'right'});await menu.getByRole('button',{name:'Open Weather',exact:true}).waitFor();await page.evaluate(()=>T.F.nav.back());await settle(page);await menu.getByRole('button',{name:'Search apps',exact:true}).waitFor();await page.keyboard.press('Escape');await menu.waitFor({state:'detached'});await t.clean()}finally{await t.ctx.close()}});
test('favourites reorder by pointer and keyboard, with no route changes or extra dock slots',async()=>{const t=await open(320);try{const{page}=t;await page.getByRole('button',{name:'All apps',exact:true}).click();const menu=page.locator('dialog[data-sheet=workspace-apps]');await menu.getByRole('button',{name:'Actions',exact:true}).click();await menu.getByRole('button',{name:'Edit dock',exact:true}).click();const strip=menu.getByRole('group',{name:'Favourite order'});const initial=await strip.locator('[data-launcher-favourite]').evaluateAll(ns=>ns.map(n=>n.dataset.launcherFavourite));assert.ok(initial.length>1);const first=strip.locator('button').first();await first.focus();await page.keyboard.press('ArrowRight');let items=await page.evaluate(()=>JSON.parse(localStorage.getItem('ifl:launcher:v1:ann')));assert.equal(items[1],initial[0]);assert.equal(await page.evaluate(()=>document.activeElement.dataset.launcherFavourite),initial[0]);await settle(page);const a=await strip.locator('button').first().boundingBox(),b=await strip.locator('button').last().boundingBox();const moved=items[0];await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.mouse.up();items=await page.evaluate(()=>JSON.parse(localStorage.getItem('ifl:launcher:v1:ann')));assert.equal(items.at(-1),moved);assert.equal(await page.locator('.ws-dock button').count(),6);assert.equal(new URL(page.url()).pathname,'/');await menu.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await strip.isVisible(),false);await t.clean()}finally{await t.ctx.close()}});
test('an unchanged transfer badge survives a shell update and clears on completion', async () => {
  const t = await open();
  try {
    const {page} = t;
    await page.evaluate(()=>{T.service.upload([new File(['x'],'Local file.txt')])});
    const files = page.locator('.ws-dock [data-launcher-app=files]');
    await page.waitForFunction(()=>document.querySelector('.ws-dock [data-launcher-app=files]')?.getAttribute('aria-description')==='1 upload · 40%');
    const mark = files.locator('.wsl-badge');
    assert.equal(await mark.innerText(),'40%');
    await mark.evaluate(node=>{T.badgeNode=node; T.F.nav.go('/fitness/',{kind:'section'})});
    await page.getByRole('textbox',{name:'fitness draft',exact:true}).waitFor();
    assert.ok(await mark.evaluate(node=>node===T.badgeNode));
    await page.evaluate(()=>T.completeUpload());
    await page.waitForFunction(()=>!document.querySelector('.ws-dock [data-launcher-app=files] .wsl-badge'));
    assert.equal(await files.getAttribute('aria-description'),null);
    assert.equal(await page.locator('.ws-dock [aria-description]').count(),0);
    await t.clean();
  } finally { await t.ctx.close(); }
});
test('a cancelled touch cannot open a late shortcut after navigation or account release',async()=>{const t=await open();try{const{page}=t;await page.evaluate(()=>{const b=document.querySelector('.ws-dock [data-launcher-app=weather]');b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:91,pointerType:'touch',isPrimary:true,button:0,clientX:100,clientY:750}));b.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:91}));T.F.nav.go('/fitness/',{kind:'section'})});await page.getByRole('textbox',{name:'fitness draft',exact:true}).waitFor();await page.waitForTimeout(600);assert.equal(await page.locator('dialog[open]').count(),0);await page.evaluate(()=>T.F.destroy());await page.waitForTimeout(600);assert.equal(await page.locator('dialog[open],.ws-dock').count(),0);await t.clean()}finally{await t.ctx.close()}});
test('dismissed shortcut controls cannot launch an app or change favourites',async()=>{const t=await open();try{const{page}=t;await page.locator('.ws-dock [data-launcher-app=weather]').click({button:'right'});await page.getByRole('dialog',{name:'Weather',exact:true}).waitFor();await page.evaluate(()=>{T.oldShortcut=[...document.querySelectorAll('dialog[data-sheet=launcher-actions] button.ifl-btn')];T.F.sheet.closeAll()});const before=await page.evaluate(()=>({url:location.href,favourites:localStorage.getItem('ifl:launcher:v1:ann')}));await page.evaluate(()=>{for(const b of T.oldShortcut)b.click()});await settle(page);assert.deepEqual(await page.evaluate(()=>({url:location.href,favourites:localStorage.getItem('ifl:launcher:v1:ann')})),before);assert.equal(await page.locator('dialog[open]').count(),0);await t.clean()}finally{await t.ctx.close()}});
test('releasing a held dock icon leaves its shortcut panel open without activating an action',async()=>{const t=await open();try{const{page}=t,b=await page.locator('.ws-dock [data-launcher-app=weather]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.waitForTimeout(600);await page.mouse.up();const menu=page.locator('dialog[data-sheet=launcher-actions]');await menu.getByRole('button',{name:'Open Weather',exact:true}).waitFor();await settle(page);assert.equal(await menu.evaluate(n=>n.open&&!n.classList.contains('closing')),true);assert.equal(new URL(page.url()).pathname,'/');await page.keyboard.press('Escape');await menu.waitFor({state:'detached'});await t.clean()}finally{await t.ctx.close()}});

test('dock press keeps the rounded glass edge and keyboard focus stays visible',async()=>{
 const t=await open();
 try {
  const {page}=t, dock=page.locator('.ws-dock'), weather=dock.getByRole('button',{name:'Weather',exact:true});
  await weather.focus();
  await page.keyboard.press('Tab');
  const focus=await dock.locator(':focus-visible').evaluate(button=>getComputedStyle(button).outlineStyle);
  assert.notEqual(focus,'none');

  await page.evaluate(()=>{
   const start=document.startViewTransition.bind(document);
   document.startViewTransition=update=>{
    const transition=start(update);
    window.dockSnapshot=transition.ready.then(()=>{
     const group=getComputedStyle(document.documentElement,'::view-transition-group(inflite-dock)');
     return {radius:group.borderTopLeftRadius,overflow:group.overflow};
    });
    return transition;
   };
  });
  await weather.click();
  const snapshot=await page.evaluate(()=>window.dockSnapshot);
  assert.equal(snapshot.radius,await dock.evaluate(node=>getComputedStyle(node).borderTopLeftRadius));
  assert.equal(snapshot.overflow,'clip');
  assert.equal(await dock.locator('.ws-dock-selection').evaluate(node=>getComputedStyle(node).boxShadow),'none');
  await settle(page);await t.clean();
 } finally {await t.ctx.close()}
});

test('pointer-opened profile menu and sheets keep focus without a ring, and Tab shows focus again',async()=>{
 const t=await open();
 try {
  const {page}=t;
  await page.addScriptTag({url:'/theme.js'});
  await page.evaluate(()=>{
   const anchor=document.createElement('button');
   anchor.textContent='Profile menu';anchor.className='ifh-me';
   document.body.append(anchor);
   anchor.onclick=()=>IFL.menu(anchor,{app:'today',me:{name:'Alex'},rows:[{label:'Settings',icon:'sliders',open:()=>{
    T.F.sheet.open({title:'Settings',body:document.createElement('div')});
   }}]});
  });
  const opener=page.getByRole('button',{name:'Profile menu'}),profile=page.locator('.ifm-card');
  const outline=el=>getComputedStyle(el).outlineStyle;
  const restingShadow=await opener.evaluate(el=>getComputedStyle(el).boxShadow);
  await opener.click();
  assert.equal(await profile.evaluate(el=>el===document.activeElement),true);
  assert.equal(await profile.evaluate(outline),'none');
  assert.equal(await opener.evaluate(el=>getComputedStyle(el).boxShadow),restingShadow);
  const settings=page.getByRole('button',{name:'Settings',exact:true}).last();
  await page.keyboard.press('Tab');
  assert.equal(await settings.evaluate(el=>el===document.activeElement),true);
  assert.notEqual(await settings.evaluate(outline),'none');
  await settings.click();
  const sheet=page.getByRole('dialog',{name:'Settings',exact:true});await sheet.waitFor();
  await sheet.evaluate(el=>el.focus({preventScroll:true}));
  assert.equal(await sheet.evaluate(el=>el===document.activeElement),true);
  assert.equal(await sheet.evaluate(outline),'none');
  await page.keyboard.press('Escape');await t.clean();
 } finally {await t.ctx.close()}
});

test('drawer and dock crossfade on dismissal and respect reduced motion',async()=>{
 const t=await open();
 try {
  const {page}=t, apps=page.getByRole('button',{name:'All apps',exact:true});
  const drawer=page.locator('dialog[data-sheet=workspace-apps]'), dock=page.locator('.ws-dock');
  await apps.click();
  await settle(page);
  assert.equal(await dock.evaluate(node=>getComputedStyle(node).opacity),'0');
  const closing=await drawer.evaluate(sheet=>{
   const dock=document.querySelector('.ws-dock');
   sheet.querySelector('[data-close]').click();
   const style=getComputedStyle(dock);
   const fade=dock.getAnimations().find(animation=>animation.transitionProperty==='opacity');
   return {sheet:sheet.open, interactive:style.pointerEvents, target:fade?.effect.getKeyframes().at(-1).opacity};
  });
  assert.deepEqual(closing,{sheet:true,interactive:'none',target:'1'});
  await drawer.waitFor({state:'detached'});
  await settle(page);
  assert.equal(await dock.evaluate(node=>getComputedStyle(node).opacity),'1');
  await page.emulateMedia({reducedMotion:'reduce'});
  await apps.click();
  assert.deepEqual(await dock.evaluate(node=>node.getAnimations().map(a=>a.transitionProperty || a.animationName || a.id)),[]);
  await page.keyboard.press('Escape');
  await drawer.waitFor({state:'detached'});
  await t.clean();
 } finally {await t.ctx.close()}
});

test('the dock highlight settles on the latest app after a quick switch',async()=>{
 const t=await open();
 try {
  const {page}=t;
  await page.evaluate(()=>{
   T.F.nav.go('/weather/',{kind:'section'});
   T.F.nav.go('/fitness/',{kind:'section'});
  });
  const active=page.locator('.ws-dock [data-launcher-app=fitness][aria-current]');
  await active.waitFor();
  await settle(page);
  const error=await active.evaluate(button=>{
   const slot=button.getBoundingClientRect();
   const highlight=document.querySelector('.ws-dock-selection').getBoundingClientRect();
   return Math.max(Math.abs(highlight.left-slot.left),Math.abs(highlight.width-slot.width));
  });
  assert.ok(error<=1,`Highlight missed the selected button by ${error}px`);
  await t.clean();
 } finally {await t.ctx.close()}
});

for (const app of ['Weather','Files']) test(`Apps opens over ${app} without navigating or starting another route animation`, async () => {
 const t=await open();
 try {
  const {page}=t;
  await page.locator('.ws-dock').getByRole('button',{name:app,exact:true}).click();
  if (app==='Weather') await page.getByRole('textbox',{name:'weather draft'}).fill('Keep this draft');
  else {
   await page.getByRole('button',{name:'Select Private folder'}).click();
   await page.getByRole('button',{name:'Select Private note.txt'}).waitFor();
  }
  await settle(page);
  const before=await page.evaluate(()=>({url:location.href,depth:history.length}));
  await page.evaluate(()=>{
   window.drawerRoutes=0;
   T.F.on('route',()=>window.drawerRoutes++);
  });
  const apps=page.getByRole('button',{name:'All apps',exact:true}), drawer=page.getByRole('dialog',{name:'Your apps'});
  await apps.click();
  await drawer.waitFor();
  assert.deepEqual(await page.evaluate(()=>({url:location.href,depth:history.length})),before);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.vt||''),'');
  await drawer.getByRole('button',{name:app,exact:true}).click();
  await drawer.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>window.drawerRoutes),0);
  if (app==='Weather') assert.equal(await page.getByRole('textbox',{name:'weather draft'}).inputValue(),'Keep this draft');
  else assert.ok(await page.getByRole('button',{name:'Select Private note.txt'}).isVisible());
  await t.clean();
 } finally {await t.ctx.close()}
});

test('pressing Apps during an app launch finishes on one drawer over that app',async()=>{
 const t=await open();
 try {
  const {page}=t;
  await page.evaluate(()=>{
   document.querySelector('.ws-dock [data-launcher-app=weather]').click();
   document.querySelector('.ws-dock-launcher').click();
  });
  const drawer=page.getByRole('dialog',{name:'Your apps'});
  await drawer.waitFor();
  await settle(page);
  assert.equal(await page.locator('dialog[open]').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.vt||''),'');
  assert.equal(new URL(page.url()).pathname,'/weather/');
  await page.keyboard.press('Escape');
  await drawer.waitFor({state:'detached'});
  await page.getByRole('textbox',{name:'weather draft'}).waitFor();
  await t.clean();
 } finally {await t.ctx.close()}
});
