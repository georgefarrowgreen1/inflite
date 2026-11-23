import test from "node:test";
import assert from "node:assert/strict";
import {runAtlasScheduled} from "../today/src/atlas-scheduler.js";
const task={id:"t",owner:"admin",prompt:"research",interval_minutes:60};
function fixture({quota=true,active=true}={}){let sent=0;const db={prepare(sql){return {bind(){return {all:async()=>({results:[task]}),first:async()=>sql.includes("atlas_usage")?(quota?{}:null):sql.startsWith("SELECT")?(active?{}:null):{},run:async()=>({success:true})}}}}};return {env:{ATLAS_AUTONOMY:"1",ATLAS_DB:db,OPENAI_API_KEY:"test",ATLAS_MODEL:"test"},send:async()=>{sent++;return Response.json({output:[]})},sent:()=>sent};}
test("missing verifier or disabled master switch prevents execution",async()=>{const f=fixture();assert.equal((await runAtlasScheduled(f.env,{send:f.send})).ran,0);assert.equal((await runAtlasScheduled({...f.env,ATLAS_AUTONOMY:"0"},{verifyAdmin:async()=>true,send:f.send})).ran,0);assert.equal(f.sent(),0);});
test("revoked administrator cannot execute",async()=>{const f=fixture();await runAtlasScheduled(f.env,{verifyAdmin:async()=>false,send:f.send});assert.equal(f.sent(),0);});
test("exhausted quota and emergency stop prevent execution",async()=>{for(const opts of [{quota:false},{active:false}]){const f=fixture(opts);await runAtlasScheduled(f.env,{verifyAdmin:async()=>true,send:f.send});assert.equal(f.sent(),0);}});
test("authorized job uses read-only research",async()=>{const f=fixture();assert.equal((await runAtlasScheduled(f.env,{verifyAdmin:async()=>true,send:f.send})).ran,1);assert.equal(f.sent(),1);});

test("scheduled Worker uses APPS for both administrator checks and never calls AI after denial or outage",async t=>{
 const {default:worker}=await import("../today/src/index.js");
 let aiRequests=0;
 t.mock.method(globalThis,"fetch",async(url,init)=>{
  assert.equal(url,"https://api.openai.com/v1/responses","Only the AI request may leave the service binding");
  assert.equal(init.headers.Authorization,"Bearer provider-key");
  aiRequests++;
  return Response.json({output:[]});
 });
 const cases=[
  {name:"approved twice",proofs:[{allowed:true},{allowed:true}],checks:2,ran:1},
  {name:"not an administrator",proofs:[{allowed:false}],checks:1,ran:0},
  {name:"non-boolean approval",proofs:[{allowed:"true"}],checks:1,ran:0},
  {name:"upstream denial",proofs:[{allowed:true}],status:403,checks:1,ran:0},
  {name:"invalid response",invalid:true,checks:1,ran:0},
  {name:"account unavailable",unavailable:true,checks:1,ran:0},
  {name:"revoked before execution",proofs:[{allowed:true},{allowed:false}],checks:2,ran:0},
 ];
 for(const c of cases){
  aiRequests=0;let verifications=0;const mutations=[],pending=[];
  const env={ATLAS_AUTONOMY:"1",ATLAS_VERIFY_KEY:"verifier-secret",OPENAI_API_KEY:"provider-key",ATLAS_MODEL:"test",ATLAS_DB:{
   prepare(sql){return {bind(){return {
    all:async()=>({results:[task]}),
    first:async()=>{if(!sql.startsWith("SELECT"))mutations.push(sql);return {id:task.id};},
    run:async()=>{mutations.push(sql);return {success:true};},
   }}};},
  },APPS:{fetch:async req=>{
   const call=verifications++;
   assert.equal(req.url,"https://account.inflite.ai/api/atlas-admin");
   assert.equal(req.method,"POST");
   assert.equal(req.redirect,"error");
   assert.equal(req.headers.get("Authorization"),"Bearer verifier-secret");
   assert.equal(req.headers.get("Content-Type"),"application/json");
   assert.equal(req.headers.get("Cookie"),null);
   assert.deepEqual(await req.json(),{owner:task.owner});
   if(c.unavailable)throw Error("account unavailable");
   return c.invalid?new Response("invalid JSON"):Response.json(c.proofs[call],{status:c.status||200});
  }}};
  await worker.scheduled({},env,{waitUntil:p=>pending.push(p)});
  assert.equal(pending.length,1,c.name);
  assert.deepEqual(await pending[0],{ran:c.ran},c.name);
  assert.equal(verifications,c.checks,c.name);
  assert.equal(aiRequests,c.ran,c.name);
  if(c.checks===1)assert.deepEqual(mutations,[],c.name+" must not claim a task or spend quota");
  if(c.ran===0)assert.ok(!mutations.some(sql=>sql.includes("atlas_task_runs")),c.name+" must not start a run");
 }
});
