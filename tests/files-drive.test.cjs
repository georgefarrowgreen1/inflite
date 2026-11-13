const { test } = require('node:test');
const assert = require('node:assert/strict');
const source = import('../today/public/roof/files-drive.js');
const A = 'a'.repeat(32), B = 'b'.repeat(32), OP = 'c'.repeat(32), MAX = 25 * 1024 * 1024;
const item = patch => ({ id: A, parentId: null, kind: 'file', name: 'Notes.txt', mime: 'text/plain', size: 4, createdAt: 1700000000000, modifiedAt: 1700000000001, version: 1, status: 'ready', ...patch });
const folder = patch => item({ kind: 'folder', name: 'Private folder', mime: 'inode/directory', size: 0, ...patch });
const listing = patch => ({ folder: null, ancestors: [], items: [item()], cursor: null, revision: 1, usage: { used: 4, reserved: 0, limit: 1024, nodes: 1, nodeLimit: 100, fileLimit: MAX }, ...patch });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function lifetime() {
  const controller = new AbortController(), listeners = new Set();
  const add = controller.signal.addEventListener.bind(controller.signal), remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (type, fn, opts) => { if (type === 'abort') listeners.add(fn); return add(type, fn, opts); };
  controller.signal.removeEventListener = (type, fn, opts) => { if (type === 'abort') listeners.delete(fn); return remove(type, fn, opts); };
  return { ...controller, signal: controller.signal, abort: () => controller.abort(), listeners };
}
async function harness(run, options = {}) {
  const mod = await source, life = lifetime(), calls = [], timers = new Map(), instances = [];
  const F = { session: { view: { user: { id: 'owner-a' } }, lost() { F.lost++; } }, signal: life.signal, lost: 0 };
  const previous = { fetch: global.fetch, XMLHttpRequest: global.XMLHttpRequest, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
  let nextTimer = 0;
  global.setTimeout = fn => { timers.set(++nextTimer, fn); return nextTimer; };
  global.clearTimeout = id => timers.delete(id);
  global.fetch = async (url, spec = {}) => { calls.push({ url, spec }); return options.fetch ? options.fetch(url, spec) : Response.json(options.answer || { item: item() }); };
  class XHR {
    constructor() { if (options.throwAt === 'constructor') throw Error('xhr constructor failed'); this.upload = {}; this.headers = {}; this.status = 0; this.responseText = ''; instances.push(this); }
    open(...args) { if (options.throwAt === 'open') throw Error('xhr open failed'); this.opened = args; }
    setRequestHeader(name, value) { if (options.throwAt === 'header') throw Error('xhr header failed'); this.headers[name] = value; }
    send(body) { if (options.throwAt === 'send') throw Error('xhr send failed'); this.sent = body; }
    abort() { this.aborted = true; this.onabort?.(); }
    progress(loaded) { this.upload.onprogress?.({ loaded, total: 999999, lengthComputable: true }); }
    load(value = { item: item() }, status = 200) { this.status = status; this.responseText = typeof value === 'string' ? value : JSON.stringify(value); this.onload?.(); }
  }
  global.XMLHttpRequest = XHR;
  const client = mod.createDriveClient(F);
  const clean = () => { assert.equal(timers.size, 0, 'operation timer released'); assert.equal(life.listeners.size, 1, 'only client lifetime abort listener remains'); };
  try { await run({ ...mod, F, life, calls, timers, instances, client, clean }); }
  finally { client.destroy(); Object.assign(global, previous); }
}
const abortError = error => error?.name === 'AbortError';

test('opaque Drive IDs are exact bounded strings and item parsing drops all server-private fields', async () => {
  const { driveId, driveItem } = await source;
  assert.equal(driveId(A), true);
  for (const id of [null, {}, 3, '', 'a'.repeat(31), 'a'.repeat(33), '../' + 'a'.repeat(29), A + '\n', 'a'.repeat(31) + '%', 'é'.repeat(32)]) assert.equal(driveId(id), false);
  const parsed = driveItem({ ...item(), ownerId: 'foreign', objectKey: 'secret/key', uploadNonce: 'secret', token: 'secret' });
  assert.deepEqual(parsed, item());
  assert.notEqual(parsed, item());
});

test('malformed, oversized and unbounded item fields cannot enter the explorer', async () => {
  const { driveItem } = await source;
  for (const patch of [{ id: 'bad' }, { parentId: undefined }, { kind: 'link' }, { status: 'deleted' }, { version: 0 }, { version: 1.2 }, { size: -1 }, { size: MAX + 1 }, { size: Infinity }, { createdAt: NaN }, { modifiedAt: Infinity }, { name: '' }, { name: 'a'.repeat(256) }, { name: 'bad\nname' }, { mime: 'text/html; charset=utf-8' }]) assert.equal(driveItem(item(patch)), null, JSON.stringify(patch));
  assert.deepEqual(driveItem(item({ size: MAX })), item({ size: MAX }));
});

test('folder records cannot claim file bytes', async () => {
  const { driveItem } = await source;
  assert.deepEqual(driveItem(folder()), folder());
  assert.equal(driveItem(folder({ size: 1 })), null);
});

test('folder pages parse bounded whitelisted metadata and reject malformed graph envelopes', async () => {
  await harness(async ({ client, clean }) => { assert.deepEqual(await client.browse(), listing()); clean(); }, { answer: { ...listing(), token: 'secret', usage: { ...listing().usage, accountId: 'foreign' } } });
  for (const patch of [{ items: new Array(101).fill(item()) }, { ancestors: new Array(17).fill(folder()) }, { revision: 0 }, { cursor: 'private filename' }, { cursor: ['1:20'] }, { items: [item({ id: 'bad' })] }, { ancestors: [item()] }, { folder: item() }, { usage: { ...listing().usage, used: -1 } }]) {
    await harness(async ({ client, FilesError, clean }) => { await assert.rejects(client.browse(), FilesError, JSON.stringify(patch)); clean(); }, { answer: listing(patch) });
  }
});

test('search terms and file names stay in JSON bodies while endpoint and query vocabulary are fixed', async () => {
  await harness(async ({ client, calls, clean }) => {
    await client.browse({ parentId: B, view: 'folder', cursor: '1:20', query: 'Private holiday 2026' });
    assert.equal(calls[0].url, '/api/files/search');
    assert.deepEqual(JSON.parse(calls[0].spec.body), { parentId: B, view: 'folder', cursor: '1:20', sort: 'name', q: 'Private holiday 2026' });
    assert.equal(calls[0].spec.method, 'POST');
    assert.equal(calls[0].spec.headers['X-Inflite'], '1');
    for (const call of calls) { assert.equal(call.spec.credentials, 'same-origin'); assert.equal(call.spec.mode, 'same-origin'); assert.equal(call.spec.cache, 'no-store'); assert.equal(call.spec.redirect, 'error'); assert.equal(call.url.includes('Private'), false); }
    clean();
  }, { answer: listing() });
});

test('GET browsing admits only numeric cursors and rejects arbitrary cursor objects before network access', async () => {
  for (const cursor of ['Private diary', '?token=secret', '1:20000', '1:0&name=secret', {}, [], 123]) await harness(async ({ client, calls }) => { await assert.rejects(client.browse({ cursor })); assert.equal(calls.length, 0); });
  await harness(async ({ client, calls, clean }) => { await client.browse({ cursor: '123:20' }); assert.equal(calls[0].url, '/api/files/list?view=folder&cursor=123%3A20&sort=name'); clean(); }, { answer: listing() });
});

test('caller lease extras cannot override the fixed URL, HTTP method, payload or privacy policy', async () => {
  await harness(async ({ client, calls, clean }) => {
    await client.item(A, { query: { name: 'Private diary' }, method: 'POST', body: { token: 'secret' }, credentials: 'include', redirect: 'follow' });
    assert.equal(calls[0].url, '/api/files/item?id=' + A);
    assert.equal(calls[0].spec.method, 'GET'); assert.equal('body' in calls[0].spec, false);
    clean();
  });
});

test('every mutation preserves its fixed method and confines names to the JSON body', async () => {
  await harness(async ({ client, calls, clean }) => {
    await client.createFolder('Private folder', null, OP);
    await client.reserve({ name: 'Private.txt', parentId: B, mime: 'text/plain', size: 4, operationId: OP });
    await client.rename(A, 2, 'Private rename.txt'); await client.move(A, 2, B); await client.remove(A, 2);
    assert.deepEqual(calls.map(c => [c.url, c.spec.method]), [['/api/files/folders','POST'], ['/api/files/uploads','POST'], ['/api/files/item','PATCH'], ['/api/files/move','POST'], ['/api/files/item?id=' + A + '&version=2','DELETE']]);
    assert.ok(calls.every(c => c.spec.headers['X-Inflite'] === '1' && !c.url.includes('Private'))); clean();
  });
});

test('stale, aborted or destroyed account owners cannot issue any request', async () => {
  for (const mode of ['owner', 'caller', 'frame', 'destroy']) await harness(async ({ client, F, life, calls }) => {
    if (mode === 'owner') F.session.view.user.id = 'owner-b'; if (mode === 'frame') life.abort(); if (mode === 'destroy') client.destroy();
    await assert.rejects(client.item(A, { current: () => mode !== 'caller' }), abortError); assert.equal(calls.length, 0);
  });
});

test('account and caller changes after transport or body reads fence stale results', async () => {
  for (const phase of ['response','body']) for (const owner of [true,false]) {
    const gate = deferred(); let active = true;
    await harness(async ({ client, F, clean }) => {
      const pending = client.item(A, { current: () => active }); await Promise.resolve();
      if (owner) F.session.view.user.id = 'owner-b'; else active = false;
      gate.resolve(phase === 'response' ? Response.json({ item: item() }) : JSON.stringify({ item: item() }));
      await assert.rejects(pending, abortError); clean();
    }, { fetch: () => phase === 'response' ? gate.promise : { ok:true,status:200,text:()=>gate.promise } });
  }
});

test('external cancellation and operation timeouts release request listeners and timers', async () => {
  for (const mode of ['caller','timeout']) await harness(async ({ client, timers, clean }) => {
    const external=lifetime(), pending=client.item(A,{signal:external.signal}); await Promise.resolve();
    if(mode==='caller')external.abort();else [...timers.values()][0]();
    await assert.rejects(pending,mode==='timeout'?e=>e.name==='FilesError'&&e.status===408:abortError); assert.equal(external.listeners.size,0); clean();
  }, { fetch: (_u,spec) => new Promise((_resolve,reject)=>spec.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})) });
});

