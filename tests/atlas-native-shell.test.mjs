import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import worker from '../today/src/index.js';
import { parse, format, REGISTRY, atlasReference } from '../today/public/roof/router.js';
import { safeWorkspaceRoute } from '../today/public/roof/workspace-catalog.js';
import { resumeTarget } from '../today/public/roof/restore.js';
import { createActivityRegistry } from '../today/public/roof/workspace-activity-state.js';
import { createAtlasActivityReader } from '../today/public/atlas/roof/activity.js';

const marker = owner => createHash('sha256').update('atlas-owner:' + owner).digest('hex').slice(0,32);
const deferred = () => { let resolve; const promise = new Promise(done => resolve = done); return {resolve,promise}; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('Atlas cold links and legacy conversation links enter the existing shell', async () => {
  const assets = [];
  const env = {ASSETS:{async fetch(request) { assets.push(new URL(request.url).pathname); return new Response('current InFlite shell'); }}};
  for (const path of ['/atlas/','/atlas/index.html']) {
    const response = await worker.fetch(new Request('https://inflite.ai' + path),env,{});
    assert.equal(response.status,200); assert.equal(response.headers.get('X-InFlite-Shell'),'1');
    assert.equal(await response.text(),'current InFlite shell');
    assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  }
  assert.deepEqual(assets,['/','/']);
  const redirect = await worker.fetch(new Request('https://inflite.ai/atlas?conversation=thread-123&secret=not-persisted'),env,{});
  assert.equal(redirect.headers.get('Location'),'/atlas/#conversations=thread-123');
  assert.equal((await worker.fetch(new Request('https://inflite.ai/atlas/api/session'),env,{})).status,401);
});

test('Atlas routes retain only curated opaque references and respect native module availability', () => {
  for (const section of ['conversations','tasks','environments','briefs','settings']) {
    const route = '/atlas/#' + section;
    const canonical = section === 'conversations' ? '/atlas/' : route;
    assert.equal(format(parse(route,{roof:{atlas:true}})),canonical);
    assert.equal(safeWorkspaceRoute('atlas',route),route);
    assert.equal(parse(route,{roof:{atlas:false}}),null);
    assert.equal(resumeTarget({path:canonical}).path,canonical);
  }
  for (const key of ['conversations','tasks','briefs']) {
    const route = '/atlas/#' + key + '=123e4567-e89b-12d3-a456-426614174000';
    assert.equal(resumeTarget({path:route}).path,route);
    assert.equal(safeWorkspaceRoute('atlas',route),route);
  }
  assert.equal(safeWorkspaceRoute('atlas','/atlas/?token=private#tasks'),null);
  assert.equal(resumeTarget({path:'/atlas/#conversations=private%20title'}),null);
  assert.equal(REGISTRY.atlas.entry,'/atlas/roof/module.js');
  const shell = readFileSync(new URL('../today/public/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(shell,/src=["'][^"']*atlas/,'Atlas must not add eager JavaScript to every shell boot');
});

test('migrated Atlas conversations preserve exact bounded legacy IDs without widening other routes', () => {
  const owner = '123e4567-e89b-12d3-a456-426614174000';
  const hex = Buffer.from(owner).toString('hex');
  for (const mode of ['research','developer','personal','fitness','tasks']) {
    const id = 'legacy-' + hex + '-' + mode, path = '/atlas/#conversations=' + id;
    assert.equal(atlasReference(id),id); assert.ok(id.length > 40);
    const route = parse(path,{roof:{atlas:true}});
    assert.equal(route.arg,id); assert.equal(format(route),path);
    assert.equal(safeWorkspaceRoute('atlas',path),path);
    assert.deepEqual(resumeTarget({path,y:42}),{path,y:42});
    assert.equal(parse(path,{roof:{atlas:false}}),null);
    assert.equal(format(parse('/atlas/?secret=not-persisted#conversations='+id,{roof:true})),path);
    assert.equal(resumeTarget({path:'/atlas/?secret=not-persisted#conversations='+id}),null);
    assert.equal(safeWorkspaceRoute('atlas','/atlas/?secret=not-persisted#conversations='+id),null);
    for (const [app,key] of [['mail','thread'],['fitness','act'],['chats','open'],['atlas','tasks'],['atlas','briefs']]) {
      const other = '/'+app+'/#'+key+'='+id;
      assert.equal(parse(other,{roof:true}).arg,null,other);
      assert.equal(safeWorkspaceRoute(app,other),null,other);
      assert.equal(resumeTarget({path:other}),null,other);
    }
  }
  const longest = 'legacy-'+'ab'.repeat(60)+'-developer', path = '/atlas/#conversations='+longest;
  assert.equal(path.length,159); assert.equal(safeWorkspaceRoute('atlas',path),path);
  assert.equal(resumeTarget({path}).path,path);
  for (const id of ['x'.repeat(41),'legacy-'+'ab'.repeat(61)+'-developer','legacy-'+'a'.repeat(71)+'-research','legacy-'+hex.toUpperCase()+'-personal','legacy-'+hex+'-unknown','legacy-'+hex+'-research?token=private']) {
    assert.equal(atlasReference(id),null,id);
    const invalid = '/atlas/#conversations='+id;
    assert.equal(safeWorkspaceRoute('atlas',invalid),null,id);
    assert.equal(resumeTarget({path:invalid}),null,id);
  }
  assert.equal(atlasReference({toString:()=>longest}),null);
  assert.equal(resumeTarget({path:'/atlas/#conversations=legacy-%61'+hex+'-research'}),null);
});

test('Atlas run links restore only typed opaque references', () => {
  const path = '/atlas/#runs=b_123e4567-e89b-12d3-a456-426614174000';
  const route = parse(path, { roof: { atlas: true } });
  assert.equal(route.key, 'runs');
  assert.equal(route.section, 'conversations');
  assert.equal(format(route), path);
  assert.equal(safeWorkspaceRoute('atlas', path), path);
  assert.equal(resumeTarget({ path }).path, path);
  assert.equal(parse(path, { roof: { atlas: false } }), null);
  for (const suffix of ['private-title', 'b_private%20title', 'x_run', 'b_' + 'x'.repeat(39)]) {
    const invalid = '/atlas/#runs=' + suffix;
    assert.equal(parse(invalid, { roof: true }).arg, null);
    assert.equal(resumeTarget({ path: invalid }), null);
    assert.equal(safeWorkspaceRoute('atlas', invalid), null);
  }
});

function activityFixture(send) {
  const life = new AbortController(), opened = [];
  const F = {signal:life.signal,session:{view:{user:{id:'alice'},apps:{mail:true}},apps:{atlas:true}}};
  const registry = createActivityRegistry(F);
  const reader = createAtlasActivityReader(F,{registry,fetch:send,open:href=>opened.push(href)});
  return {F,life,registry,reader,opened};
}
const activity = (status='running') => ({ready:true,items:[{id:'run-one',kind:'coding',title:'Fix navigation',stage:'Running checks',status,updatedAt:123,href:'/atlas/#tasks=run-one'}]});
const activityResponse = (data=activity(),owner='alice') => Response.json(data,{headers:{'X-Atlas-Owner':marker(owner)}});

test('Activity does not interrupt the shell or send an unbound request when secure hashing is unavailable', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis,'crypto');
  let h, calls = 0;
  try {
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:{}});
    assert.doesNotThrow(() => { h = activityFixture(async()=>{calls++;return activityResponse();}); });
    const result = await h.reader.refresh();
    assert.equal(result.ok,false); assert.match(result.error,/refresh/);
    assert.equal(calls,0); assert.deepEqual(h.registry.snapshot(),[]);
  } finally { h?.life.abort(); Object.defineProperty(globalThis,'crypto',descriptor); }
});

