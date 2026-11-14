// Actual frame/controller: another tab must not overwrite an editor's name or
// silently persist a stale layout. Native in-pane navigation remains available.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Module}=require('node:module');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
function fixture(){
 const filename=resolve(__dirname,'workspace-security-ui.test.cjs'),m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);
 const original=m.require.bind(m);let start,stop;
 m.require=id=>id==='node:test'?{test(){},before(fn){start=fn},after(fn){stop=fn}}:original(id);
 m._compile(readFileSync(filename,'utf8')+'\nmodule.exports={open};',filename);
 return{start:()=>start(),stop:()=>stop(),open:m.exports.open};
}
async function conflict(t){
 await t.page.waitForFunction(()=>!audit.ws.busy());
 await t.page.evaluate(()=>{const saved=structuredClone(audit.ws.store.read());saved.workspaces[0].name='Other tab winner';localStorage.setItem('ifl:workspace:v2:owner-a',JSON.stringify(saved));audit.otherSaved=JSON.stringify(saved);});
}
async function dismiss(t){await t.page.locator('dialog[open]').getByRole('button',{name:'Close',exact:true}).click();await t.page.locator('dialog[open]').waitFor({state:'hidden'});}

test('stale layout create, rename and remove keep the edit sheet and typed name with a recovery explanation',async()=>{
 const env=fixture();await env.start();let t;
 try{
  t=await env.open();
  await t.page.evaluate(()=>audit.ws.store.create({name:'Second layout',panes:[{app:'fitness'}]}));
  await conflict(t);
  await t.page.getByRole('button',{name:'Workspace options',exact:true}).click();
  const dialog=t.page.locator('dialog[open]'),name=dialog.getByRole('textbox',{name:'Workspace name',exact:true});
  await name.fill('My unsaved name');await dialog.getByRole('button',{name:'Save name',exact:true}).click();
  assert.equal(await name.inputValue(),'My unsaved name');assert.match(await dialog.innerText(),/Another tab changed your saved layout/);
  await dialog.getByRole('button',{name:'Remove workspace',exact:true}).click();
  assert.equal(await name.inputValue(),'My unsaved name');assert.equal(await dialog.isVisible(),true);
  assert.equal(await t.page.evaluate(()=>audit.ws.store.read().workspaces.length),2);
  await dismiss(t);await t.page.getByRole('button',{name:'New workspace',exact:true}).click();
  await dialog.getByRole('textbox',{name:'Workspace name',exact:true}).fill('My new workspace');
  await dialog.getByRole('button',{name:'Create workspace',exact:true}).click();
  assert.equal(await dialog.getByRole('textbox',{name:'Workspace name',exact:true}).inputValue(),'My new workspace');
  assert.match(await dialog.innerText(),/Review saved layout in Workspace sync/);
  assert.equal(await t.page.evaluate(()=>localStorage.getItem('ifl:workspace:v2:owner-a')===audit.otherSaved),true);
  assert.equal(await t.page.evaluate(()=>audit.toasts.length),0,'sheet errors do not spam automatic navigation toasts');
  await t.clean();
 }finally{await t?.ctx.close();await env.stop();}
});

test('a rejected window change rolls back while app navigation and saved-layout recovery commands remain usable',async()=>{
 const env=fixture();await env.start();let t;
 try{
  t=await env.open();await conflict(t);
  await t.page.getByRole('button',{name:'Float windows',exact:true}).click();await t.settle();
  assert.equal(await t.page.getByRole('button',{name:'Float windows',exact:true}).isVisible(),true);
  assert.equal(await t.page.evaluate(()=>audit.ws.store.read().workspaces[0].layout.mode),'tile');
  await t.page.getByRole('button',{name:'Float windows',exact:true}).click();await t.settle();
  assert.equal(await t.page.evaluate(()=>audit.toasts.length),1,'repeated rejected changes have one explanation');
  await t.page.evaluate(()=>audit.F.view('fitness').fw.nav.section('activities'));await t.settle();
  assert.equal(await t.page.evaluate(()=>audit.F.view('fitness').route.key),'activities');
  assert.equal(await t.page.evaluate(()=>localStorage.getItem('ifl:workspace:v2:owner-a')===audit.otherSaved),true);
  await t.page.evaluate(()=>audit.F.search.open());
  await t.page.getByRole('combobox',{name:'Search everything'}).fill('sync workspaces');
  const command=t.page.getByRole('option',{name:/^Sync workspaces /});await command.waitFor();await command.click();
  await t.page.getByRole('heading',{name:'Workspaces on Devices',exact:true}).waitFor();
  await t.page.getByRole('button',{name:'Review saved layout',exact:true}).click();
  assert.equal(await t.page.evaluate(()=>audit.ws.store.read().workspaces[0].name),'Other tab winner');
  await t.clean();
 }finally{await t?.ctx.close();await env.stop();}
});
