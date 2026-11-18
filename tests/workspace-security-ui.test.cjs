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

test('Search shows a late exact Drive match, previews the selected version and restores its filtered result', async () => {
  const { ctx, page, clean } = await open();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    const content = '<gpx><trk><trkseg><trkpt lat="52" lon="1"><ele>10</ele></trkpt><trkpt lat="52.1" lon="1"><ele>52</ele></trkpt></trkseg></trk></gpx>';
    const node = (n, name, kind, parentId = null) => ({
      id: String(n).padStart(32, '0'), name, kind, parentId, status: 'ready', version: 1,
      createdAt: 1, modifiedAt: n * 86400000, mime: kind === 'file' ? 'application/gpx+xml' : 'inode/directory',
      size: kind === 'file' ? content.length : 0
    });
    const archive = node(2, 'Archive', 'folder'), rides = node(3, 'Saturday rides', 'folder');
    const older = node(5, 'Coast route.gpx', 'file', archive.id), newest = node(7, older.name, 'file', rides.id);
    const noteText = 'A note with the coast route meeting point.';
    const note = { ...node(9, 'Ride plan.txt', 'file', rides.id), mime: 'text/plain', size: noteText.length };
    const contentsRead = [];
    let release;
    const delay = new Promise(resolve => { release = resolve; });
    await page.route('**/api/files/search', async r => {
      await delay;
      await r.fulfill({ json: { items: [{ ...older, folderName: archive.name }, { ...newest, folderName: rides.name }], ancestors: [], folder: null, revision: 1, cursor: null,
        usage: { used: 0, reserved: 0, limit: 1000, nodes: 4, nodeLimit: 5000, fileLimit: 26214400 } } });
    });
    await page.route('**/api/files/item?*', r => r.fulfill({ json: { item: [archive, rides, older, newest, note].find(x => x.id === new URL(r.request().url()).searchParams.get('id')) } }));
    await page.route('**/api/files/content?*', r => {
      contentsRead.push(new URL(r.request().url()).searchParams.get('id'));
      return r.fulfill({ body: contentsRead.at(-1) === note.id ? noteText : content, contentType: 'application/octet-stream' });
    });
    await page.evaluate(() => {
      audit.F.search.provide({ id: 'fixture-notes', group: 'Notes', search: () => [{ title: 'Planning the coast route', app: 'notes', run() {} }] });
      audit.F.search.open();
    });
    const search = page.getByRole('combobox', { name: 'Search everything' });
    await search.fill('coast route');
    await page.getByRole('option').filter({ hasText: 'Planning the coast route' }).waitFor();
    release();
    await page.getByRole('group', { name: 'Top hit' }).getByRole('option').filter({ hasText: 'Saturday rides' }).waitFor();
    await page.getByLabel('Filter by app').getByRole('button', { name: 'Files', exact: true }).click();
    const row = page.getByRole('option').filter({ hasText: 'Archive' });
    await row.waitFor();
    assert.deepEqual(contentsRead, []);
    await row.click();
    await page.getByRole('img', { name: 'Elevation profile' }).waitFor();
    assert.deepEqual(contentsRead, [older.id]);
    assert.match(await page.locator('[data-page=result]').innerText(), /11\.1 km · 42 m ascent/);
    await page.getByRole('button', { name: 'Back to results' }).click();
    assert.equal(await search.inputValue(), 'coast route');
    assert.equal(await page.getByLabel('Filter by app').getByRole('button', { name: 'Files', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await row.evaluate(el => el === document.activeElement && el.getAttribute('aria-selected') === 'true'), true);
    assert.equal(await page.getByRole('option').filter({ hasText: 'Planning the coast route' }).count(), 0);
    await page.route('**/api/organise/document-search', r => r.fulfill({ json: {
      hits: [{ id: note.id, name: note.name, version: note.version, snippet: 'Matching passage' }], scanned: 1, cursor: null
    } }));
    await page.getByLabel('Filter by app').getByRole('button', { name: 'All', exact: true }).click();
    await page.getByRole('option').filter({ hasText: 'Search inside documents' }).click();
    const documents = page.locator('dialog[data-sheet="document-search"]');
    await documents.getByRole('button').filter({ hasText: 'Matching passage' }).click();
    await documents.getByText(noteText, { exact: true }).waitFor();
    assert.deepEqual(contentsRead, [older.id, note.id]);
    await documents.getByRole('button', { name: 'Back', exact: true }).click();
    await documents.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await search.inputValue(), 'coast route');
    await page.evaluate(() => audit.F.sheet.top().now());
    await page.evaluate(id => audit.capabilities.fitness.openReference({ app: 'files', id }), older.id);
    await page.locator('dialog[data-sheet="file-preview"]').getByRole('img', { name: 'Elevation profile' }).waitFor();
    assert.deepEqual(contentsRead, [older.id, note.id, older.id]);
    await clean();
  } finally { await ctx.close(); }
});