test('shared Activity deduplicates reads, opens native routes and never dispatches task writes', async () => {
  const wait = deferred(), sent = [];
  const h = activityFixture(async(path,options)=>{sent.push({path,options});return wait.promise;});
  const first = h.reader.refresh(), second = h.reader.refresh();
  await tick(); assert.equal(sent.length,1);
  assert.equal(sent[0].options.headers['X-Atlas-Owner'],marker('alice'));
  assert.equal(sent[0].options.method,undefined);
  wait.resolve(activityResponse()); await Promise.all([first,second]);
  const entry = h.registry.snapshot()[0]; assert.equal(entry.status,'running'); assert.equal(entry.detail,'Atlas · Running checks');
  assert.equal((await h.registry.invoke(entry.key,'open',entry.revision)).ok,true);
  assert.deepEqual(h.opened,['/atlas/#tasks=run-one']);
  await h.reader.refresh(); assert.equal(sent.length,1);
  h.life.abort(); assert.deepEqual(h.registry.snapshot(),[]);
});

test('Activity preserves results across outages but discards an old account response and lost access', async () => {
  let answer = () => activityResponse();
  const h = activityFixture(async()=>answer());
  await h.reader.refresh();
  answer = () => new Response('',{status:503});
  assert.equal((await h.reader.refresh({force:true})).ok,false);
  assert.equal(h.registry.snapshot().length,1);
  answer = () => activityResponse(activity(),'bob');
  await h.reader.refresh({force:true}); assert.deepEqual(h.registry.snapshot(),[]);
  answer = () => activityResponse(); await h.reader.refresh({force:true});
  h.F.session.view.apps.mail = false;
  await h.reader.refresh(); assert.deepEqual(h.registry.snapshot(),[]);
  h.life.abort();
  const wait = deferred(), other = activityFixture(()=>wait.promise);
  const loading = other.reader.refresh(); await tick(); other.F.session.view.user.id='bob'; wait.resolve(activityResponse());
  await loading; assert.deepEqual(other.registry.snapshot(),[]); other.life.abort();
});

