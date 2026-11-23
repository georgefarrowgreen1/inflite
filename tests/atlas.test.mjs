import test from "node:test";
import assert from "node:assert/strict";
import { atlas } from "../today/src/atlas.js";
const env={OPENAI_API_KEY:"test",ATLAS_MODEL:"test"};
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
