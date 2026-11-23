import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";

export function bindAtlasDatabase(config,target,id){
  if(!["next","production"].includes(target))throw Error("Choose next or production");
  if(typeof id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error("Invalid D1 UUID");
  const section=target==="next"?"env.next.d1_databases":"d1_databases";
  const lines=config.split("\n"), headers=[];
  for(let i=0;i<lines.length;i++)if(/^\s*\[/.test(lines[i]))headers.push(i);
  const value=(line,key)=>new RegExp("^\\s*"+key+"\\s*=\\s*([\"'])([^\"']*)\\1\\s*(?:#.*)?$").exec(line)?.[2];
  const blocks=[];
  for(let j=0;j<headers.length;j++){
    const start=headers[j],end=headers[j+1]??lines.length;
    if(lines[start].trim().replace(/\s+#.*$/,"")!==`[[${section}]]`)continue;
    const block=lines.slice(start+1,end);
    if(block.some(l=>value(l,"binding")==="ATLAS_DB"))blocks.push({start,end,block});
  }
  if(blocks.length!==1)throw Error("Expected exactly one Atlas D1 binding for "+target);
  const {start,block}=blocks[0];
  for(const [k,expected] of [["binding","ATLAS_DB"],["database_name","inflite-atlas-"+target],["migrations_dir","atlas/migrations"]]){
    const found=block.filter(l=>new RegExp("^\\s*"+k+"\\s*=").test(l));
    if(found.length!==1||value(found[0],k)!==expected)throw Error("Unexpected "+k+" for "+target);
  }
  const existing=block.filter(l=>/^\s*database_id\s*=/.test(l));
  if(existing.length){
    if(existing.length!==1||value(existing[0],"database_id")?.toLowerCase()!==id.toLowerCase())throw Error("Existing D1 UUID differs; review required");
    return config;
  }
  const offset=block.findIndex(l=>value(l,"database_name")==="inflite-atlas-"+target);
  lines.splice(start+offset+2,0,`database_id = "${id}"`);
  return lines.join("\n");
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const target=process.argv[2];
  if(!["next","production"].includes(target))throw Error("Choose next or production");
  const name="inflite-atlas-"+target;
  const wr=(...args)=>execFileSync("npx",["wrangler",...args],{encoding:"utf8"});
  const list=()=>JSON.parse(wr("d1","list","--json"));
  let db=list().find(x=>x.name===name);
  if(!db){wr("d1","create",name);db=list().find(x=>x.name===name);}
  if(!db)throw Error("D1 database not found");
  const config=readFileSync("wrangler.toml","utf8");
  const bound=bindAtlasDatabase(config,target,db.uuid);
  if(bound!==config)writeFileSync("wrangler.toml",bound);
  console.log("Bound "+name+" for "+target);
}
