import test from "node:test";
import assert from "node:assert/strict";
import { atlas } from "../today/src/atlas.js";
const db={prepare(sql){return {bind(){return {first:async()=>sql.includes("atlas_credentials")?null:({requests:1}),all:async()=>({results:[]}),run:async()=>({success:true})}}}}};
const env={OPENAI_API_KEY:"test",ATLAS_MODEL:"test",ATLAS_DB:db};
const admin={signedIn:true,user:{id:"owner"},apps:{mail:true}};
const standard={signedIn:true,user:{id:"other"},apps:{mail:false}};
const request=(path="/atlas",cookie=true,post=false)=>new Request("https://inflite.ai"+path,{method:post?"POST":"GET",headers:{...(cookie?{Cookie:"account=abcdefghijklmnopqrstuvwxyz"}:{}),...(post?{Origin:"https://inflite.ai","X-Inflite":"1","Content-Type":"application/json"}:{})},...(post?{body:JSON.stringify({mode:"research",prompt:"hello"})}:{})});
for(const [name,view] of [["standard",standard],["signed out",{signedIn:false}],["missing entitlement",{signedIn:true,user:{id:"owner"}}]]){
 test(name+" cannot access Atlas or its API",async()=>{for(const req of [request(),request("/atlas/api/chat",true,true)]){let called=false;const res=await atlas(req,env,{account:async()=>Response.json(view),send:async()=>{called=true;throw Error()}});assert.equal(res.status,403);assert.equal(called,false);}});
}
test("missing cookie denied",async()=>assert.equal((await atlas(request("/atlas",false),env)).status,401));
test("account outage denied",async()=>assert.equal((await atlas(request(),env,{account:async()=>null})).status,403));
test("admin dashboard is private",async()=>{const res=await atlas(request(),env,{account:async()=>Response.json(admin)});assert.equal(res.status,200);assert.match(res.headers.get("Cache-Control"),/no-store/);assert.match(await res.text(),/Atlas/);});
test("admin can call AI",async()=>{const res=await atlas(request("/atlas/api/chat",true,true),env,{account:async()=>Response.json(admin),send:async(url,init)=>{assert.equal(url,"https://api.openai.com/v1/responses");assert.equal(JSON.parse(init.body).store,false);return Response.json({output:[{type:"message",content:[{type:"output_text",text:"hello"}]}]});}});assert.equal(res.status,200);assert.equal((await res.json()).answer,"hello");});
test("cross origin write denied",async()=>{const req=new Request("https://inflite.ai/atlas/api/chat",{method:"POST",headers:{Cookie:"account=abcdefghijklmnopqrstuvwxyz",Origin:"https://evil.example","X-Inflite":"1"}});assert.equal((await atlas(req,env,{account:async()=>Response.json(admin)})).status,403);});

test("missing database blocks AI",async()=>{let called=false;const res=await atlas(request("/atlas/api/chat",true,true),{...env,ATLAS_DB:null},{account:async()=>Response.json(admin),send:async()=>{called=true}});assert.equal(res.status,503);assert.equal(called,false);});
test("quota exhaustion blocks AI",async()=>{let called=false;const res=await atlas(request("/atlas/api/chat",true,true),{...env,ATLAS_DB:{prepare(){return {bind(){return {first:async()=>null}}}}}},{account:async()=>Response.json(admin),send:async()=>{called=true}});assert.equal(res.status,429);assert.equal(called,false);});
test("standard user cannot read history",async()=>{const res=await atlas(request("/atlas/api/history"),env,{account:async()=>Response.json(standard)});assert.equal(res.status,403);});

test("standard users cannot list or create task drafts",async()=>{for(const method of ["GET","POST"]){const req=new Request("https://inflite.ai/atlas/api/tasks",{method,headers:{Cookie:"account=abcdefghijklmnopqrstuvwxyz"}});assert.equal((await atlas(req,env,{account:async()=>Response.json(standard)})).status,403);}});
test("admin task listing confirms autonomy disabled",async()=>{const res=await atlas(request("/atlas/api/tasks"),env,{account:async()=>Response.json(admin)});assert.equal(res.status,200);assert.equal((await res.json()).autonomous,false);});
test("task creation ignores requested enabled flag",async()=>{let sql;const req=new Request("https://inflite.ai/atlas/api/tasks",{method:"POST",headers:{Cookie:"account=abcdefghijklmnopqrstuvwxyz",Origin:"https://inflite.ai","X-Inflite":"1"},body:JSON.stringify({prompt:"Daily briefing",interval_minutes:1440,enabled:true})});const res=await atlas(req,{...env,ATLAS_DB:{prepare(s){sql=s;return {bind(){return {first:async()=>({id:"test"})}}}}}},{account:async()=>Response.json(admin)});assert.equal(res.status,201);assert.equal((await res.json()).enabled,false);assert.match(sql,/SELECT \?,\?,\?,\?,0,\?/);});

test("task cancellation is owner scoped",async()=>{let args,sql;const req=new Request("https://inflite.ai/atlas/api/tasks",{method:"DELETE",headers:{Cookie:"account=abcdefghijklmnopqrstuvwxyz",Origin:"https://inflite.ai","X-Inflite":"1"},body:JSON.stringify({id:"task-1",owner:"other"})});const res=await atlas(req,{...env,ATLAS_DB:{prepare(s){sql=s;return {bind(...a){args=a;return {run:async()=>({success:true})}}}}}},{account:async()=>Response.json(admin)});assert.equal(res.status,200);assert.match(sql,/WHERE owner=\? AND id=\?/);assert.deepEqual(args,["owner","task-1"]);});