test('identity confirmation requires a matching authoritative proof, never a successful dialog mount', {timeout:2000}, async () => {
  const previous = {HTMLElement:globalThis.HTMLElement,customElements:globalThis.customElements,document:globalThis.document,fetch:globalThis.fetch};
  globalThis.HTMLElement = class {};
  globalThis.customElements = {define(){}};
  const mounted = deferred();
  let mount, closed, fetched=0, proof=false;
  const host = {remove(){},mount:async options=>{mount=options;options.sheets.openEl({});mounted.resolve();return true;}};
  globalThis.document = {createElement:()=>host};
  globalThis.fetch = async()=>{fetched++;return proof ? Response.json({confirmed:true,owner:marker('alice')},{headers:{'X-Atlas-Owner':marker('alice')}}) : Response.json({code:'identity_confirmation_required'},{status:403});};
  const controller = new AbortController(), parent = {isConnected:true,append(){}};
  const F = {signal:controller.signal,session:{view:{user:{id:'alice'}}},sheet:{openEl(_dialog,options){closed=options.onClose;return {now(){}};}},toast(){}};
  try {
    const {confirmIdentity} = await import('../today/public/settings-account.js');
    let resolved=false;
    const operation=confirmIdentity(F,{parent,expectedOwner:marker('alice')}).then(result=>{resolved=true;return result;});
    await Promise.race([mounted.promise,operation.then(()=>{throw new Error('Confirmation ended before opening its review sheet');})]);
    assert.equal(mount.action,'confirm'); assert.equal(resolved,false); assert.equal(fetched,1);
    assert.equal(await confirmIdentity(F,{parent,expectedOwner:marker('bob')}),false);
    assert.equal(resolved,false, 'a second owner must not reuse an in-flight confirmation');
    proof=true; closed(); assert.equal(await operation,true); assert.equal(fetched,2);
    assert.equal(await confirmIdentity(F,{parent,expectedOwner:marker('bob')}),false);
    globalThis.fetch=async()=>new Response('',{status:503});
    assert.equal(await confirmIdentity(F,{parent}),false);
    assert.equal(F.session.view.user.id,'alice');
  } finally { controller.abort(); Object.assign(globalThis,previous); }
});