test('JSON failures are bounded FilesErrors and a current401 releases the session once', async () => {
  for (const answer of ['{broken', 'x'.repeat(128*1024+1)]) await harness(async ({client,FilesError,clean})=>{await assert.rejects(client.item(A),FilesError);clean();},{fetch:()=>new Response(answer,{status:200})});
  await harness(async ({client,F,FilesError,clean})=>{await assert.rejects(client.item(A),e=>e instanceof FilesError&&e.status===401&&!e.message.includes('\n'));assert.equal(F.lost,1);clean();},{fetch:()=>Response.json({error:'Sign\nin again'},{status:401})});
});

test('advertised oversized JSON answers are rejected before consuming their bodies', async () => {
  let read=false;
  await harness(async ({client})=>{await assert.rejects(client.item(A));assert.equal(read,false);},{fetch:()=>({ok:true,status:200,headers:new Headers({'content-length':String(128*1024+1)}),text:async()=>{read=true;return 'x'.repeat(128*1024+1);}})});
});

test('content uses only the opaque ID and rejects unsafe types/advertised oversize before reading bytes', async () => {
  for(const headers of [{'content-type':'text/html'},{'content-type':'application/octet-stream','content-length':String(MAX+1)}]) {
    let read=false;await harness(async({client,calls,clean})=>{await assert.rejects(client.content(A));assert.equal(read,false);assert.equal(calls[0].url,'/api/files/content?id='+A);clean();},{fetch:()=>({ok:true,status:200,headers:new Headers(headers),blob:async()=>{read=true;return new Blob(['bad']);}})});
  }
  await harness(async({client,calls,clean})=>{const blob=await client.content(A);assert.equal(await blob.text(),'data');assert.equal(calls[0].spec.redirect,'error');clean();},{fetch:()=>new Response('data',{headers:{'content-type':'application/octet-stream'}})});
});

