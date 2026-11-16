// Real shared shell, menu, sheets, controls and theme code. Sample rendered
// pixels behind real text, including the blurred/composited material backdrop.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{resolve,extname}=require('node:path');
const {chromium,webkit}=require('playwright');
const PUBLIC=resolve(__dirname,'../today/public'),ORIGIN='https://inflite.ai';
const palettes=['inflite','coast','iris','ember','rose','graphite'];
let browser;
before(async()=>{browser=process.env.WEB_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']})});
after(async()=>browser?.close());
const fixture=`import * as ui from '/roof/ui.js';import {createSheets} from '/roof/sheet.js';import {createWorkspaceView} from '/roof/workspace-view.js';
const el=ui.el,ac=new AbortController(),T=window.T={ac};
const view=T.view=createWorkspaceView(document.querySelector('main'),{signal:ac.signal,onToday(){},onApp(){},onFiles(){},onSettings(){},onSearch(){},onWindowChange(){}});
const home={mode:'today',workspaces:[],apps:[{id:'notes',name:'Notes',available:true},{id:'people',name:'People',available:true},{id:'fitness',name:'Fitness',available:true}],user:{name:'Example User'}};view.update(home);
T.home=()=>view.update(home);
T.window=()=>{view.update({...home,mode:'workspace',foregroundApp:'fitness',paneApps:['fitness'],layout:{mode:'float',windows:{fitness:{x:.06,y:.05,w:.8,h:.85,minimized:false}},order:['fitness']}});view.setPane('fitness',{title:'Fitness',line:'Secondary floating window text',busy:false});if(!T.windowBackdrop){T.windowBackdrop=el('div',{class:'material-window-backdrop'});document.querySelector('.ws-pane-grid').prepend(T.windowBackdrop);view.slots.fitness.append(el('p',{class:'ifl-sub',text:'Floating app content stays readable'}))}};
const backdrop=el('article',{class:'material-backdrop'}),card=ui.card({title:'Material content',body:[el('p',{class:'ifl-sub',text:'Secondary material text'}),ui.field({label:'Material field',value:'Keep this draft'}),ui.iconBtn('plus',{label:'Material icon'}),ui.btn('Open account menu',{run:()=>T.menu()})]});
backdrop.append(card);view.slots.today.append(backdrop);T.card=card;
T.menu=()=>IFL.menu(card.querySelector('.ifl-btn'),{app:'today',build:'test',me:{name:'Example User',line:'Secondary account text'},rows:[{icon:'settings',label:'Appearance',value:'System',open(){}}],account(){},signOut(){}});
T.sheets=createSheets({ui,signal:ac.signal});T.sheet=()=>{T.handle=T.sheets.open({sheet:'material-test',title:'Material sheet',body:el('section',{},el('p',{class:'ifl-sub',text:'Secondary sheet text'}),ui.field({label:'Sheet field',value:'Keep my sheet draft'}),ui.iconBtn('plus',{label:'Sheet icon'})),acts:[{label:'Delete example',destructive:true},{label:'Continue',primary:true}]})};
// This component fixture owns its mounted view instead of loading app.js.
globalThis.__iflSessionStarted=true;document.documentElement.classList.remove('boot');T.ready=true;`;
const layout=`html,body{margin:0;min-height:100%;}.material-backdrop{position:fixed;inset:0;overflow:auto;padding:120px 32px 150px 280px;background:repeating-conic-gradient(from 25deg,#fff 0 25%,#a9ccf4 0 50%) 0/72px 72px;}.material-backdrop[data-busy=dark]{background:repeating-conic-gradient(from 25deg,#000 0 25%,#193c67 0 50%) 0/72px 72px;}.material-window-backdrop{position:absolute;inset:0;pointer-events:none;background:repeating-conic-gradient(from 25deg,#fff 0 25%,#a9ccf4 0 50%) 0/72px 72px;}.material-window-backdrop[data-busy=dark]{background:repeating-conic-gradient(from 25deg,#000 0 25%,#193c67 0 50%) 0/72px 72px;}.material-backdrop>.ifl-card{max-width:480px;} .material-backdrop .ifl-field{margin:20px 0;} .material-backdrop .ifl-btn{margin-left:16px;} @media(max-width:700px){.material-backdrop{padding:110px 20px 130px;}}`;
const preferenceQuery={transparency:'prefers-reduced-transparency',contrast:'prefers-contrast'};
async function open({preference=null,motion='no-preference',width=1100}={}){
 const ctx=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,reducedMotion:motion,serviceWorkers:'block'}),errors=[];
 await ctx.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.protocol==='blob:')return route.continue();if(url.origin!==ORIGIN)return route.abort();
  if(url.pathname==='/account/api/account/appearance')return route.fulfill({json:{signedIn:false}});
  if(url.pathname==='/api/vitals')return route.fulfill({status:204,body:''});
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/theme.js"></script><script src="/shared-menu.js"></script><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/roof/controls.css"><link rel="stylesheet" href="/roof/workspace.css"><link rel="stylesheet" href="/fixture.css"></head><body><main></main><script type="module" src="/fixture.js"></script></body></html>'});
  if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:fixture});
  if(url.pathname==='/fixture.css')return route.fulfill({contentType:'text/css',body:layout});
  if(url.pathname==='/shared-menu.js'){
   const source=readFileSync(resolve(PUBLIC,'app.js'),'utf8'),start=source.indexOf('// ==== InFlite\'s menu, shared:'),end='// ==== end of InFlite\'s menu ====';
   assert.ok(start>=0&&source.indexOf(end,start)>start,'actual shared menu is available');return route.fulfill({contentType:'text/javascript',body:source.slice(start,source.indexOf(end,start)+end.length)+'\nwindow.IFL=IFL;'});
  }
  try{
   const file=resolve(PUBLIC,'.'+url.pathname);if(!file.startsWith(PUBLIC+'/'))return route.abort();let body=readFileSync(file);
   // WebKit/Playwright has no reduced-transparency emulation API. Replace only
   // the media condition, retaining the exact production fallback declarations.
   if(preference&&url.pathname.endsWith('.css'))body=body.toString().replace(new RegExp('\\('+preferenceQuery[preference]+':\\s*'+(preference==='contrast'?'more':'reduce')+'\\)','g'),'(min-width: 0px)');
   return route.fulfill({contentType:{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream',body});
  }catch{return route.fulfill({status:404,body:''})}
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(ORIGIN);await page.waitForFunction(()=>window.T?.ready);await settle(page);return{ctx,page,errors};
}
async function settle(page){await page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.allSettled(document.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})}
async function pointerText(page,selector){await page.locator(selector).first().hover();await settle(page)}
async function theme(page,palette,appearance){await page.evaluate(p=>InFliteAppearance.accept(p),{palette,appearance});await settle(page)}

async function contrastSamples(page,selectors){
 const probes=await page.evaluate(selectors=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const paint=canvas.getContext('2d');window.__materialHidden=[];
  return selectors.flatMap(selector=>[...document.querySelectorAll(selector)].map(node=>{
   const rect=node.getBoundingClientRect(),style=getComputedStyle(node);if(rect.width<1||rect.height<1||rect.top<0||rect.bottom>innerHeight||style.visibility==='hidden')return null;
   paint.clearRect(0,0,1,1);paint.fillStyle=style.color;paint.fillRect(0,0,1,1);const ink=[...paint.getImageData(0,0,1,1).data];
   window.__materialHidden.push([node,node.getAttribute('style')]);node.style.setProperty('color','transparent','important');node.style.setProperty('-webkit-text-fill-color','transparent','important');node.style.setProperty('text-shadow','none','important');if(node.matches('input'))node.style.setProperty('caret-color','transparent','important');
   return{selector,text:node.value||node.textContent,ink,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
  }).filter(Boolean));
 },selectors);
 assert.ok(probes.length>=2,'real material text and secondary text are present');
 try{
  const png=await page.screenshot({caret:'hide'});
  return await page.evaluate(async({data,probes})=>{
   const picture=new Image();picture.src='data:image/png;base64,'+data;await picture.decode();const canvas=document.createElement('canvas');canvas.width=picture.width;canvas.height=picture.height;const p=canvas.getContext('2d');p.drawImage(picture,0,0);
   const lum=c=>c.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
   return probes.map(probe=>{
    let minimum=Infinity,worst=null;for(const fx of [.15,.35,.5,.65,.85])for(const fy of [.3,.5,.7]){
     const x=Math.min(canvas.width-1,Math.max(0,Math.floor(probe.rect.x+probe.rect.width*fx))),y=Math.min(canvas.height-1,Math.max(0,Math.floor(probe.rect.y+probe.rect.height*fy))),bg=[...p.getImageData(x,y,1,1).data],a=probe.ink[3]/255,foreground=probe.ink.slice(0,3).map((v,i)=>v*a+bg[i]*(1-a)),l1=lum(foreground),l2=lum(bg);const ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);if(ratio<minimum){minimum=ratio;worst={x,y,bg,foreground,ink:probe.ink,rect:probe.rect}};
    }return{selector:probe.selector,text:probe.text,contrast:minimum,worst};
   });
  },{data:png.toString('base64'),probes});
 }finally{await page.evaluate(()=>{for(const [node,style]of window.__materialHidden)style===null?node.removeAttribute('style'):node.setAttribute('style',style);delete window.__materialHidden})}
}
function readable(samples,label){for(const sample of samples)assert.ok(sample.contrast>=4.5,`${label} ${sample.selector} ${JSON.stringify(sample.text)} contrast ${sample.contrast.toFixed(2)} < 4.5 ${JSON.stringify(sample.worst)}`)}

