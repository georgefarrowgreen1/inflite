// The real frame, app loader and Files host, with seeded retired layout data.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {Module}=require('node:module'),{readFileSync}=require('node:fs'),{resolve}=require('node:path');
const filename=resolve(__dirname,'files-host-ui.test.cjs'),m=new Module(filename);
m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);
const original=m.require.bind(m);let start,stop;
m.require=id=>id==='node:test'?{test(){},before(fn){start=fn},after(fn){stop=fn}}:original(id);
m._compile(readFileSync(filename,'utf8')+'\nmodule.exports={open};',filename);
before(()=>start());after(()=>stop());

for(const width of [320,1440])test(`saved workspaces stay retired and direct apps retain drafts at ${width}px`,async()=>{
 const saved=JSON.stringify({version:2,userId:'ann',activeId:'ride',workspaces:[{id:'ride',name:'Old ride',activePane:'fitness',updatedAt:1,panes:[{app:'fitness',route:'/fitness/#today'},{app:'weather',route:'/weather/#days'}]}]});
 const t=await m.exports.open({width,savedWorkspace:saved});try{
  await t.page.evaluate(()=>T.F.nav.go('/#workspace=ride',{kind:'section'}));
  await t.page.waitForFunction(()=>T.F.route.tab==='workspace'&&!T.F.route.arg);
  assert.equal(await t.page.locator('.ws-ride:visible,.ws-mode-switch:visible,.ws-workspace-card:visible,.ws-layout-button:visible').count(),0);
  assert.equal(await t.page.getByRole('button',{name:/workspace|sync/i}).count(),0);
  assert.equal(await t.page.evaluate(()=>localStorage.getItem('ifl:workspace:v2:ann')),saved);
  await t.page.getByRole('button',{name:'All apps',exact:true}).click();
  const launcher=t.page.getByRole('dialog',{name:'Your apps',exact:true});
  assert.equal(await launcher.getByRole('button',{name:/workspace|sync/i}).count(),0);
  await launcher.getByRole('button',{name:'Weather',exact:true}).click();
  await t.page.getByRole('textbox',{name:'weather draft',exact:true}).fill('Keep my draft');
  await t.page.evaluate(()=>T.weatherNode=document.querySelector('[aria-label="weather draft"]'));
  await t.page.getByRole('button',{name:'All apps',exact:true}).click();
  await launcher.getByRole('button',{name:'Fitness',exact:true}).click();
  await t.page.getByRole('textbox',{name:'fitness draft',exact:true}).waitFor();
  await t.page.getByRole('button',{name:'All apps',exact:true}).click();
  await launcher.getByRole('button',{name:'Weather',exact:true}).click();
  assert.equal(await t.page.getByRole('textbox',{name:'weather draft',exact:true}).inputValue(),'Keep my draft');
  assert.equal(await t.page.evaluate(()=>document.querySelector('[aria-label="weather draft"]')===T.weatherNode),true);
  await t.page.getByRole('button',{name:'All apps',exact:true}).click();
  await launcher.getByRole('button',{name:'Files',exact:true}).click();
  await t.page.getByRole('button',{name:'Select Private folder',exact:true}).waitFor();
  await t.page.evaluate(()=>T.F.search.open());
  await t.page.getByRole('combobox',{name:'Search everything'}).fill('workspace');
  assert.equal(await t.page.getByRole('option').filter({hasText:/workspace|sync/i}).count(),0);
  assert.equal(await t.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await t.clean();
 }finally{await t.ctx.close()}
});

test('notifications open their exact app target without offering a workspace',async()=>{
 const t=await m.exports.open();try{
  const actions=await t.page.evaluate(async()=>{const a=T.ws.notificationActions({app:'weather',url:'/weather/#days'});await a[0].run();return a.map(v=>({id:v.id,label:v.label}))});
  assert.deepEqual(actions,[{id:'app',label:'Open app'}]);
  await t.page.getByRole('textbox',{name:'weather draft',exact:true}).waitFor();
  assert.equal(new URL(t.page.url()).pathname,'/weather/');assert.equal(new URL(t.page.url()).hash,'#days');
  await t.clean();
 }finally{await t.ctx.close()}
});
