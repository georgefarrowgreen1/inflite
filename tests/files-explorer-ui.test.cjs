// Isolated draft harness: real InFlite components/sheets; synthetic account and
// service boundary. No production account, app mount or network write is used.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, mkdirSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const ROOT = process.env.INFLITE_ROOT || resolve(__dirname, '..');
const PUBLIC = resolve(ROOT, 'today/public'), ORIGIN = 'http://files-next.test';
const CSP = /Content-Security-Policy: (.*)/.exec(readFileSync(resolve(PUBLIC, '_headers'), 'utf8'))[1];
const { chromium, webkit } = require('playwright');
let browser;
before(async () => { browser = process.env.WEB_UI_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] }); });
after(async () => browser?.close());

const fixture = `
import * as ui from '/roof/ui.js';import {createSheets} from '/roof/sheet.js';import {createFilesExplorer} from '/roof/files-explorer.js';
window.IFL={glyph:()=>'<svg viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>'};
const ac=new AbortController(),root=document.getElementById('explorer'),listeners=new Set(),folder='A'.repeat(32),file='B'.repeat(32);
const actions=[{id:'preview',label:'Preview'},{id:'download',label:'Download'},{id:'rename',label:'Rename'},{id:'move',label:'Move'},{id:'delete',label:'Delete',destructive:true}];
const T=window.T={calls:[],reads:[],uploads:[],toasts:[],delays:{},pending:{},ac,folder,file,items:new Map(),transfer:[],created:[],revoked:[]};
const item=(id,name,extra={})=>({key:'drive:'+id,id,source:{kind:'drive',id:'drive'},kind:'file',name,parentId:null,mime:'text/plain',size:48,modifiedAt:1000,version:1,sourceLabel:'My Drive',actions:actions.map(a=>({...a})),...extra});
T.items.set(null,[item(folder,'Cycling',{kind:'folder',mime:undefined,size:undefined,actions:[{id:'open',label:'Open'},{id:'rename',label:'Rename'},{id:'move',label:'Move'},{id:'delete',label:'Delete',destructive:true}]}),item(file,'Training notes.txt'),item('C'.repeat(32),'<img onerror=alert(1)>.txt')]);T.items.set(folder,[]);
const originalCreate=URL.createObjectURL.bind(URL),originalRevoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=blob=>{const value=originalCreate(blob);T.created.push(value);return value};URL.revokeObjectURL=value=>{T.revoked.push(value);originalRevoke(value)};
const F=T.F={ui,signal:ac.signal,session:{view:{user:{id:'owner-a'}}},toast:text=>T.toasts.push(text)};F.sheet=createSheets(F);
const locationName=loc=>loc.kind==='apps'?'From apps':loc.folderId===folder?'Cycling':loc.view==='recent'?'Recent':'My Drive';
const service=T.service={
 locations:loc=>[{name:'My Drive',icon:'cloud',selected:loc.kind==='drive'&&loc.view!=='recent',location:{kind:'drive'}},{name:'Recent',icon:'clock',selected:loc.view==='recent',location:{kind:'drive',view:'recent'}},{name:'From apps',kind:'apps',icon:'apps',selected:loc.kind==='apps',location:{kind:'apps'}}],
 subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},transfers:()=>T.transfer,
 async browse(loc,options){T.reads.push({loc:{...loc},query:options.query,sort:options.sort,cursor:options.cursor,foldersOnly:!!options.foldersOnly});const key=loc.kind==='apps'?'apps':loc.folderId||'root';if(T.delays[key])await new Promise(r=>T.pending[key]=r);if(loc.kind==='apps')return{status:'ready',name:'From apps',items:[{key:'app:chats:photo',id:'photo',name:'Photo from Chats',mime:'application/octet-stream',source:{kind:'app',id:'chats'},kind:'file',sourceLabel:'Chats',actions:[{id:'open-file',label:'Open in Chats',primary:true},{id:'download-file',label:'Download'}]}],capabilities:{}};const all=(T.items.get(loc.folderId)||[]).filter(f=>(!options.foldersOnly||f.kind==='folder')&&(!options.query||f.name.toLowerCase().includes(options.query.toLowerCase())));const offset=T.pages&&options.cursor?Number(options.cursor.split(':')[1]):0;return{status:'ready',folder:loc.folderId?{id:loc.folderId,name:locationName(loc)}:null,ancestors:[],items:T.pages?all.slice(offset,offset+100):all,cursor:T.pages&&all.length>offset+100?'1:'+(offset+100):null,capabilities:{upload:loc.view!=='recent',newFolder:loc.view!=='recent'},usage:{used:96,reserved:0,limit:1073741824}};},
 async run(key,action,options){T.calls.push({key,action,input:options.input,current:options.current()});if(T.delayAction)await new Promise(r=>T.finishAction=r);if(!options.current())return{ok:false,cancelled:true};if(key?.startsWith('app:')){T.explorer.hide();await Promise.resolve();T.handoffCurrent=options.current();return{ok:true};}const rows=[...T.items.values()].flat(),resource=rows.find(f=>f.key===key);if(action==='preview'){if(T.delayPreview)await new Promise(r=>T.finishPreview=r);return{ok:true,blob:T.previewBlob||new Blob(['<script>window.previewExecuted=true</script>\\nActual notes'],{type:'application/octet-stream'})};}if(action==='create-folder'){const id='N'.repeat(32);T.items.get(options.input.parentId).push(item(id,options.input.name,{kind:'folder',parentId:options.input.parentId,actions:[{id:'open',label:'Open'}]}));T.items.set(id,[]);}if(action==='rename'){resource.name=options.input.name;resource.version++;}if(action==='move'){T.items.set(resource.parentId,T.items.get(resource.parentId).filter(f=>f!==resource));resource.parentId=options.input.parentId;resource.version++;T.items.get(resource.parentId).push(resource);}if(action==='delete'){if(resource.kind==='folder'&&T.items.get(resource.id)?.length)return{ok:false,error:'This folder isn’t empty.'};T.items.set(resource.parentId,T.items.get(resource.parentId).filter(f=>f!==resource));}return{ok:true};},
 async upload(files,options){if(!options.current())return;T.uploads.push({folderId:options.folderId,names:files.map(f=>f.name)});},cancelTransfer(id){T.calls.push({cancel:id})}
};
T.explorer=createFilesExplorer(root,F,{service});T.explorer.show();T.emit=change=>{for(const fn of listeners)fn(change)};T.listeners=()=>listeners.size;
`;