test('all palettes and glass intensity extremes keep actual material text readable over busy light and dark content',async()=>{
 const t=await open();try{
  for(const strength of (process.env.GLASS_TEST_STRENGTHS||'0,70,100').split(',').map(Number))for(const palette of palettes)for(const appearance of ['light','dark'])for(const backdrop of ['light','dark']){
   await theme(t.page,palette,appearance);await t.page.evaluate(glassStrength=>InFliteAppearance.setGlass({glass:true,glassStrength}),strength);await t.page.locator('.material-backdrop').evaluate((n,v)=>n.dataset.busy=v,backdrop);const label=palette+'/'+appearance+'/'+backdrop+'/'+strength;
   await pointerText(t.page,'.ifl-card-t');readable(await contrastSamples(t.page,['.ifl-card-t','.ifl-card>.ifl-sub','.ifl-field input','.ws-dock-label']),label+'/shell');
   await t.page.evaluate(()=>T.menu());await settle(t.page);await pointerText(t.page,'.ifm-who small');readable(await contrastSamples(t.page,['.ifm-who b','.ifm-who small','.ifm-l','.ifm-val']),label+'/menu');await t.page.evaluate(()=>IFL.close(true));
   await t.page.evaluate(()=>T.sheet());await settle(t.page);await pointerText(t.page,'.ifl-sheet .ifl-sub');readable(await contrastSamples(t.page,['.ifl-sheet h2','.ifl-sheet .ifl-sub','.ifl-sheet .ifl-field input','.ifl-sheet .ifl-btn.destructive']),label+'/sheet');await t.page.evaluate(()=>T.handle.now());
   assert.equal(await t.page.getByRole('textbox',{name:'Material field',exact:true}).inputValue(),'Keep this draft');
  }
  assert.deepEqual(t.errors,[]);
 }catch(error){await t.page.screenshot({path:'/tmp/inflite-glass-material-failure-'+(process.env.WEB_UI_BROWSER||'chromium')+'.png',caret:'hide'});throw error}finally{await t.ctx.close()}
});

