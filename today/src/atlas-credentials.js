const enc=new TextEncoder(),dec=new TextDecoder();
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a)));
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function key(env){const raw=bytes(env.ATLAS_ENCRYPTION_KEY||"");if(raw.length!==32)throw Error("Encryption not configured");return crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);}
export async function saveCredential(env,owner,secret,model){
 const k=await key(env),iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode(JSON.stringify([owner,model]))},k,enc.encode(secret));
 await env.ATLAS_DB.prepare("INSERT INTO atlas_credentials(owner,iv,ciphertext,model,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET iv=excluded.iv,ciphertext=excluded.ciphertext,model=excluded.model,updated_at=excluded.updated_at").bind(owner,b64(iv),b64(ciphertext),model,Date.now()).run();
}
export async function loadCredential(env,owner){
 if(!env.ATLAS_DB)return null;
 const row=await env.ATLAS_DB.prepare("SELECT iv,ciphertext,model FROM atlas_credentials WHERE owner=?").bind(owner).first();
 if(!row)return null;
 const secret=dec.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(row.iv),additionalData:enc.encode(JSON.stringify([owner,row.model]))},await key(env),bytes(row.ciphertext)));
 return {secret,model:row.model};
}