test('content401 releases the current session and never returns error bytes as a file', async () => {
  await harness(async({client,F,clean})=>{await assert.rejects(client.content(A),e=>e.status===401);assert.equal(F.lost,1);clean();},{fetch:()=>Response.json({error:'Sign in'},{status:401})});
});

const handlersGone=x=>{for(const key of ['onload','onerror','onabort','ontimeout'])assert.equal(x[key],null,key);assert.equal(x.upload.onprogress,null);};
test('XHR upload uses a fixed URL, current file bytes, bounded progress and complete cleanup', async () => {
  await harness(async({client,instances,clean})=>{
    const progress=[],file=new Blob(['data']);const pending=client.uploadContent(A,file,{onProgress:n=>progress.push(n)}),x=instances[0];
    assert.deepEqual(x.opened,['PUT','/api/files/content?id='+A,true]);assert.equal(x.withCredentials,true);assert.equal(x.timeout,120000);assert.equal(x.sent,file);assert.deepEqual(x.headers,{'X-Inflite-Files-Owner':'owner-a','X-Inflite':'1','Content-Type':'application/octet-stream','Accept':'application/json'});
    x.progress(-1);x.progress(NaN);x.progress(Infinity);x.progress(2);x.progress(50);assert.deepEqual(progress,[0,0,0,.5,1]);x.load();assert.deepEqual(await pending,item());handlersGone(x);clean();
  });
});