// Sample the displayed material itself with its content hidden, retaining real
// parent/header layers and blur. A strong tint alone must not masquerade as glass.
async function materialSwatch(page,selector,backdrop){
 const hidden=await page.locator(selector).first().evaluate((node,backdrop)=>{
  const children=[...node.children].map(n=>[n,n.getAttribute('style')]);window.__swatchChildren=children;for(const[n]of children)n.style.visibility='hidden';
  const backgrounds=[...document.querySelectorAll('.material-backdrop,.material-window-backdrop')].map(n=>[n,n.getAttribute('style')]);window.__swatchBackgrounds=backgrounds;for(const[n]of backgrounds)n.style.background=backdrop;
  const r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(r.width<3||r.height<3||x<2||y<2||x>innerWidth-2||y>innerHeight-2)throw Error('Material swatch is outside its real viewport');return {x,y};
 },backdrop);
 try{await settle(page);const png=await page.screenshot({caret:'hide'});return await page.evaluate(async({data,point})=>{const im=new Image();im.src='data:image/png;base64,'+data;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const p=c.getContext('2d');p.drawImage(im,0,0);const x=Math.floor(point.x),y=Math.floor(point.y),v=[...p.getImageData(x-1,y-1,3,3).data];return [0,1,2].map(channel=>v.filter((_,i)=>i%4===channel).reduce((a,b)=>a+b,0)/9)},{data:png.toString('base64'),point:hidden})}
 finally{await page.evaluate(()=>{for(const key of ['__swatchChildren','__swatchBackgrounds']){for(const[n,style]of window[key])style===null?n.removeAttribute('style'):n.setAttribute('style',style);delete window[key]}});await settle(page)}
}
async function visibleGlass(page,selector,label,minimum){
 const light=await materialSwatch(page,selector,'rgb(255 255 255)'),dark=await materialSwatch(page,selector,'rgb(0 0 0)'),delta=light.reduce((sum,v,i)=>sum+Math.abs(v-dark[i]),0)/3;
 assert.ok(delta>=minimum,`${label} must show its real backdrop, delta ${delta.toFixed(2)} < ${minimum}: ${JSON.stringify({light,dark})}`);return delta;
}
test('floating windows, sheets and dock reveal the actual backdrop while glass off is opaque',async()=>{
 const t=await open({motion:'reduce',width:1440});try{
  for(const appearance of ['light','dark'])for(const glassStrength of [70,100]){
   await theme(t.page,'inflite',appearance);await t.page.evaluate(glassStrength=>InFliteAppearance.setGlass({glass:true,glassStrength}),glassStrength);await settle(t.page);
   await visibleGlass(t.page,'.ws-dock',`dock/${appearance}/${glassStrength}`,18);
   await t.page.evaluate(()=>T.sheet());await settle(t.page);await visibleGlass(t.page,'dialog.ifl-sheet',`sheet/${appearance}/${glassStrength}`,12);await t.page.evaluate(()=>T.handle.now());
   await t.page.evaluate(()=>T.window());await settle(t.page);await visibleGlass(t.page,'.ws-pane-grid>.ifl-workspace-pane[data-pane=fitness]',`window/${appearance}/${glassStrength}`,12);await visibleGlass(t.page,'.ws-pane-grid>.ifl-workspace-pane[data-pane=fitness] .ws-pane-header',`window header/${appearance}/${glassStrength}`,12);await t.page.screenshot({path:'/tmp/inflite404-release/window-'+(process.env.WEB_UI_BROWSER||'chromium')+'-'+appearance+'-'+glassStrength+'.png',caret:'hide'});
   const filter=await t.page.locator('.ws-pane-grid>.ifl-workspace-pane[data-pane=fitness]').evaluate(n=>getComputedStyle(n).backdropFilter||getComputedStyle(n).webkitBackdropFilter||'none');assert.match(filter,/blur\(/,'actual floating window filters its backdrop');
   await t.page.evaluate(()=>T.home());await settle(t.page);
  }
  await t.page.evaluate(()=>InFliteAppearance.setGlass({glass:false}));await t.page.evaluate(()=>T.sheet());await settle(t.page);await opaque(t.page,'master glass off');await t.page.evaluate(()=>T.handle.now());await t.page.evaluate(()=>T.window());await settle(t.page);await opaque(t.page,'master glass off/window');
  const light=await materialSwatch(t.page,'.ws-pane-grid>.ifl-workspace-pane[data-pane=fitness]','white'),dark=await materialSwatch(t.page,'.ws-pane-grid>.ifl-workspace-pane[data-pane=fitness]','black');assert.ok(light.every((v,i)=>Math.abs(v-dark[i])<=2),'off removes floating-window transparency');assert.deepEqual(t.errors,[]);
 }catch(error){await t.page.screenshot({path:'/tmp/inflite404-transparency-failure-'+(process.env.WEB_UI_BROWSER||'chromium')+'.png'});throw error}finally{await t.ctx.close()}
});
test('actual floating window headings and secondary text keep contrast in every palette',async()=>{
 const t=await open({width:1440});try{
  await t.page.evaluate(()=>T.window());await settle(t.page);
  const strengths=process.env.GLASS_TEST_STRENGTHS?process.env.GLASS_TEST_STRENGTHS.split(',').map(Number):[0,70,100];
  for(const strength of strengths)for(const palette of palettes)for(const appearance of ['light','dark'])for(const backdrop of ['light','dark']){
   await theme(t.page,palette,appearance);await t.page.evaluate(glassStrength=>InFliteAppearance.setGlass({glass:true,glassStrength}),strength);await t.page.locator('.material-window-backdrop').evaluate((n,v)=>n.dataset.busy=v,backdrop);await pointerText(t.page,'.ws-pane-grid>.ifl-workspace-pane[data-pane=fitness] .ws-pane-line');readable(await contrastSamples(t.page,['.ws-pane-grid>.ifl-workspace-pane[data-pane=fitness] .ws-pane-title','.ws-pane-grid>.ifl-workspace-pane[data-pane=fitness] .ws-pane-line','.ws-pane-grid>.ifl-workspace-pane[data-pane=fitness] .ws-module-slot .ifl-sub']),`window/${palette}/${appearance}/${backdrop}/${strength}`);
  }assert.deepEqual(t.errors,[]);
 }catch(error){await t.page.screenshot({path:'/tmp/inflite404-window-contrast-failure-'+(process.env.WEB_UI_BROWSER||'chromium')+'.png'});throw error}finally{await t.ctx.close()}
});

async function opaque(page,label){
 const values=await page.evaluate(()=>['.ws-dock','dialog.ifl-sheet','.ifm-pop','.ifl-field','.ws-pane-grid>.ifl-workspace-pane[data-pane=fitness]'].flatMap(selector=>[...document.querySelectorAll(selector)].filter(n=>n.getClientRects().length).map(n=>{
  const s=getComputedStyle(n),canvas=document.createElement('canvas');canvas.width=canvas.height=1;const c=canvas.getContext('2d');c.fillStyle=s.backgroundColor;c.fillRect(0,0,1,1);return{selector,alpha:c.getImageData(0,0,1,1).data[3],filter:s.backdropFilter||s.webkitBackdropFilter||'none',background:s.backgroundColor};
 })));
 assert.ok(values.length>=2,label+' representative layers present');for(const v of values){assert.equal(v.alpha,255,label+' '+v.selector+' opaque '+v.background);assert.equal(v.filter,'none',label+' '+v.selector+' removes backdrop filtering')}
}
async function runtimePreference(page,preference){
 await page.evaluate(feature=>{let activated=0;const visit=rules=>{for(const rule of rules){if(rule.media?.mediaText.includes(feature)){rule.media.mediaText='all';activated++}if(rule.cssRules)visit(rule.cssRules)}};for(const sheet of document.styleSheets)visit(sheet.cssRules);if(!activated)throw Error('No production fallback for '+feature)},preferenceQuery[preference]);await settle(page);
}
for(const preference of ['transparency','contrast'])test(preference+' preference is opaque at startup and when changed on an open layer',async()=>{
 for(const startup of [false,true]){
  const t=await open({preference:startup?preference:null});try{
   await t.page.evaluate(()=>T.sheet());await settle(t.page);if(!startup)await runtimePreference(t.page,preference);
   for(const palette of palettes)for(const appearance of ['light','dark']){await theme(t.page,palette,appearance);await opaque(t.page,preference+'/'+startup+'/'+palette+'/'+appearance)}
   await t.page.evaluate(()=>T.handle.now());await t.page.evaluate(()=>T.menu());await settle(t.page);await opaque(t.page,preference+'/'+startup+'/menu');await t.page.evaluate(()=>IFL.close(true));await t.page.evaluate(()=>T.window());await settle(t.page);await opaque(t.page,preference+'/'+startup+'/window');assert.deepEqual(t.errors,[]);
  }finally{await t.ctx.close()}
 }
});

test('shared sheets and controls keep rounded 44px targets, sans typography and finite accessible motion',async()=>{
 for(const motion of ['no-preference','reduce'])for(const width of [390,1440]){
  const t=await open({motion,width});try{
   await t.page.evaluate(()=>T.sheet());
   const animation=await t.page.locator('dialog.ifl-sheet').evaluate(n=>({font:getComputedStyle(n.querySelector('h2')).fontFamily,animations:n.getAnimations({subtree:true}).map(a=>({iterations:a.effect.getTiming().iterations,duration:a.effect.getTiming().duration,frames:a.effect.getKeyframes().map(k=>k.transform).filter(Boolean)}))}));
   assert.doesNotMatch(animation.font,/Times|(?:^|[,\s])serif(?:,|$)/i);for(const a of animation.animations){assert.ok(Number.isFinite(a.iterations));assert.ok(Number(a.duration)<=1000);if(motion==='reduce')assert.ok(a.frames.every(f=>f==='none'),'reduced motion removes sheet movement')}
   await settle(t.page);for(const selector of ['dialog.ifl-sheet .ifl-icon-btn','dialog.ifl-sheet .ifs-btn'])for(const node of await t.page.locator(selector).all()){
    if(!await node.isVisible())continue;const size=await node.evaluate(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n),p=getComputedStyle(n,'::after'),outset=p.content!=='none'?Math.max(0,(44-Math.min(r.width,r.height))/2):0,hit=(x,y)=>n.contains(document.elementFromPoint(x,y));return{w:r.width+outset*2,h:r.height+outset*2,radius:parseFloat(s.borderTopLeftRadius),expandedHit:!outset||[hit(r.x-outset+1,r.y+r.height/2),hit(r.right+outset-1,r.y+r.height/2),hit(r.x+r.width/2,r.y-outset+1),hit(r.x+r.width/2,r.bottom+outset-1)].every(Boolean)}});
    assert.ok(size.w>=44&&size.h>=44&&size.expandedHit,selector+' actual pointer target '+JSON.stringify(size));assert.ok(size.radius>=16,selector+' rounded target');
   }
   const field=t.page.getByRole('textbox',{name:'Sheet field',exact:true});await field.fill('Retain this focused draft');await field.focus();await theme(t.page,'iris','dark');assert.equal(await field.evaluate(n=>n===document.activeElement),true);assert.equal(await field.inputValue(),'Retain this focused draft');
   assert.equal(await t.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(t.errors,[]);
  }finally{await t.ctx.close()}
 }
});
