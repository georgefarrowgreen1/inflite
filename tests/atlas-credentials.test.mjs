import test from "node:test";
import assert from "node:assert/strict";
import {saveCredential,loadCredential} from "../today/src/atlas-credentials.js";
test("credentials encrypted, round trip and owner-bound",async()=>{
 let row;const env={ATLAS_ENCRYPTION_KEY:btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),ATLAS_DB:{prepare(){return {bind(...a){return {run:async()=>{row={iv:a[1],ciphertext:a[2],model:a[3]}},first:async()=>row}}}}}};
 await saveCredential(env,"owner","sk-test-secret","model");
 assert.ok(!JSON.stringify(row).includes("sk-test-secret"));
 assert.deepEqual(await loadCredential(env,"owner"),{secret:"sk-test-secret",model:"model"});
 await assert.rejects(()=>loadCredential(env,"other"));
 await assert.rejects(()=>loadCredential({...env,ATLAS_ENCRYPTION_KEY:""},"owner"));
});
