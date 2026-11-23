import test from "node:test";
import assert from "node:assert/strict";
import {runAtlasScheduled} from "../today/src/atlas-scheduler.js";
const task={id:"t",owner:"admin",prompt:"research",interval_minutes:60};
function fixture({quota=true,active=true}={}){let sent=0;const db={prepare(sql){return {bind(){return {all:async()=>({results:[task]}),first:async()=>sql.includes("atlas_usage")?(quota?{}:null):sql.startsWith("SELECT")?(active?{}:null):{},run:async()=>({success:true})}}}}};return {env:{ATLAS_AUTONOMY:"1",ATLAS_DB:db,OPENAI_API_KEY:"test",ATLAS_MODEL:"test"},send:async()=>{sent++;return Response.json({output:[]})},sent:()=>sent};}
test("missing verifier or disabled master switch prevents execution",async()=>{const f=fixture();assert.equal((await runAtlasScheduled(f.env,{send:f.send})).ran,0);assert.equal((await runAtlasScheduled({...f.env,ATLAS_AUTONOMY:"0"},{verifyAdmin:async()=>true,send:f.send})).ran,0);assert.equal(f.sent(),0);});
test("revoked administrator cannot execute",async()=>{const f=fixture();await runAtlasScheduled(f.env,{verifyAdmin:async()=>false,send:f.send});assert.equal(f.sent(),0);});
test("exhausted quota and emergency stop prevent execution",async()=>{for(const opts of [{quota:false},{active:false}]){const f=fixture(opts);await runAtlasScheduled(f.env,{verifyAdmin:async()=>true,send:f.send});assert.equal(f.sent(),0);}});
test("authorized job uses read-only research",async()=>{const f=fixture();assert.equal((await runAtlasScheduled(f.env,{verifyAdmin:async()=>true,send:f.send})).ran,1);assert.equal(f.sent(),1);});