test("standard user cannot stop tasks",async()=>{const req=new Request("https://inflite.ai/atlas/api/stop",{method:"POST",headers:{Cookie:"account=abcdefghijklmnopqrstuvwxyz",Origin:"https://inflite.ai","X-Inflite":"1"}});assert.equal((await atlas(req,env,{account:async()=>Response.json(standard)})).status,403);});
test("admin stop persists flag and disables tasks atomically",async()=>{let statements;const req=new Request("https://inflite.ai/atlas/api/stop",{method:"POST",headers:{Cookie:"account=abcdefghijklmnopqrstuvwxyz",Origin:"https://inflite.ai","X-Inflite":"1"}});const db={prepare(sql){return {bind(...args){return {sql,args}}}},batch:async s=>{statements=s;}};const res=await atlas(req,{...env,ATLAS_DB:db},{account:async()=>Response.json(admin)});assert.equal(res.status,200);assert.equal(statements.length,2);assert.match(statements[0].sql,/stopped=1/);assert.match(statements[1].sql,/enabled=0/);assert.deepEqual(statements.map(s=>s.args),[["owner"],["owner"]]);});

test("standard users cannot configure provider",async()=>{assert.equal((await atlas(request("/atlas/api/provider",true,true),env,{account:async()=>Response.json(standard)})).status,403);});
test("provider setup requires encryption configuration",async()=>{assert.equal((await atlas(request("/atlas/api/provider",true,true),env,{account:async()=>Response.json(admin)})).status,503);});

test("provider changes require a matching fresh administrator proof before any storage or OpenAI call",async()=>{
 const key=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
 for(const method of ["POST","DELETE"])for(const proof of [null,{fresh:false,owner:"owner"},{fresh:true,owner:"other"},{fresh:"true",owner:"owner"}]){
  let touches=0;const req=new Request("https://inflite.ai/atlas/api/provider",{method,headers:{Cookie:"account=abcdefghijklmnopqrstuvwxyz",Origin:"https://inflite.ai","X-Inflite":"1"},body:JSON.stringify({key:"sk-"+"a".repeat(40),model:"test"})});
  const res=await atlas(req,{ATLAS_ENCRYPTION_KEY:key,ATLAS_DB:{prepare(){touches++;throw Error("must not touch storage")}}},{account:async(_e,_r,{path})=>path==="today/me"?Response.json(admin):proof?Response.json(proof):null,send:async()=>{touches++;throw Error("must not call OpenAI")}});
  assert.equal(res.status,403);assert.equal(touches,0);
 }
});
test("saved provider is encrypted, used for AI, and never returned by the status endpoint",async()=>{
 const secret="sk-"+"a".repeat(40),model="test-model";let row;
 const db={prepare(sql){return {bind(...a){return {
  first:async()=>sql.includes("atlas_credentials")?row:({requests:1}),
  all:async()=>({results:[]}),
  run:async()=>{if(sql.startsWith("INSERT INTO atlas_credentials"))row={iv:a[1],ciphertext:a[2],model:a[3]};if(sql.startsWith("DELETE FROM atlas_credentials"))row=null;return {success:true}}
 }}}}};
 const e={ATLAS_DB:db,ATLAS_ENCRYPTION_KEY:btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))};
 const account=async(_e,_r,{path})=>Response.json(path==="today/me"?admin:{fresh:true,owner:"owner"});
 const providerRequest=(method,body)=>new Request("https://inflite.ai/atlas/api/provider",{method,headers:{Cookie:"account=abcdefghijklmnopqrstuvwxyz",Origin:"https://inflite.ai","X-Inflite":"1"},...(body?{body:JSON.stringify(body)}:{})});
 const send=async(url,init)=>{assert.equal(init.headers.Authorization,"Bearer "+secret);if(url.endsWith("/models/"+model))return Response.json({id:model});assert.equal(url,"https://api.openai.com/v1/responses");assert.equal(JSON.parse(init.body).model,model);return Response.json({output:[{type:"message",content:[{type:"output_text",text:"hello"}]}]});};
 let res=await atlas(providerRequest("POST",{key:secret,model}),e,{account,send});assert.equal(res.status,200);assert.ok(!JSON.stringify(row).includes(secret));assert.ok(!(await res.text()).includes(secret));
 res=await atlas(providerRequest("GET"),e,{account,send});assert.deepEqual(await res.json(),{connected:true,model,setupAvailable:true});
 res=await atlas(request("/atlas/api/chat",true,true),e,{account,send});assert.equal(res.status,200);assert.equal((await res.json()).answer,"hello");
 res=await atlas(providerRequest("DELETE"),e,{account,send});assert.equal(res.status,200);assert.equal(row,null);
});
test("Atlas page uses shared wallpaper assets and nonce protected inline code",async()=>{
 const res=await atlas(request(),env,{account:async()=>Response.json(admin)}),html=await res.text();
 assert.match(html,/<script type="module" src="\/roof\/wallpaper\.js">/);
 assert.match(html,/<div class="sky" aria-hidden="true"><canvas>/);
 assert.match(res.headers.get("Content-Security-Policy"),/script-src 'self' 'nonce-[^']+'/);
 assert.match(res.headers.get("Content-Security-Policy"),/frame-ancestors 'none'/);
 assert.ok(!res.headers.get("Content-Security-Policy").includes("'unsafe-inline'"));
});
