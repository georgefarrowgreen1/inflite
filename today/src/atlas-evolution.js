import {bodyUpTo} from "./body.js";
export async function evolution(request,env,owner,json){
 if(!env.ATLAS_DB)return json({error:"Evolution storage unavailable"},503);
 const db=env.ATLAS_DB;
 try{
 if(request.method==="GET"){
 const {results}=await db.prepare("SELECT id,title,hypothesis,metric,baseline,status,created_at FROM atlas_improvements WHERE owner=? ORDER BY created_at DESC LIMIT 50").bind(owner).all();
 return json({proposals:results,execution:false,deployment:false});
 }
 if(!["POST","DELETE"].includes(request.method))return json({error:"Method not allowed"},405);
 if(request.headers.get("Origin")!==new URL(request.url).origin||request.headers.get("X-Inflite")!=="1"||(request.headers.has("Sec-Fetch-Site")&&request.headers.get("Sec-Fetch-Site")!=="same-origin"))return json({error:"Invalid origin"},403);
 const raw=await bodyUpTo(request,16384);if(raw===null)return json({error:"Too large"},413);
 let d;try{d=JSON.parse(raw)}catch{return json({error:"Invalid proposal"},400);}
 if(request.method==="DELETE"){
 if(typeof d?.id!=="string"||d.id.length>64)return json({error:"Invalid ID"},400);
 await db.prepare("UPDATE atlas_improvements SET status='archived' WHERE owner=? AND id=?").bind(owner,d.id).run();return json({archived:true});
 }
 for(const [k,max] of [["title",160],["hypothesis",4000],["metric",500],["baseline",2000]])if(typeof d?.[k]!=="string"||!d[k].trim()||d[k].length>max)return json({error:"Invalid "+k},400);
 const id=crypto.randomUUID();
 const saved=await db.prepare("INSERT INTO atlas_improvements(id,owner,title,hypothesis,metric,baseline,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM atlas_improvements WHERE owner=?)<200 RETURNING id").bind(id,owner,d.title,d.hypothesis,d.metric,d.baseline,Date.now(),owner).first();
 if(!saved)return json({error:"Proposal limit reached"},429);
 return json({id,status:"proposed"},201);
 }catch{return json({error:"Evolution storage unavailable"},503);}
}