async function open(width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' }), page = await ctx.newPage(), errors = [], unknown = [];
  page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.rejections = []; window.violations=[]; addEventListener('unhandledrejection', event => rejections.push(String(event.reason)));document.addEventListener('securitypolicyviolation',event=>violations.push(event.violatedDirective+' '+event.blockedURI)); });
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (url.protocol === 'blob:' && url.origin === ORIGIN) return route.continue();
    if (url.origin !== ORIGIN) { unknown.push(url.href); return route.abort(); }
    if (path === '/') return route.fulfill({ contentType: 'text/html', headers:{'Content-Security-Policy':CSP}, body: '<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><link rel="stylesheet" href="/roof/files-view.css"><link rel="stylesheet" href="/fixture.css"><script type="module" src="/fixture.js"></script></head><body><main id="explorer"></main></body></html>' });
    if (path === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: fixture });
    if (path === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: 'html,body{height:100%;margin:0}body{padding:16px;background:#f2f4f1}#explorer{height:calc(100dvh - 32px)}@media(max-width:600px){body{padding:0}#explorer{height:100dvh;border-radius:0}}' });
    if (path === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    const directory = PUBLIC, filename = resolve(directory, '.' + path);
    if (!filename.startsWith(directory + '/') || !existsSync(filename)) { unknown.push(path); return route.fulfill({ status: 404, body: 'Unexpected draft fixture resource' }); }
    return route.fulfill({ contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(filename)] || 'application/octet-stream', body: readFileSync(filename) });
  });
  await page.goto(ORIGIN); await page.getByRole('button', { name: 'Select Training notes.txt', exact: true }).waitFor();
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await settle();
  const clean = async () => { assert.deepEqual(errors, []); assert.deepEqual(unknown, []); assert.deepEqual(await page.evaluate(() => [rejections,violations]), [[],[]]); };
  return { ctx, page, settle, clean };
}
// WebKit's screenshot helper injects an inline stylesheet, which the real CSP
// correctly refuses. Collect visual artifacts in Chromium; keep WebKit strict.
async function screenshot(page,name){if(process.env.EXPLORER_SCREENSHOTS&&process.env.WEB_UI_BROWSER!=='webkit'){mkdirSync(process.env.EXPLORER_SCREENSHOTS,{recursive:true});await page.screenshot({path:resolve(process.env.EXPLORER_SCREENSHOTS,name+'.png'),caret:'initial'});}}

