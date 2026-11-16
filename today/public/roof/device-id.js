// A random account-scoped identifier, shared with the native draft worker only
// while its account is verified. This is not a fingerprint or a login token.
export function deviceId(owner){
 if(!/^[\w-]{1,100}$/.test(owner||''))return null;
 try{const key='ifl:device:'+owner;let id=localStorage.getItem(key);if(!/^[a-f0-9]{32}$/.test(id||'')){id=crypto.randomUUID().replace(/-/g,'');localStorage.setItem(key,id)}return id}catch(_){return null}
}
export const deviceLabel=()=>/iPhone|Android.*Mobile/.test(navigator.userAgent)?'Phone':/iPad|Tablet/.test(navigator.userAgent)?'Tablet':'Computer';
