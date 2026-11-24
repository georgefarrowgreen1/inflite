const enc=new TextEncoder(),dec=new TextDecoder();
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a)));
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export class CredentialSetupError extends Error{
 constructor(code){super(code);this.name="CredentialSetupError";this.code=code;}
}
export function credentialKeyBytes(env){
 try{
  if(typeof env.ATLAS_ENCRYPTION_KEY!=="string")throw Error();
  const raw=bytes(env.ATLAS_ENCRYPTION_KEY);
  if(raw.length!==32)throw Error();
  return raw;
 }catch{throw new CredentialSetupError("provider_encryption_invalid");}
}
async function key(env){
 const raw=credentialKeyBytes(env);
 try{return await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);}
 catch{throw new CredentialSetupError("provider_encryption_failed");}
}
export async function saveCredential(env,owner,secret,model){
 const k=await key(env);let iv,ciphertext;
 try{
  iv=crypto.getRandomValues(new Uint8Array(12));
  ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode(JSON.stringify([owner,model]))},k,enc.encode(secret));
 }catch{throw new CredentialSetupError("provider_encryption_failed");}
 try{
  // A replacement must have a distinct revision even within one millisecond;
  // provider health records are guarded against this revision by the store.
  const result=await env.ATLAS_DB.prepare("INSERT INTO atlas_credentials(owner,iv,ciphertext,model,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET iv=excluded.iv,ciphertext=excluded.ciphertext,model=excluded.model,updated_at=MAX(atlas_credentials.updated_at+1,excluded.updated_at)").bind(owner,b64(iv),b64(ciphertext),model,Date.now()).run();
  if(result?.success===false)throw Error();
 }catch{throw new CredentialSetupError("provider_database_write_failed");}
}
export async function loadCredential(env,owner){
 if(!env.ATLAS_DB)return null;
 let row;
 try{row=await env.ATLAS_DB.prepare("SELECT iv,ciphertext,model,updated_at FROM atlas_credentials WHERE owner=?").bind(owner).first();}
 catch{throw new CredentialSetupError("provider_database_read_failed");}
 if(!row)return null;
 const k=await key(env);let secret;
 try{secret=dec.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(row.iv),additionalData:enc.encode(JSON.stringify([owner,row.model]))},k,bytes(row.ciphertext)));}
 catch{throw new CredentialSetupError("provider_credential_unreadable");}
 return {secret,model:row.model,...(Number.isFinite(row.updated_at)?{updatedAt:row.updated_at}:{})};
}

// Integration secrets use a separate authenticated domain from provider keys.
// The caller owns storage and never receives the raw encryption key.
export async function encryptIntegration(env,owner,kind,secret){
 if(typeof owner!=="string"||!owner||typeof kind!=="string"||!kind||typeof secret!=="string"||!secret)throw new CredentialSetupError("integration_secret_invalid");
 const k=await key(env);
 try{
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode(JSON.stringify(["integration",owner,kind]))},k,enc.encode(secret));
  return {iv:b64(iv),ciphertext:b64(ciphertext)};
 }catch{throw new CredentialSetupError("provider_encryption_failed");}
}
export async function decryptIntegration(env,owner,kind,record){
 const k=await key(env);
 try{return dec.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(record.iv),additionalData:enc.encode(JSON.stringify(["integration",owner,kind]))},k,bytes(record.ciphertext)));}
 catch{throw new CredentialSetupError("integration_secret_unreadable");}
}
