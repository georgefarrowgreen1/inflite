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


test("Atlas D1 provisioning fills only the selected existing binding and refuses conflicts",async()=>{
 const {bindAtlasDatabase}=await import("../tools/atlas-bind.mjs");
 const {readFileSync}=await import("node:fs");
 const config=readFileSync(new URL("../wrangler.toml",import.meta.url),"utf8");
 // Use a fixture with the same binding structure, independent of real deployment IDs.
 const fixture=config.replace(/^\s*database_id\s*=.*$/gm,"");
 const stage="12345678-1234-1234-1234-123456789abc",prod="abcdefab-1234-1234-1234-123456789abc";
 const next=bindAtlasDatabase(fixture,"next",stage);
 assert.ok(next.includes('database_name = "inflite-atlas-next"\ndatabase_id = "'+stage+'"'));
 assert.ok(!next.includes('database_name = "inflite-atlas-production"\ndatabase_id'));
 assert.equal(bindAtlasDatabase(next,"next",stage),next);
 assert.throws(()=>bindAtlasDatabase(next,"next",prod),/differs/);
 const both=bindAtlasDatabase(next,"production",prod);
 assert.ok(both.includes('database_name = "inflite-atlas-production"\ndatabase_id = "'+prod+'"'));
 assert.ok(both.includes('database_name = "inflite-atlas-next"\ndatabase_id = "'+stage+'"'));
 assert.throws(()=>bindAtlasDatabase(fixture,"next","bad"),/Invalid D1 UUID/);
 assert.throws(()=>bindAtlasDatabase(fixture.replace('database_name = "inflite-atlas-next"','database_name = "wrong"'),"next",stage),/Unexpected database_name/);
 assert.throws(()=>bindAtlasDatabase(fixture+'\n[[env.next.d1_databases]]\nbinding = "ATLAS_DB"\n',"next",stage),/exactly one/);
 assert.throws(()=>bindAtlasDatabase(fixture.replace("[[env.next.d1_databases]]","[[env.dev.d1_databases]]"),"next",stage),/exactly one/);
});
test("server-authorized Atlas opts out of shared theme session timeout before loading theme",async()=>{
 const res=await atlas(request(),env,{account:async()=>Response.json(admin)}),html=await res.text();
 const nonce=/script-src 'self' 'nonce-([^']+)'/.exec(res.headers.get("Content-Security-Policy"))[1];
 assert.ok(html.includes('<script nonce="'+nonce+'">globalThis.__iflSessionStarted=true;</script><script src="/theme.js"></script><script nonce="'+nonce+'">document.documentElement.classList.remove("boot");</script>'));
});

test("task activation uses the bound account Worker and fails closed when administrator verification fails",async t=>{
 t.mock.method(globalThis,"fetch",async()=>assert.fail("Account verification must use the APPS binding"));
 const cases=[
  {name:"approved",proof:{allowed:true},expected:200},
  {name:"not an administrator",proof:{allowed:false},expected:403},
  {name:"non-boolean approval",proof:{allowed:"true"},expected:403},
  {name:"upstream denial",proof:{allowed:true},status:403,expected:403},
  {name:"invalid response",invalid:true,expected:503},
  {name:"account unavailable",unavailable:true,expected:503},
 ];
 for(const c of cases){
  let verifications=0;const queries=[],batches=[];
  const e={ATLAS_AUTONOMY:"1",ATLAS_VERIFY_KEY:"verifier-secret",ATLAS_DB:{
   prepare(sql){queries.push(sql);return {bind(...args){return {sql,args,first:async()=>({id:"task-1"})}}};},
   batch:async statements=>{batches.push(statements);},
  },APPS:{fetch:async req=>{
   verifications++;
   assert.equal(req.url,"https://account.inflite.ai/api/atlas-admin");
   assert.equal(req.method,"POST");
   assert.equal(req.redirect,"error");
   assert.equal(req.headers.get("Authorization"),"Bearer verifier-secret");
   assert.equal(req.headers.get("Content-Type"),"application/json");
   assert.equal(req.headers.get("Cookie"),null);
   assert.deepEqual(await req.json(),{owner:"owner"});
   if(c.unavailable)throw Error("account unavailable");
   return c.invalid?new Response("invalid JSON"):Response.json(c.proof,{status:c.status||200});
  }}};
  const req=new Request("https://inflite.ai/atlas/api/tasks",{method:"PATCH",headers:{Cookie:"account=abcdefghijklmnopqrstuvwxyz",Origin:"https://inflite.ai","X-Inflite":"1"},body:JSON.stringify({id:"task-1",confirm:true,owner:"forged-owner"})});
  const res=await atlas(req,e,{account:async()=>Response.json(admin)});
  assert.equal(res.status,c.expected,c.name);
  assert.equal(verifications,1,c.name);
  if(c.expected===200){
   assert.deepEqual(await res.json(),{enabled:true});
   assert.equal(batches.length,1);
   assert.deepEqual(batches[0][0].args,["owner"]);
   assert.deepEqual(batches[0][1].args.slice(1),["owner","task-1"]);
  }else{
   assert.deepEqual(queries,[],c.name+" must not touch task storage");
   assert.deepEqual(batches,[],c.name+" must not activate a task");
  }
 }
});
