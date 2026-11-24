const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{Module}=require('node:module'),{readFileSync,mkdirSync}=require('node:fs'),{resolve}=require('node:path');
const filename=resolve(__dirname,'files-host-ui.test.cjs'),m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);const original=m.require.bind(m);let start,stop;m.require=id=>id==='node:test'?{test(){},before(fn){start=fn},after(fn){stop=fn}}:original(id);m._compile(readFileSync(filename,'utf8').replace("dockRoot:byId('in')","dockRoot:byId('in'),onSettings:()=>{},onNotifications:()=>{}")+'\nmodule.exports={open};',filename);before(()=>start());after(()=>stop());
async function open(width,height=760){const t=await m.exports.open({width});await t.ctx.route(u=>u.origin===new URL(t.page.url()).origin&&u.pathname==='/api/status-banner',r=>r.fulfill({json:{banner:null}}));await t.ctx.route('blob:**',r=>new URL(r.request().url()).origin===new URL(t.page.url()).origin?r.continue():r.abort());await t.page.setViewportSize({width,height});const source=readFileSync(resolve(__dirname,'../today/public/app.js'),'utf8'),a=source.indexOf('// ==== InFlite\'s menu, shared:'),end='// ==== end of InFlite\'s menu ====',block=source.slice(a,source.indexOf(end,a)+end.length);await t.ctx.route('**/launcher-shared.js',r=>r.fulfill({contentType:'text/javascript',body:block+'\nwindow.IFL=IFL;'}));await t.page.addScriptTag({url:'/launcher-shared.js'});await t.page.evaluate(()=>{T.F.toast=()=>{};document.documentElement.dataset.theme='dark'});await t.page.getByRole('button',{name:'All apps',exact:true}).click();t.menu=t.page.getByRole('dialog',{name:'Your apps',exact:true});await t.menu.waitFor();return t;}
for(const [width,height] of[[320,760],[390,760],[844,390],[1440,900]])test(`app launcher is compact, branded and keyboard accessible at ${width}x${height}`,async()=>{const t=await open(width,height);try{
 await t.page.waitForFunction(()=>{
   const style=getComputedStyle(document.querySelector('.ws-dock'));
   return style.opacity==='0' && style.pointerEvents==='none';
 });
 const edges=await t.menu.evaluate(menu=>({
   drawer:menu.getBoundingClientRect().bottom,
   dock:document.querySelector('.ws-dock').getBoundingClientRect().bottom
 }));
 assert.ok(Math.abs(edges.drawer-edges.dock)<=1,JSON.stringify(edges));
 const grid=t.menu.getByRole('group',{name:'Apps',exact:true});assert.equal(await grid.locator('.wsl-app').count(),10);assert.equal(await grid.locator('img').count(),10);
 for (const name of ['Atlas', 'Calendar', 'Notes', 'People', 'Files']) {
   const icon = grid.getByRole('button', {name, exact:true}).locator('img');
   assert.equal(await icon.getAttribute('src'), name === 'Atlas' ? '/atlas.svg' : `/apps/${name.toLowerCase()}.svg`);
 }
 await t.page.waitForFunction(()=>[...document.querySelectorAll('.wsl-app img')].every(n=>n.complete&&n.naturalWidth>0));
 const cols=await grid.evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length);assert.equal(cols,4);
 for(const button of await t.menu.locator('.ws-launcher button').all()){const b=await button.boundingBox();if(b&&await button.isVisible())assert.ok(b.height>=44,JSON.stringify({name:await button.getAttribute("aria-label"),box:b}));}
 for(const node of await grid.locator('img').all()){const b=await node.boundingBox();assert.deepEqual([b.width,b.height],[52,52]);}
 assert.equal(await t.menu.evaluate(n=>n.scrollWidth>n.clientWidth+1),false);assert.ok((await t.menu.boundingBox()).height<=height);
 assert.ok(await t.menu.getByRole('button',{name:'Actions',exact:true}).isVisible());await t.menu.getByRole('button',{name:'Settings',exact:true}).scrollIntoViewIfNeeded(); const footer=await t.menu.getByRole('button',{name:'Settings',exact:true}).boundingBox(), bounds=await t.menu.boundingBox();assert.ok(footer.y>=bounds.y&&footer.y+footer.height<=bounds.y+bounds.height+1);
 assert.equal(await t.menu.getByRole('button',{name:'Mail',exact:true}).isDisabled(),true);
 const atlas=grid.getByRole('button',{name:'Atlas',exact:true});
 assert.equal(await atlas.isVisible(),true);
 assert.equal(await atlas.locator('span').last().textContent(),'Atlas');
 assert.equal(await atlas.isDisabled(),true,'Atlas stays unavailable without the account entitlement');
 await t.menu.getByRole('button',{name:'Files',exact:true}).focus();assert.equal(await t.menu.getByRole('button',{name:'Files',exact:true}).evaluate(n=>n===document.activeElement),true);
 if(process.env.LAUNCHER_SCREENSHOTS&&process.env.WEB_UI_BROWSER!=='webkit'){mkdirSync(process.env.LAUNCHER_SCREENSHOTS,{recursive:true});await t.page.screenshot({path:resolve(process.env.LAUNCHER_SCREENSHOTS,`launcher-${width}.png`),caret:'initial'});}
 await t.page.keyboard.press('Escape');await t.menu.waitFor({state:'detached'});await t.page.waitForFunction(()=>getComputedStyle(document.querySelector('.ws-dock')).opacity==='1');assert.equal(await t.page.getByRole('button',{name:'All apps',exact:true}).evaluate(n=>n===document.activeElement),true);await t.clean();
}finally{await t.ctx.close()}});
test('launcher destinations use the existing singleton apps and stale controls lose their authority',async()=>{const t=await open(390);try{
 await t.menu.getByRole('button',{name:'Files',exact:true}).click();await t.page.getByRole('button',{name:'Select Private folder',exact:true}).waitFor();
 await t.page.getByRole('button',{name:'All apps',exact:true}).click();await t.menu.getByRole('button',{name:'Weather',exact:true}).click();await t.page.getByRole('textbox',{name:'weather draft',exact:true}).fill('Keep this draft');
 await t.page.getByRole('button',{name:'All apps',exact:true}).click();await t.menu.getByRole('button',{name:'Fitness',exact:true}).click();await t.page.getByRole('textbox',{name:'fitness draft',exact:true}).waitFor();await t.page.getByRole('button',{name:'All apps',exact:true}).click();await t.menu.getByRole('button',{name:'Weather',exact:true}).click();assert.equal(await t.page.getByRole('textbox',{name:'weather draft',exact:true}).inputValue(),'Keep this draft');
 await t.page.getByRole('button',{name:'All apps',exact:true}).click();await t.menu.getByRole('button',{name:'Search apps',exact:true}).click();
 const searchPage=t.page.getByRole('dialog',{name:'Search apps',exact:true});
 await searchPage.getByRole('searchbox').fill('weather');
 await searchPage.getByRole('button',{name:'Search InFlite',exact:true}).click();
 assert.equal(await t.page.getByRole('combobox',{name:'Search everything',exact:true}).inputValue(),'weather');await t.page.keyboard.press('Escape');
 await t.page.getByRole('button',{name:'All apps',exact:true}).click();await t.menu.getByRole('button',{name:'Files',exact:true}).evaluate(n=>window.oldLauncherButton=n);await t.page.evaluate(()=>{T.F.destroy();oldLauncherButton.click()});assert.equal(await t.page.locator('.ws-launcher').count(),0);await t.clean();
}finally{await t.ctx.close()}});