test('XHR ignores late progress/results after a caller or account is released', async () => {
  for(const mode of ['caller','owner','frame','destroy'])await harness(async({client,F,life,instances,clean})=>{
    let active=true,calls=0;const pending=client.uploadContent(A,new Blob(['data']),{current:()=>active,onProgress:()=>calls++}),x=instances[0];
    if(mode==='caller')active=false;else if(mode==='owner')F.session.view.user.id='owner-b';else if(mode==='frame')life.abort();else client.destroy();
    x.progress(2);x.load();await assert.rejects(pending,abortError);assert.equal(calls,0);handlersGone(x);if(mode==='caller'||mode==='owner')clean();
  });
});

test('XHR network, abort, timeout, malformed and oversized answers settle once and remove handlers', async () => {
  for(const mode of ['network','abort','timeout','json','oversize'])await harness(async({client,instances,clean})=>{
    const pending=client.uploadContent(A,new Blob(['data'])),x=instances[0];
    if(mode==='network')x.onerror();else if(mode==='abort')x.abort();else if(mode==='timeout')x.ontimeout();else x.load(mode==='json'?'{private broken':'x'.repeat(128*1024+1));
    await assert.rejects(pending);handlersGone(x);clean();
  });
});

test('XHR setup failures release their scoped lifetime rather than leaking a two-minute task', async () => {
  for(const throwAt of ['constructor','open','header','send'])await harness(async({client,clean})=>{await assert.rejects(client.uploadContent(A,new Blob(['data'])));clean();},{throwAt});
});

test('XHR401 releases the current session once and aborts do not trigger session loss', async () => {
  await harness(async({client,instances,F,clean})=>{const pending=client.uploadContent(A,new Blob(['data']));instances[0].load({error:'Sign in'},401);await assert.rejects(pending,e=>e.status===401);assert.equal(F.lost,1);clean();});
});

test('item timestamps must be nonnegative safe millisecond instants that Date can render', async () => {
  const {driveItem}=await source;
  for(const value of [-1,.5,Number.MAX_VALUE,Number.MAX_SAFE_INTEGER]) {
    assert.equal(driveItem(item({createdAt:value})),null,String(value));
    assert.equal(driveItem(item({modifiedAt:value})),null,String(value));
  }
  assert.deepEqual(driveItem(item({createdAt:0,modifiedAt:0})),item({createdAt:0,modifiedAt:0}));
});

