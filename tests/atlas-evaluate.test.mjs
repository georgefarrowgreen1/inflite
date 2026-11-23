import test from "node:test";
import assert from "node:assert/strict";
import {compare} from "../tools/atlas-evaluate.mjs";
const a={sha:"a".repeat(40),suite:"api-v1",passed:10,failed:0,durationMs:100};
const b={...a,sha:"b".repeat(40)};
test("comparable passing candidate requires review",()=>{const r=compare(a,b);assert.equal(r.outcome,"pass");assert.equal(r.requiresHumanReview,true);});
test("regression fails",()=>assert.equal(compare(a,{...b,passed:9,failed:1}).outcome,"fail"));
test("different test suite or count is inconclusive",()=>{assert.equal(compare(a,{...b,suite:"other"}).outcome,"inconclusive");assert.equal(compare(a,{...b,passed:9}).outcome,"inconclusive");});
test("invalid or empty metrics rejected",()=>{assert.throws(()=>compare(a,{...b,passed:0}));assert.throws(()=>compare(a,{...b,durationMs:-1}));});
