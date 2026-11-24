import test from "node:test";
import assert from "node:assert/strict";
import {saveCredential,loadCredential,credentialKeyBytes,CredentialSetupError} from "../today/src/atlas-credentials.js";
test("credentials encrypted, round trip and owner-bound",async()=>{
 let row;const env={ATLAS_ENCRYPTION_KEY:btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),ATLAS_DB:{prepare(){return {bind(...a){return {run:async()=>{row={iv:a[1],ciphertext:a[2],model:a[3]}},first:async()=>row}}}}}};
 await saveCredential(env,"owner","sk-test-secret","model");
 assert.ok(!JSON.stringify(row).includes("sk-test-secret"));
 assert.deepEqual(await loadCredential(env,"owner"),{secret:"sk-test-secret",model:"model"});
 await assert.rejects(()=>loadCredential(env,"other"));
 await assert.rejects(()=>loadCredential({...env,ATLAS_ENCRYPTION_KEY:""},"owner"));
});
test("encryption failures are classified safely before any credential storage",async t=>{
 const secret="sk-private-provider-secret",detail="private-crypto-detail";
 let writes=0;const env={ATLAS_ENCRYPTION_KEY:btoa("k".repeat(32)),ATLAS_DB:{prepare(){writes++;throw Error("must not write");}}};
 t.mock.method(crypto.subtle,"encrypt",async()=>{throw Error(detail+secret);});
 await assert.rejects(()=>saveCredential(env,"owner",secret,"model"),error=>{
  assert.ok(error instanceof CredentialSetupError);
  assert.equal(error.code,"provider_encryption_failed");
  assert.ok(!String(error).includes(secret));assert.ok(!String(error).includes(detail));return true;
 });
 assert.equal(writes,0);
});
test("encryption configuration validates decoded bytes rather than the visible string length",()=>{
 const raw=new Uint8Array(32).fill(201),encoded=btoa(String.fromCharCode(...raw));
 assert.deepEqual(credentialKeyBytes({ATLAS_ENCRYPTION_KEY:encoded}),raw);
 for(const value of [undefined,"","%".repeat(44),"ab".repeat(32),btoa("x".repeat(31)),btoa("x".repeat(33))]){
  assert.throws(()=>credentialKeyBytes({ATLAS_ENCRYPTION_KEY:value}),error=>error instanceof CredentialSetupError&&error.code==="provider_encryption_invalid");
 }
});