test('cursor validation never coerces caller-owned objects into an accepted resource URL', async () => {
  const cursor={toString(){return '1:20';}};
  await harness(async({client,calls})=>{await assert.rejects(client.browse({cursor}));assert.equal(calls.length,0);},{answer:listing()});
});

test('unknown-length JSON streams are cancelled at the response bound rather than fully drained', async () => {
  let pulls=0,cancelled=false;
  await harness(async({client})=>{
    await assert.rejects(client.item(A));
    assert.equal(cancelled,true,'oversized stream is cancelled');
    assert.ok(pulls<=4,'at most the limit, rejecting chunk and one queued chunk are consumed');
  },{fetch:()=>new Response(new ReadableStream({pull(controller){pulls++;controller.enqueue(new TextEncoder().encode('x'.repeat(65536)));if(pulls===8)controller.close();},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}})});
});

test('late rejected transports are fenced by caller/account ownership just like successful responses', async () => {
  for(const kind of ['json','content','xhr'])for(const owner of [true,false]){
    const gate=deferred();let active=true;
    await harness(async({client,F,instances,clean})=>{
      const lease={current:()=>active};const pending=kind==='json'?client.item(A,lease):kind==='content'?client.content(A,lease):client.uploadContent(A,new Blob(['data']),lease);
      await Promise.resolve();if(owner)F.session.view.user.id='owner-b';else active=false;
      if(kind==='xhr')instances[0].onerror();else gate.reject(Error('Old account transport failed'));
      await assert.rejects(pending,abortError);clean();
    },{fetch:()=>gate.promise});
  }
});

test('pre-aborted upload callers do not send bytes and release all setup ownership', async () => {
  await harness(async({client,instances,clean})=>{
    const external=lifetime();external.abort();
    await assert.rejects(client.uploadContent(A,new Blob(['data']),{signal:external.signal}),abortError);
    assert.ok(instances.every(x=>!x.sent));assert.equal(external.listeners.size,0);clean();
  });
});

test('throwing progress callbacks cannot prevent successful uploads or final cleanup', async () => {
  await harness(async({client,instances,clean})=>{
    const pending=client.uploadContent(A,new Blob(['data']),{onProgress(){throw Error('Detached progress consumer');}}),x=instances[0];
    x.progress(2);x.load();assert.deepEqual(await pending,item());handlersGone(x);clean();
  });
});

test('aborting a pending response reader cancels bytes, unlocks its stream and cleans both lifetimes', async () => {
  let stream,cancelled=false,started;const ready=new Promise(r=>started=r);
  await harness(async({client,clean})=>{
    const external=lifetime(),pending=client.item(A,{signal:external.signal});await ready;external.abort();
    await assert.rejects(pending,abortError);assert.equal(cancelled,true);assert.equal(stream.locked,false);assert.equal(external.listeners.size,0);clean();
  },{fetch:()=>{stream=new ReadableStream({pull(){started();},cancel(){cancelled=true;}},{highWaterMark:0});return new Response(stream,{headers:{'content-type':'application/json'}});}});
});

test('JSON reply bounds count UTF8 bytes rather than JavaScript string length', async () => {
  const text=JSON.stringify({ok:true,padding:'é'.repeat(70000)});assert.ok(text.length<128*1024);assert.ok(Buffer.byteLength(text)>128*1024);
  await harness(async({client,clean})=>{await assert.rejects(client.remove(A,1));clean();},{fetch:()=>new Response(text,{headers:{'content-type':'application/json'}})});
});

test('content error replies follow the same bounded reader policy as successful API replies', async () => {
  let read=false;
  await harness(async({client,clean})=>{await assert.rejects(client.content(A));assert.equal(read,false);clean();},{fetch:()=>({ok:false,status:500,headers:new Headers({'content-length':String(128*1024+1)}),json:async()=>{read=true;return {error:'server error'};},text:async()=>{read=true;return JSON.stringify({error:'server error'});}})});
});

test('XHR reply byte bounds reject oversized multibyte metadata even when the item itself is valid', async () => {
  const answer=JSON.stringify({item:item(),padding:'é'.repeat(70000)});assert.ok(answer.length<128*1024);assert.ok(Buffer.byteLength(answer)>128*1024);
  await harness(async({client,instances,clean})=>{const pending=client.uploadContent(A,new Blob(['data']));instances[0].load(answer);await assert.rejects(pending);handlersGone(instances[0]);clean();});
});

