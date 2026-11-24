import test from "node:test";
import assert from "node:assert/strict";
import {atlas} from "../today/src/atlas.js";
import {upgradeStorage} from "../today/src/atlas-store.js";
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
async function fixture(t){const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-10-01',cf:false,d1Databases:['ATLAS_DB']}));t.after(()=>mf.dispose());const env={ATLAS_DB:await mf.getD1Database('ATLAS_DB')};await upgradeStorage(env);return env;}
const admin={signedIn:true,user:{id:"owner"},apps:{mail:true}};
const standard={signedIn:true,user:{id:"other"},apps:{mail:false}};
const req=(method="GET",body,origin="https://inflite.ai")=>new Request("https://inflite.ai/atlas/api/evolution",{method,headers:{Cookie:"account=abcdefghijklmnopqrstuvwxyz",Origin:origin,"X-Inflite":"1"},...(body?{body:JSON.stringify(body)}:{})});
const proposal={title:"Improve retrieval",hypothesis:"Better retrieval",metric:"Recall",baseline:"Current recall"};
test("standard user cannot access Evolution",async()=>{assert.equal((await atlas(req(),{}, {account:async()=>Response.json(standard)})).status,403);});
test("proposal owner is server assigned and no approval can be forged",async t=>{const env=await fixture(t);const r=await atlas(req("POST",{...proposal,owner:"other",status:"approved"}),env,{account:async()=>Response.json(admin)});assert.equal(r.status,201);const value=await r.json();assert.equal(value.status,"proposed");const row=await env.ATLAS_DB.prepare('SELECT owner,status FROM atlas_improvements WHERE id=?').bind(value.id).first();assert.equal(row.owner,'owner');assert.equal(row.status,'proposed');});
test("cross origin proposal denied",async()=>{assert.equal((await atlas(req("POST",proposal,"https://evil.example"),{ATLAS_DB:{}},{account:async()=>Response.json(admin)})).status,403);});
test("Evolution cannot deploy or execute",async t=>{const env=await fixture(t);const r=await atlas(req(),env,{account:async()=>Response.json(admin)});assert.deepEqual(await r.json(),{proposals:[],execution:false,deployment:false});});
