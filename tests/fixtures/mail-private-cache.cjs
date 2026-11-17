// Actual Workers and a real HTTP origin: Playwright interception disables the
// browser HTTP cache and cannot reproduce an authenticated cache leak.
const {DatabaseSync}=require('node:sqlite');
const {createServer}=require('node:http');
const ACCOUNT='https://account.inflite.ai';
const COOKIE='account='+'a'.repeat(32);
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 const st=(q,a=[])=>({bind:(...b)=>st(q,b),first:async()=>sql.prepare(q).get(...a)??null,all:async()=>({results:sql.prepare(q).all(...a)}),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...a).changes)}})});
 const DB={prepare:q=>st(q),batch:async list=>{const out=[];for(const s of list)out.push(await s.all());return out;}};
 const bytes=new TextEncoder().encode('PRIVATE-ATTACHMENT-ADMIN');
 const MAIL={get:async(key,options)=>{
  if(key==='raw/message1.eml')return {body:'PRIVATE-ORIGINAL-ADMIN'};
  if(key!=='att/file1')return null;
  const match=/^bytes=(\d+)-(\d+)$/.exec(options?.range?.get('Range')||'');
  if(match){const offset=Number(match[1]),length=Number(match[2])-offset+1;return {body:bytes.slice(offset,offset+length),size:bytes.length,range:{offset,length}};}
  return {body:bytes,size:bytes.length};
 }};
 const authCalls=[];
 const APPS={fetch:async req=>{
  authCalls.push({url:req.url,cookie:req.headers.get('cookie')});
  const admin=req.headers.get('cookie')===COOKIE;
  if(new URL(req.url).pathname.endsWith('/photo'))return admin?new Response('PRIVATE-PHOTO-ADMIN',{headers:{'Content-Type':'image/png'}}):new Response(null,{status:401});
  if(new URL(req.url).pathname.endsWith('/avatar'))return admin?new Response('PRIVATE-AVATAR-ADMIN',{headers:{'Content-Type':'image/png'}}):new Response(null,{status:401});
  return Response.json(admin?{signedIn:true,admin:true,passkey:true,fresh:true,name:'Private admin'}:{signedIn:false});
 }};
 const env={DB,MAIL,APPS,ACCOUNT_ORIGIN:ACCOUNT,DOMAIN:'inflite.ai',DEFAULT_FROM:'hello@inflite.ai',ASSETS:{fetch:async()=>new Response('<!doctype html><title>Cache boundary</title>',{headers:{'Content-Type':'text/html'}})}};
 const mail=(await import('../../email/src/index.js')).default;
 const today=(await import('../../today/src/index.js')).default;
 await (await import('../../email/src/db.js')).ensureSchema(env);
 sql.prepare('INSERT INTO attachments (id,message_id,filename,type,size) VALUES (?,?,?,?,?)').run('file1','message1','private.mp3','audio/mpeg',bytes.length);
 const ctx={waitUntil:p=>Promise.resolve(p).catch(()=>{})};
 const request=(path,cookie=COOKIE,headers={})=>new Request('https://email.inflite.ai'+path,{headers:{...(cookie?{Cookie:cookie}:{}),...headers}});
 const hits=[];
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://'+req.headers.host);
   if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<!doctype html><title>Cache boundary</title>');return;}
   hits.push(url.pathname+url.search);
   const incoming=new Request(url,{headers:req.headers});
   const out=await (url.pathname==='/api/avatar'?today:mail).fetch(incoming,env,ctx);
   res.writeHead(out.status,Object.fromEntries(out.headers));res.end(Buffer.from(await out.arrayBuffer()));
  }catch(error){res.writeHead(500);res.end(String(error.stack));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {env,mail,today,ctx,request,hits,authCalls,origin:'http://127.0.0.1:'+server.address().port,close:async()=>{await new Promise(resolve=>server.close(resolve));sql.close();}};
}
module.exports={fixture,COOKIE};