test('malformed XHR JSON is normalized to a FilesError rather than exposing raw parser diagnostics', async () => {
  await harness(async({client,instances,FilesError,clean})=>{const pending=client.uploadContent(A,new Blob(['data']));instances[0].load('{private invalid');await assert.rejects(pending,FilesError);clean();});
});

test('rename, move and delete reject nonnumeric or unsafe versions before any request or URL construction', async () => {
  const invalid=[undefined,null,'1','Private diary',0,-1,.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,{toString(){return '1';}}];
  for(const method of ['rename','move','remove']) for(const version of invalid) await harness(async({client,calls,FilesError,clean})=>{
    await assert.rejects(Promise.resolve().then(()=>client[method](A,version,method==='rename'?'Private name':B)),e=>e instanceof FilesError&&e.status===400);
    assert.equal(calls.length,0,method+': invalid version never reaches network');clean();
  });
  await harness(async({client,calls,clean})=>{await client.remove(A,Number.MAX_SAFE_INTEGER);assert.equal(calls[0].url,'/api/files/item?id='+A+'&version='+Number.MAX_SAFE_INTEGER);clean();});
});

test('Drive browse supports only the three exact views and sorts, with search terms confined to POST bodies', async () => {
  for(const view of ['folder','recent','search'])for(const sort of ['name','modified','size'])await harness(async({client,calls,clean})=>{
    const query=view==='search'?'Private holiday notes':'';await client.browse({view,sort,query});
    const {url,spec}=calls[0];assert.equal(url.includes('Private'),false);
    if(query){assert.equal(url,'/api/files/search');assert.equal(spec.method,'POST');assert.deepEqual(JSON.parse(spec.body),{parentId:null,view,cursor:null,sort,q:query});}
    else{assert.equal(url,'/api/files/list?view='+view+'&sort='+sort);assert.equal(spec.method,'GET');assert.equal('body' in spec,false);}
    clean();
  },{answer:listing()});
  for(const [view,sort]of[['folder','name'],['recent','modified'],['search','name']])await harness(async({client,calls,clean})=>{
    await client.browse({view,query:view==='search'?'Private note':''});const c=calls[0];assert.equal(c.spec.method==='POST'?JSON.parse(c.spec.body).sort:new URL(c.url,'https://os.inflite.ai').searchParams.get('sort'),sort);clean();
  },{answer:listing()});
});

test('invalid sort and view values cannot be coerced into URLs or reach a transport', async () => {
  for(const value of [undefined,null,{},[],['name'],new String('name'),'constructor','__proto__','NAME','Private diary','name&token=secret']) {
    if(value!==undefined)await harness(async({client,calls,FilesError,clean})=>{await assert.rejects(client.browse({sort:value}),e=>e instanceof FilesError&&e.status===400);assert.equal(calls.length,0);clean();});
  }
  for(const view of [null,{},['search'],new String('search'),'SEARCH','all-accounts','search?name=Private diary'])await harness(async({client,calls,FilesError,clean})=>{await assert.rejects(client.browse({view}),e=>e instanceof FilesError&&e.status===400);assert.equal(calls.length,0);clean();});
});

test('all fetch and binary upload requests bind to the originally captured owner', async () => {
 await harness(async ({client,calls,instances,F,clean}) => {
  await client.item(A); await client.content(A);
  const pending=client.uploadContent(A,new Blob(['data'])); instances[0].load(); await pending;
  for(const call of calls) assert.equal(call.spec.headers['X-Inflite-Files-Owner'],'owner-a');
  assert.equal(instances[0].headers['X-Inflite-Files-Owner'],'owner-a');
  F.session.view.user.id='owner-b'; await assert.rejects(client.item(A),abortError); assert.equal(calls.length,2); clean();
 },{fetch:(_url)=>_url.includes('/content?')?new Response('data',{headers:{'content-type':'application/octet-stream'}}):Response.json({item:item()})});
});
