const {test}=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{resolve}=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const moduleURL=pathToFileURL(resolve(__dirname,'../today/public/roof/preload.js'));
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
async function scheduler(connection={effectiveType:'4g'}){
 const {createPreloader}=await import(moduleURL),controller=new AbortController(),scheduled=[],loaded=[],pending=[];
 let shown=true,connected=true;
 const value=createPreloader({signal:controller.signal,network:()=>connection,visible:()=>shown,online:()=>connected,eligible:()=>true,
 idle:fn=>{const task={fn};scheduled.push(task);return()=>task.cancelled=true},load:(app,options)=>{loaded.push(app);return new Promise(resolve=>pending.push({resolve,options}))}});
 return{...value,controller,connection,scheduled,loaded,pending,setShown:v=>shown=v,setOnline:v=>connected=v,async run(){const task=scheduled.shift();if(task&&!task.cancelled)task.fn();await tick()},async finish(v=true){pending.shift().resolve(v);await tick()}};
}
test('idle preloading is serial, bounded to two apps, deduplicated and prioritises intent',async()=>{
 const s=await scheduler();for(const app of ['weather','fitness','markets','chats'])s.request(app);await s.run();assert.deepEqual(s.loaded,['weather']);s.request('weather',{intent:true});assert.equal(s.scheduled.length,0);await s.finish();await s.run();assert.deepEqual(s.loaded,['weather','fitness']);await s.finish();await s.run();assert.equal(s.loaded.length,2);s.request('chats',{intent:true});await s.run();assert.deepEqual(s.loaded,['weather','fitness','chats']);await s.finish();s.dispose();
});
test('Save Data, slow networks, offline and hidden pages defer speculation, then recover',async()=>{
 for(const mode of ['saveData','slow-2g','2g','3g','downlink','offline','hidden']){
 const n={effectiveType:'4g'};if(mode==='saveData')n.saveData=true;else if(mode==='downlink')n.downlink=.7;else if(!['hidden','offline'].includes(mode))n.effectiveType=mode;
 const s=await scheduler(n);if(mode==='offline')s.setOnline(false);if(mode==='hidden')s.setShown(false);s.request('weather',{intent:true});assert.equal(s.scheduled.length,0,mode);Object.assign(n,{saveData:false,effectiveType:'4g',downlink:10});s.setOnline(true);s.setShown(true);s.wake();await s.run();assert.deepEqual(s.loaded,['weather']);await s.finish();s.dispose();
 }});
test('account teardown cancels deferred preloading and invalidates an in-flight import',async()=>{
 const s=await scheduler();s.request('weather');await s.run();assert.equal(s.pending[0].options.current(),true);s.controller.abort();assert.equal(s.pending[0].options.current(),false);await s.finish();s.request('fitness',{intent:true});assert.equal(s.loaded.length,1);assert.equal(s.scheduled.length,0);
});
function metrics(){
 let at=0;const doc=new EventTarget(),win=new EventTarget(),sent=[],frames=[];doc.visibilityState='visible';
 const ctx=vm.createContext({document:doc,navigator:{sendBeacon:(url,body)=>{sent.push({url,body});return true}},performance:{now:()=>at},Blob,matchMedia:()=>({matches:true}),requestAnimationFrame:fn=>frames.push(fn),addEventListener:win.addEventListener.bind(win),removeEventListener:win.removeEventListener.bind(win)});
 const source=readFileSync(resolve(__dirname,'../today/public/roof/performance.js'),'utf8').replace('export function','function');vm.runInContext(source+';globalThis.make=createShellPerformance',ctx);
 return{m:ctx.make(),sent,frames,at:v=>at=v,hide(){doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'))},show(){doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'))},pagehide(){win.dispatchEvent(new Event('pagehide'))},async payloads(){return Promise.all(sent.map(async s=>JSON.parse(await s.body.text())))}};
}
test('shell telemetry batches only coarse app timing maxima and bounded failure flags',async()=>{
 const h=metrics();let done=h.m.begin('weather',{cold:true});h.at(240);done();done('failure');h.at(400);done=h.m.begin('weather');h.at(450);done();h.at(500);done=h.m.begin('weather');h.at(590);done();h.m.begin('weather')('failure');h.m.begin('private-message-id')();h.hide();h.pagehide();const payloads=await h.payloads();assert.deepEqual(payloads,[{app:'weather',dev:'phone',m:{open_fail:1,cold:240,warm:90}}]);assert.equal(h.sent[0].url,'/api/vitals');h.m.dispose();
});
test('cancelled, background and retired-account switches do not become failed loads',async()=>{
 const h=metrics(),a=new AbortController();const old=h.m.begin('mail',{signal:a.signal});a.abort();old('failure');h.m.begin('weather')('cancelled');const background=h.m.begin('fitness');h.hide();h.at(5000);h.show();background();h.hide();assert.equal(h.sent.length,0);h.m.dispose();h.m.begin('weather')('failure');h.pagehide();assert.equal(h.sent.length,0);
});
test('telemetry is bounded per app, and startup finishes after paint exactly once',async()=>{
 const h=metrics();h.m.startup();h.at(900);h.frames.shift()();h.frames.shift()();h.m.startup();assert.equal(h.frames.length,0);h.hide();h.show();h.m.begin('today')();h.hide();h.show();h.m.begin('today')();h.hide();assert.equal(h.sent.length,2);assert.equal((await h.payloads())[0].m.startup,900);h.m.dispose();
});