test('cold record search opens the exact contact and Back restores the filtered results', async t => {
  const { ctx, page, clean } = await open();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    const kinds = ['people', 'notes', 'calendar'];
    const records = Object.fromEntries(kinds.map((kind, index) => [kind, {
      id: String(index + 1).repeat(32), kind, title: 'Coast ' + kind, version: 1, updatedAt: 1
    }]));
    const editors = [], searches = new Set();
    page.on('request', req => {
      if (/\/(people|notes|calendar)\/roof\/.*\.js$/.test(new URL(req.url()).pathname)) editors.push(req.url());
    });
    await page.route('**/api/organise/list', r => {
      const { kind, q } = r.request().postDataJSON();
      if (q === 'coast') searches.add(kind);
      return r.fulfill({ json: { records: q === 'coast' ? [records[kind]] : [], cursor: null } });
    });
    await page.route('**/people/version', r => r.fulfill({ json: { build: '4.31' } }));
    await page.route('**/api/organise/record?*', r => {
      assert.equal(new URL(r.request().url()).searchParams.get('id'), records.people.id);
      return r.fulfill({ json: { record: records.people } });
    });
    await page.evaluate(() => {
      Object.assign(audit.enabled, { people: true, notes: true, calendar: true });
      audit.F.setRoof(undefined, audit.enabled);
      audit.F.search.open();
    });
    const input = page.getByRole('combobox', { name: 'Search everything' });
    await page.evaluate(() => performance.mark('start-record-search'));
    await input.fill('coast');
    const row = page.getByRole('option').filter({ hasText: records.people.title });
    await row.first().waitFor();
    const sample = await page.evaluate(() => {
      const start = performance.getEntriesByName('start-record-search')[0].startTime;
      const resources = performance.getEntriesByType('resource').filter(e => e.startTime >= start);
      return { milliseconds: Math.round(performance.now() - start),
        decodedResponseBytes: resources.reduce((total, entry) => total + entry.decodedBodySize, 0) };
    });
    for (const record of Object.values(records)) await page.getByRole('option').filter({ hasText: record.title }).first().waitFor();
    assert.deepEqual([...searches].sort(), [...kinds].sort());
    assert.deepEqual(editors, []);
    t.diagnostic(JSON.stringify({ ...sample, editorModulesRequested: editors.length }));
    const filter = page.getByLabel('Filter by app').getByRole('button', { name: 'People', exact: true });
    await filter.click();
    await row.click();
    await page.getByRole('button', { name: 'Open in People' }).click();
    await page.waitForURL('**/people/#item=' + records.people.id);
    await page.locator('#m-people').getByText(records.people.title, { exact: true }).first().waitFor();
    await page.evaluate(() => audit.F.nav.back());
    await row.waitFor();
    assert.equal(await input.inputValue(), 'coast');
    assert.equal(await filter.getAttribute('aria-pressed'), 'true');
    assert.equal(await row.getAttribute('aria-selected'), 'true');
    await clean();
  } finally { await ctx.close(); }
});
