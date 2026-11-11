// Real Files library, shared components and native dialog. Owning app providers
// are controlled fixtures, with no account content or remote transport involved.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{readFileSync,existsSync}=require('node:fs'),{resolve,extname}=require('node:path');
const PUBLIC=resolve(__dirname,'../today/public'),ORIGIN='http://files.test';let browser;
before(async()=>{browser=process.env.WEB_UI_BROWSER==='webkit'?await webkit.launch():await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox']});});
after(async()=>browser?.close());
const fixture=`import * as ui from '/roof/ui.js';import {createSheets} from '/roof/sheet.js';import {createWorkspaceFiles} from '/roof/workspace-files.js';
 const controller=new AbortController(),T=window.T={calls:[],runs:[],effects:[],gates:{},status:{fitness:'ready',mail:'ready',chats:'locked'},answers:{},toasts:[],opens:[]};
 const entry=(app,id,name,mime)=>({id:app+':file:'+id,app,name,mime,objectId:id,intent:'open-file',downloadIntent:'download-file',source:app==='mail'?'Maya':app,modifiedAt:100,size:2048});
 T.answers.fitness={status:'ready',files:[entry('fitness','route','Norwich.gpx','application/gpx+xml'),entry('fitness','workout','Endurance.fit','application/vnd.ant.fit')]};
 T.answers.mail={status:'ready',files:[entry('mail','invoice','Invoice.pdf','application/pdf')]};T.answers.chats={status:'locked',files:[]};
 T.wait=(app,q)=>new Promise(resolve=>T.gates[app+':'+q]=resolve);T.release=(key,answer)=>{const fn=T.gates[key];delete T.gates[key];fn(answer)};
 T.F={ui,signal:controller.signal,session:{view:{user:{id:'ann'}}},route:{kind:'tab',tab:'workspace'},toast:s=>T.toasts.push(s)};T.F.sheet=createSheets(T.F);
 T.load=async(app,q,current)=>{T.calls.push({app,q});if(T.delays?.includes(app+':'+q))return T.wait(app,q);const a=T.answers[app];return {...a,files:a.files.filter(f=>!q||f.name.toLowerCase().includes(q.toLowerCase()))}};
 T.files=createWorkspaceFiles(T.F,{sources:()=>Object.entries(T.status).map(([app,status])=>({app,status,name:app==='mail'?'Mail':app==='chats'?'Chats':'Fitness',...(T.transient?.[app]?{transient:true,files:status==='ready'?T.answers[app].files:[]}:{})})),load:(...args)=>T.load(...args),runIntent:async(app,intent,id,{current})=>{T.runs.push({app,intent,id,current:current()});if(T.delayRun)await new Promise(r=>T.finishRun=r);if(!current())return{ok:false};T.effects.push({app,intent,id});return{ok:true}},openApp:app=>T.opens.push(app)});
 T.abort=()=>controller.abort();document.getElementById('open').onclick=()=>T.files.open();
`;
async function open(width=390){
 const ctx=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),page=await ctx.newPage(),errors=[],unknown=[];
 page.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/*',r=>{const u=new URL(r.request().url()),p=u.pathname;if(u.origin!==ORIGIN){unknown.push(u.href);return r.abort();}if(p==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/roof/roof.css"><script type="module" src="/fixture.js"></script></head><body><button id="open">Open Files</button></body></html>'});if(p==='/fixture.js')return r.fulfill({contentType:'text/javascript',body:fixture});const path=resolve(PUBLIC,'.'+p);if(!path.startsWith(PUBLIC+'/')||!existsSync(path)){unknown.push(p);return r.fulfill({status:404,body:''});}return r.fulfill({contentType:extname(path)==='.css'?'text/css':'text/javascript',body:readFileSync(path)});});
 await page.goto(ORIGIN);await page.waitForFunction(()=>!!window.T?.files);const close=async()=>{assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);await ctx.close();};return{ctx,page,close};
}
test('Files loads all real source metadata, filters/sorts without reloads, and keeps rounded mobile geometry and focus',async()=>{
 const t=await open();try{
  await t.page.getByRole('button',{name:'Open Files',exact:true}).click();await t.page.getByRole('button',{name:'Open Invoice.pdf',exact:true}).waitFor();
  assert.equal(await t.page.getByRole('searchbox',{name:'Search files'}).evaluate(n=>document.activeElement===n),true);
  assert.equal(await t.page.locator('.ifl-files-item').count(),3);assert.equal(await t.page.getByText('Unlock Chats to see its files.',{exact:true}).count(),1);
  const before=await t.page.evaluate(()=>T.calls.length);await t.page.getByLabel('Type',{exact:true}).selectOption('routes');assert.equal(await t.page.locator('.ifl-files-item').count(),1);assert.equal(await t.page.getByRole('button',{name:'Open Norwich.gpx',exact:true}).count(),1);
  await t.page.getByLabel('Type',{exact:true}).selectOption('all');await t.page.getByLabel('App',{exact:true}).selectOption('mail');assert.equal(await t.page.locator('.ifl-files-item').count(),1);assert.equal(await t.page.evaluate(()=>T.calls.length),before);
  const bounds=await t.page.locator('dialog[open]').evaluate(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,scroll:n.scrollWidth,client:n.clientWidth,radius:getComputedStyle(n).borderRadius}));assert.ok(bounds.left>=0&&bounds.right<=390);assert.ok(bounds.scroll<=bounds.client+1);assert.notEqual(bounds.radius,'0px');
  await t.page.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await t.page.getByRole('button',{name:'Open Files',exact:true}).evaluate(n=>document.activeElement===n),true);
 }finally{await t.close();}
});
test('global Files search stays on-device, locked metadata is purged immediately, and gate actions open the real app',async()=>{
 const t=await open(1200);try{
  await t.page.evaluate(()=>T.files.open());await t.page.getByRole('button',{name:'Open Invoice.pdf',exact:true}).waitFor();
  const found=await t.page.evaluate(async()=>{const n=T.calls.length,r=await T.files.search('invoice');return{n,after:T.calls.length,titles:r.map(x=>x.title)}});assert.equal(found.after,found.n);assert.deepEqual(found.titles,['Invoice.pdf','Find “invoice” in Files']);
  await t.page.evaluate(()=>{T.status.mail='locked';T.files.update();});assert.equal(await t.page.getByRole('button',{name:'Open Invoice.pdf',exact:true}).count(),0);
  assert.deepEqual(await t.page.evaluate(async()=>(await T.files.search('invoice')).map(x=>x.title)),['Find “invoice” in Files']);
  await t.page.locator('[data-source="mail"] button').click();assert.deepEqual(await t.page.evaluate(()=>T.opens),['mail']);assert.equal(await t.page.locator('dialog[open]').count(),0);
 }finally{await t.close();}
});
test('stale queries, late locks and account changes cannot publish old filenames; only pending loading sources retry',async()=>{
 const t=await open();try{
  await t.page.evaluate(()=>{T.delays=['mail:'];T.files.open()});await t.page.waitForFunction(()=>!!T.gates['mail:']);
  await t.page.getByRole('searchbox',{name:'Search files'}).fill('Norwich');await t.page.waitForFunction(()=>T.calls.some(x=>x.app==='mail'&&x.q==='Norwich'));
  await t.page.evaluate(()=>T.release('mail:',T.answers.mail));assert.equal(await t.page.getByRole('button',{name:'Open Invoice.pdf',exact:true}).count(),0);
  await t.page.evaluate(()=>{T.delays=['mail:Invoice'];});await t.page.getByRole('searchbox',{name:'Search files'}).fill('Invoice');await t.page.waitForFunction(()=>!!T.gates['mail:Invoice']);
  await t.page.evaluate(()=>{T.status.mail='locked';T.files.update();T.release('mail:Invoice',T.answers.mail)});assert.equal(await t.page.getByRole('button',{name:'Open Invoice.pdf',exact:true}).count(),0);
  await t.page.evaluate(()=>{T.status.fitness='loading';T.answers.fitness={status:'loading',files:[]};T.files.open()});await t.page.waitForFunction(()=>T.calls.filter(x=>x.app==='fitness'&&x.q==='').length>=2);
  const calls=await t.page.evaluate(()=>T.calls.length);await t.page.evaluate(()=>{T.status.fitness='ready';T.answers.fitness={status:'ready',files:[{id:'fitness:file:new',objectId:'new',app:'fitness',name:'Ready.gpx',mime:'application/gpx+xml',intent:'open-file'}]};T.files.changed('fitness')});await t.page.getByRole('button',{name:'Open Ready.gpx',exact:true}).waitFor();assert.equal(await t.page.evaluate(()=>T.calls.length),calls+1);
  await t.page.evaluate(()=>{T.files.update();T.files.changed('fitness')});assert.equal(await t.page.evaluate(()=>T.calls.length),calls+1);
  await t.page.evaluate(()=>{T.F.session.view.user.id='bea';T.files.update()});assert.equal(await t.page.locator('dialog[open]').count(),0);assert.deepEqual(await t.page.evaluate(()=>T.files.search('Ready')),[]);
 }finally{await t.close();}
});
test('open/download/import use native intents after closing, while a newer operation or account abort cancels delayed effects',async()=>{
 const t=await open();try{
  await t.page.evaluate(()=>T.files.open());await t.page.getByRole('button',{name:'Download Invoice.pdf',exact:true}).click();await t.page.waitForFunction(()=>T.effects.length===1);
  assert.deepEqual(await t.page.evaluate(()=>T.effects[0]),{app:'mail',intent:'download-file',id:'invoice'});assert.equal(await t.page.locator('dialog[open]').count(),0);
  await t.page.evaluate(()=>{T.delayRun=true;T.files.open()});await t.page.getByRole('button',{name:'Open Invoice.pdf',exact:true}).click();await t.page.waitForFunction(()=>!!T.finishRun);
  await t.page.evaluate(()=>{T.files.open();T.finishRun();T.delayRun=false;});assert.equal(await t.page.evaluate(()=>T.effects.length),1);
  await t.page.getByRole('button',{name:'Add files to Fitness',exact:true}).click();await t.page.waitForFunction(()=>T.effects.length===2);assert.equal(await t.page.evaluate(()=>T.effects[1].intent),'import-files');
  await t.page.evaluate(()=>{T.delayRun=true;T.files.open()});await t.page.getByRole('button',{name:'Download Norwich.gpx',exact:true}).click();await t.page.waitForFunction(()=>T.runs.length===4);
  await t.page.evaluate(()=>{T.abort();T.finishRun()});assert.equal(await t.page.evaluate(()=>T.effects.length),2);
 }finally{await t.close();}
});
test('source failures have a working explicit retry, source removal drops filenames, and provider results stay bounded',async()=>{
 const t=await open();try{
  await t.page.evaluate(()=>{T.answers.mail={status:'error',files:[]};T.files.open()});await t.page.locator('[data-source="mail"][data-state="error"]').waitFor();
  await t.page.evaluate(()=>{T.answers.mail={status:'ready',files:Array.from({length:130},(_,i)=>({id:'mail:file:a'+i,objectId:'a'+i,app:'mail',name:'Invoice '+String(i).padStart(3,'0')+'.pdf',mime:'application/pdf',intent:'open-file'}))}});
  await t.page.locator('[data-source="mail"] button').click();await t.page.waitForFunction(()=>document.querySelectorAll('.ifl-files-item[data-app="mail"]').length===100);
  assert.equal(await t.page.locator('.ifl-files-item[data-app="mail"]').count(),100);assert.equal(await t.page.getByRole('button',{name:'Open Invoice 129.pdf',exact:true}).count(),0);assert.equal(await t.page.getByText('Mail: showing recent files. Search to narrow the list.',{exact:true}).count(),1);
  await t.page.getByLabel('App',{exact:true}).selectOption('mail');await t.page.evaluate(()=>{delete T.status.mail;T.files.update()});
  assert.equal(await t.page.getByLabel('App',{exact:true}).inputValue(),'all');assert.equal(await t.page.getByLabel('App',{exact:true}).locator('option[value="mail"]').count(),0);
  assert.deepEqual(await t.page.evaluate(async()=>(await T.files.search('Invoice')).map(x=>x.title)),['Find “Invoice” in Files']);
 }finally{await t.close();}
});
test('Chat recall and conversation changes release transient rows and reject saved controls without fetching',async()=>{
 const t=await open();try{
  await t.page.evaluate(()=>{T.transient={chats:true};T.status.chats='loading';T.answers.chats={status:'loading',files:[]};T.files.open()});
  await t.page.waitForFunction(()=>T.calls.some(c=>c.app==='chats'));
  await t.page.evaluate(()=>{T.status.chats='ready';T.answers.chats={status:'ready',files:[{id:'chats:file:peer:one',objectId:'peer:one',app:'chats',name:'Private chat photo',mime:'application/octet-stream',intent:'open-file'}]};T.files.changed('chats')});
  await t.page.getByRole('button',{name:'Open Private chat photo',exact:true}).waitFor();
  await t.page.evaluate(()=>{window.oldPhotoButton=document.querySelector('[data-app="chats"] button');T.answers.chats.files=[];T.files.changed('chats');oldPhotoButton.click()});
  assert.equal(await t.page.getByRole('button',{name:'Open Private chat photo',exact:true}).count(),0);assert.deepEqual(await t.page.evaluate(()=>T.runs),[]);
  await t.page.evaluate(()=>{T.answers.chats.files=[{id:'chats:file:other:two',objectId:'other:two',app:'chats',name:'Other chat photo',mime:'application/octet-stream',intent:'open-file'}];T.files.update('chats')});
  await t.page.getByRole('button',{name:'Open Other chat photo',exact:true}).waitFor();
  assert.equal(await t.page.evaluate(()=>T.calls.filter(c=>c.app==='chats').length),1,'a cold source can initialise once; canonical transient snapshots do not refetch');
  await t.page.evaluate(()=>{T.status.chats='loading';T.files.changed('chats')});
  assert.equal(await t.page.getByRole('button',{name:'Open Other chat photo',exact:true}).count(),0);
 }finally{await t.close();}
});