test('the offline worker orders three-part builds numerically after the old series', () => {
  const src = readFileSync(require.resolve('../today/public/sw.js'), 'utf8');
  const { compareBuild, keepList } = vm.runInNewContext(src + '\n;({compareBuild,keepList})', {
    self: { location: new URL('https://inflite.ai/'), addEventListener() {} }, URL
  });
  const ordered = ['3.99', '4.01', '4.55', '4.6.1', '4.6.2', '4.6.10', '4.7.1', '5.0.1'];
  for (const [i, a] of ordered.entries()) for (const [j, b] of ordered.entries())
    assert.equal(Math.sign(compareBuild(a, b)), Math.sign(i - j));
  const files = ['/organise/releases/4.6.1/store.js'];
  assert.deepEqual(Array.from(keepList({ app: 'notes', build: '4.6.1', files })), files);
  assert.equal(keepList({ app: 'notes', build: '4.6.1.beta', files }), null);
});

test('the staged shell exposes one build to /version and the offline installer', async t => {
  const { mkdtempSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const { createHash } = require('node:crypto');
  const { transformSync } = require('esbuild');
  const { buildShellAssets } = await import('../tools/build-shell-assets.mjs');
  const { default: worker } = await import('../today/src/index.js');
  const temp = mkdtempSync(resolve(tmpdir(), 'shell-delivery-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const destination = resolve(temp, 'assets');
  buildShellAssets(destination, transformSync);
  const asset = path => readFileSync(resolve(destination, path === '/' ? 'index.html' : '.' + path));
  const origin = 'https://inflite.ai';
  const env = { ASSETS: { async fetch(request) {
    const pathname = new URL(request.url).pathname;
    const bytes = asset(pathname);
    if (request.headers.has('Range')) return new Response(bytes.subarray(0, 16384), { status: 206 });
    return new Response(bytes);
  } } };
  const sw = asset('/sw.js').toString();
  const release = /const RELEASE = "([^"]+)";/.exec(sw)[1];
  const version = await worker.fetch(new Request(origin + '/version'), env, {});
  assert.equal((await version.json()).build, release);
  assert.ok(asset('/app.js').includes('const BUILD = "' + release + '";'));
  assert.deepEqual(asset('/index.html'), readFileSync(resolve(__dirname, '../today/public/index.html')));
  const integrity = JSON.parse(/^const INTEGRITY = (.*);$/m.exec(sw)[1]);
  assert.ok(integrity['/'], 'the entry document is verified along with its scripts');
  for (const [path, hash] of Object.entries(integrity)) {
    assert.equal('sha256-' + createHash('sha256').update(asset(path)).digest('base64'), hash, path);
  }
  assert.notDeepEqual(asset('/roof/frame.js'), readFileSync(resolve(__dirname, '../today/public/roof/frame.js')));
});