test('desktop list/grid retains real selection/focus and exposes only actual file actions', async () => {
  const t = await open(); try {
    const row = t.page.getByRole('button', { name: 'Select Training notes.txt', exact: true }); await row.click();
    await row.focus(); await t.page.evaluate(() => { window.originalRow = document.activeElement; T.emit({kind:'transfers'}); });
    assert.equal(await t.page.evaluate(() => document.activeElement === originalRow), true);
    await t.page.evaluate(()=>{T.delays.root=true;T.explorer.refresh()});
    await t.page.locator('.ifx-results[aria-busy="true"]').waitFor();
    assert.equal(await row.isEnabled(),false,'refresh exposes the unavailable row without blurring it');
    assert.equal(await t.page.getByRole('button',{name:'Actions for Training notes.txt',exact:true}).isEnabled(),false);
    assert.equal(await t.page.locator('.ifx-inspector').getByRole('button',{name:'Preview',exact:true}).isEnabled(),false);
    assert.equal(await t.page.evaluate(()=>document.activeElement===originalRow),true);
    await t.page.evaluate(()=>{originalRow.click();document.querySelector('.ifx-file-menu[aria-label="Actions for Training notes.txt"]').click();document.querySelector('.ifx-inspector [data-file-action="preview"]').click()});
    assert.equal(await t.page.getByRole('dialog').count(),0);assert.equal(await t.page.evaluate(()=>T.calls.length),0);
    await t.page.waitForFunction(()=>!!T.pending.root);await t.page.evaluate(()=>{delete T.delays.root;T.pending.root()});
    await t.page.locator('.ifx-results[aria-busy="false"]').waitFor();
    assert.equal(await row.isEnabled(),true);assert.equal(await t.page.locator('.ifx-inspector').getByRole('button',{name:'Preview',exact:true}).isEnabled(),true);
    assert.equal(await t.page.evaluate(()=>document.activeElement===originalRow),true,'the same focused node survives loading and readiness');

    await t.page.evaluate(()=>{T.transfer=[{id:'upload-1',name:'Training.fit',status:'uploading',label:'Uploading',progress:.5,cancelable:true}];T.emit({kind:'transfers'})});
    const transfer=t.page.locator('.ifx-transfer');assert.equal(await transfer.locator('svg[data-icon="upload"]').count(),1);assert.equal(await transfer.getByRole('button',{name:'Cancel upload of Training.fit',exact:true}).count(),1);
    await t.page.evaluate(()=>{T.transfer=[{...T.transfer[0],status:'done',label:'Uploaded',progress:1,cancelable:false}];T.emit({kind:'transfers'})});
    assert.equal(await transfer.locator('svg[data-icon="check"]').count(),1,'service done status renders the completed check icon');assert.equal(await transfer.getByText('Uploaded',{exact:true}).count(),1);assert.equal(await transfer.locator('progress').evaluate(node=>node.value),1);assert.equal(await transfer.getByRole('button').count(),0);assert.equal(await t.page.evaluate(()=>document.activeElement===originalRow),true);
    await t.page.getByRole('button', { name: 'Grid view', exact: true }).click(); assert.equal(await t.page.locator('#explorer').getAttribute('data-file-view'), 'grid');
    assert.equal(await t.page.getByRole('button', { name: 'Select <img onerror=alert(1)>.txt', exact: true }).count(), 1); assert.equal(await t.page.locator('#explorer img').count(), 0);
    await screenshot(t.page,'desktop-grid');
    await t.page.getByRole('button', { name: 'Actions for Training notes.txt', exact: true }).click();
    const menu = t.page.getByRole('dialog', { name: 'Training notes.txt', exact: true }); assert.equal(await menu.locator('button button').count(), 0);
    for (const label of ['Preview', 'Download', 'Rename', 'Move', 'Delete']) assert.equal(await menu.getByRole('button', { name: label, exact: true }).count(), 1);
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('mobile details use the native sheet and text preview stays escaped', async () => {
  const t = await open(390); try {
    await t.page.getByRole('button', { name: 'Select Training notes.txt', exact: true }).click();
    const details = t.page.getByRole('dialog', { name: 'File details', exact: true }); await details.waitFor();
    await screenshot(t.page,'mobile-details');
    await details.getByRole('button', { name: 'Preview', exact: true }).click(); await details.locator('pre').waitFor();
    assert.equal(await t.page.evaluate(()=>T.calls.find(call=>call.action==='preview').input.version),1,'preview is fenced to the version observed by the Explorer');
    assert.match(await details.locator('pre').innerText(), /<script>/); assert.equal(await t.page.evaluate(() => !!window.previewExecuted), false);
    assert.equal(await details.locator('script').count(), 0);
    assert.equal(await details.locator('button button').count(), 0);
    assert.equal(await t.page.locator('#explorer').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
    assert.equal(await t.page.locator('.ifx-file-main,.ifx-file-menu').evaluateAll(nodes => nodes.filter(n=>n.getClientRects().length).every(n=>n.getBoundingClientRect().height>=44)), true);
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('new folder, rename and move call actual service actions; app sources hide Drive controls', async () => {
  const t = await open(); try {
    await t.page.getByRole('button', { name: 'New folder', exact: true }).click(); await t.page.getByRole('textbox', { name: 'Folder name', exact: true }).fill('Travel');
    await t.page.getByRole('button', { name: 'Create folder', exact: true }).click(); await t.page.getByRole('button', { name: 'Select Travel', exact: true }).waitFor();
    await t.page.getByRole('button', { name: 'Select Training notes.txt', exact: true }).click(); await t.page.locator('.ifx-inspector').getByRole('button', { name: 'Rename', exact: true }).click();
    await t.page.getByRole('textbox', { name: 'File name', exact: true }).fill('Updated notes.txt'); await t.page.getByRole('button', { name: 'Save name', exact: true }).click();
    await t.page.getByRole('button', { name: 'Select Updated notes.txt', exact: true }).waitFor();
    await t.page.locator('.ifx-inspector').getByRole('button', { name: 'Move', exact: true }).click(); const move = t.page.getByRole('dialog', { name: 'Move Updated notes.txt', exact: true });
    await move.getByRole('button', { name: 'Cycling', exact: true }).click(); await move.getByRole('button', { name: 'Move here', exact: true }).click();
    await t.page.waitForFunction(() => T.calls.some(call => call.action==='move'&&call.input.parentId===T.folder));
    await t.page.getByRole('button', { name: 'Select Updated notes.txt', exact: true }).waitFor({state:'hidden'});
    await t.page.getByRole('button', { name: 'From apps', exact: true }).click(); await t.page.getByRole('button', { name: 'Select Photo from Chats', exact: true }).waitFor();
    assert.equal(await t.page.getByRole('button', { name: 'Upload', exact: true }).count(), 0); assert.equal(await t.page.getByRole('button', { name: 'New folder', exact: true }).count(), 0);
    await t.page.getByRole('button', { name: 'Select Photo from Chats', exact: true }).click(); assert.equal(await t.page.locator('.ifx-inspector').getByRole('button', { name: 'Rename', exact: true }).count(), 0);
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('the native file chooser captures its original Drive folder and does not auto-import after account teardown', async () => {
  const t = await open(); try {
    const pending = t.page.waitForEvent('filechooser'); await t.page.getByRole('button', { name: 'Upload', exact: true }).click(); const chooser = await pending;
    await t.page.evaluate(() => T.explorer.show({kind:'drive',folderId:T.folder}));
    await chooser.setFiles([{ name: 'Training.fit', mimeType: 'application/octet-stream', buffer: Buffer.from('fixture') }]);
    await t.page.waitForFunction(() => T.uploads.length===1); assert.deepEqual(await t.page.evaluate(() => T.uploads), [{folderId:null,names:['Training.fit']}]);
    const again = t.page.waitForEvent('filechooser'); await t.page.getByRole('button', { name: 'Upload', exact: true }).click(); const retired = await again;
    await t.page.evaluate(() => {T.F.session.view.user.id='owner-b';T.ac.abort()});
    await retired.setFiles([{ name: 'Retired.fit', mimeType: 'application/octet-stream', buffer: Buffer.from('fixture') }]);
    assert.equal(await t.page.evaluate(() => T.uploads.length),1);assert.equal(await t.page.evaluate(() => T.listeners()),0);assert.equal(await t.page.locator('#explorer').innerText(),'');
    await t.clean();
  } finally { await t.ctx.close(); }
});

test('closing preview retires delayed bytes and native app handoff remains live across Explorer hide', async () => {
  const t = await open(390); try {
    await t.page.evaluate(() => T.delayPreview=true); await t.page.getByRole('button', { name:'Select Training notes.txt',exact:true }).click();
    const details=t.page.getByRole('dialog',{name:'File details',exact:true});await details.getByRole('button',{name:'Preview',exact:true}).click();await t.page.waitForFunction(()=>!!T.finishPreview);
    await details.getByRole('button',{name:'Close',exact:true}).click();await t.page.evaluate(()=>T.finishPreview());await t.settle();assert.equal(await t.page.locator('dialog[open]').count(),0);assert.equal(await t.page.locator('pre').count(),0);
    await t.page.evaluate(()=>T.explorer.show({kind:'apps'}));await t.page.getByRole('button',{name:'Select Photo from Chats',exact:true}).click();
    await t.page.getByRole('dialog',{name:'File details',exact:true}).getByRole('button',{name:'Open in Chats',exact:true}).click();
    await t.page.waitForFunction(()=>T.handoffCurrent===true);assert.equal(await t.page.locator('dialog[open]').count(),0);
    assert.equal(await t.page.evaluate(()=>T.calls.at(-1).action),'open-file');await t.clean();
  } finally { await t.ctx.close(); }
});

test('image preview is owner-scoped, revokes its URL on close, and unsupported active content is rejected',async()=>{
 const t=await open(390);try{
  await t.page.evaluate(()=>{T.items.get(null).find(item=>item.id===T.file).mime='image/png';T.previewBlob=new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMouW/2HwAF3QKJUpbpuAAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0))],{type:'application/octet-stream'});T.explorer.refresh()});
  await t.page.getByRole('button',{name:'Select Training notes.txt',exact:true}).click();const details=t.page.getByRole('dialog',{name:'File details',exact:true});
  await details.getByRole('button',{name:'Preview',exact:true}).click();await details.locator('.ifx-preview img').waitFor();await t.page.waitForFunction(()=>T.created.length===1);
  await details.getByRole('button',{name:'Close',exact:true}).click();assert.deepEqual(await t.page.evaluate(()=>T.revoked),await t.page.evaluate(()=>T.created));
  await t.page.evaluate(()=>{T.items.get(null).find(item=>item.id===T.file).mime='text/html';T.explorer.refresh()});await t.page.getByRole('button',{name:'Select Training notes.txt',exact:true}).click();
  const unsupported=t.page.getByRole('dialog',{name:'File details',exact:true});await unsupported.getByRole('button',{name:'Preview',exact:true}).click();await unsupported.getByText('Preview isn’t supported for this file. Download it to open it.',{exact:true}).waitFor();
  assert.equal(await unsupported.locator('iframe,object,embed,script').count(),0);assert.equal(await t.page.evaluate(()=>T.created.length),1);await t.clean();
 }finally{await t.ctx.close();}
});

test('narrow phone and tablet layouts keep details reachable, targets padded and query prefill ephemeral',async()=>{
 for(const width of [320,768,980,1200,1280,1440]){
  const t=await open(width);try{
   await t.page.evaluate(()=>T.explorer.show({kind:'drive'},{query:'Training'}));await t.page.waitForFunction(()=>T.reads.at(-1).query==='Training'&&document.querySelector('.ifx-results').getAttribute('aria-busy')==='false');
   assert.equal(await t.page.getByRole('searchbox').inputValue(),'Training');assert.equal(await t.page.evaluate(()=>location.href.includes('Training')||JSON.stringify(history.state).includes('Training')),false);
   await t.page.getByRole('button',{name:'Select Training notes.txt',exact:true}).click();
   if(width<1032)await t.page.getByRole('dialog',{name:'File details',exact:true}).waitFor();else await t.page.locator('.ifx-inspector').getByRole('button',{name:'Preview',exact:true}).waitFor();
   assert.equal(await t.page.locator('#explorer').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'root overflow at '+width);
   assert.equal(await t.page.locator('.ifx-toolbar button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).every(n=>n.getBoundingClientRect().height>=44)),true,'toolbar targets at '+width);
   await t.clean();
  }finally{await t.ctx.close();}
 }
});

test('real pages keep all entries reachable, restore per-page selection/focus, and reset cursors for search/sort',async()=>{
 const t=await open();try{
  await t.page.evaluate(()=>{const template=T.items.get(null).find(item=>item.id===T.file);T.pages=true;T.items.set(null,Array.from({length:201},(_,index)=>{const id=String(index).padStart(32,'0');return{...template,key:'drive:'+id,id,name:'File '+String(index).padStart(3,'0')+'.txt'}}));T.explorer.refresh({reset:true})});
  await t.page.getByRole('button',{name:'Select File 050.txt',exact:true}).click();await t.page.getByRole('button',{name:'Next page',exact:true}).click();
  await t.page.getByRole('button',{name:'Select File 150.txt',exact:true}).waitFor();assert.equal(await t.page.getByRole('button',{name:'Select File 050.txt',exact:true}).count(),0);
  await t.page.getByRole('button',{name:'Select File 150.txt',exact:true}).click();await t.page.getByRole('button',{name:'Next page',exact:true}).click();
  await t.page.getByRole('button',{name:'Select File 200.txt',exact:true}).waitFor();assert.equal(await t.page.getByRole('button',{name:'Next page',exact:true}).isDisabled(),true);
  await t.page.getByRole('button',{name:'Previous page',exact:true}).click();await t.page.getByRole('button',{name:'Select File 150.txt',exact:true}).waitFor();
  assert.equal(await t.page.getByRole('button',{name:'Select File 150.txt',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await t.page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Select File 150.txt');
  await t.page.getByRole('button',{name:'Previous page',exact:true}).click();await t.page.getByRole('button',{name:'Select File 050.txt',exact:true}).waitFor();assert.equal(await t.page.getByRole('button',{name:'Select File 050.txt',exact:true}).getAttribute('aria-pressed'),'true');
  await t.page.getByRole('button',{name:'Next page',exact:true}).click();await t.page.getByRole('button',{name:'Select File 100.txt',exact:true}).waitFor();
  await t.page.getByRole('combobox',{name:'Sort files',exact:true}).selectOption('modified');await t.page.waitForFunction(()=>T.reads.at(-1).sort==='modified'&&T.reads.at(-1).cursor===null);await t.page.getByRole('button',{name:'Select File 000.txt',exact:true}).waitFor();
  await t.page.getByRole('searchbox').fill('File 200');await t.page.getByRole('button',{name:'Select File 200.txt',exact:true}).waitFor();assert.equal(await t.page.evaluate(()=>T.reads.at(-1).cursor),null);assert.equal(await t.page.locator('.ifx-file').count(),1);
  await t.clean();
 }finally{await t.ctx.close();}
});

test('Move can choose destinations beyond the first folder page without replacing the Explorer listing',async()=>{
 const t=await open();try{
  await t.page.getByRole('button',{name:'Select Training notes.txt',exact:true}).click();
  await t.page.evaluate(()=>{const base=T.items.get(null)[0];const folders=Array.from({length:201},(_,index)=>{const id=String(index).padStart(32,'0');T.items.set(id,[]);return{...base,key:'drive:'+id,id,name:'Folder '+String(index).padStart(3,'0'),kind:'folder'}});T.items.set(null,[...T.items.get(null),...folders]);T.pages=true;});
  await t.page.locator('.ifx-inspector').getByRole('button',{name:'Move',exact:true}).click();const move=t.page.getByRole('dialog',{name:'Move Training notes.txt',exact:true});
  await move.getByRole('button',{name:'Folder 050',exact:true}).waitFor();await move.getByRole('button',{name:'Next folder page',exact:true}).click();
  await move.getByRole('button',{name:'Folder 150',exact:true}).click();await move.getByRole('button',{name:'Move here',exact:true}).click();
  await t.page.waitForFunction(()=>T.calls.some(call=>call.action==='move'&&call.input.parentId===String(150).padStart(32,'0')));
  assert.equal(await t.page.evaluate(()=>T.reads.some(read=>read.foldersOnly&&read.cursor==='1:100')),true);await t.clean();
 }finally{await t.ctx.close();}
});
