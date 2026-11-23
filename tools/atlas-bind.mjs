import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
const target=process.argv[2];
if(!["next","production"].includes(target))throw Error("Choose next or production");
const name="inflite-atlas-"+target;
const wr=(...args)=>execFileSync("npx",["wrangler",...args],{encoding:"utf8"});
const list=()=>JSON.parse(wr("d1","list","--json"));
let db=list().find(x=>x.name===name);
if(!db){wr("d1","create",name);db=list().find(x=>x.name===name);}
const id=db?.uuid;
if(!/^[0-9a-f-]{36}$/i.test(id||""))throw Error("D1 UUID not found");
let config=readFileSync("wrangler.toml","utf8");
const section=target==="next"?"env.next.d1_databases":"d1_databases";
const block="\n[["+section+"]]\nbinding = \"ATLAS_DB\"\ndatabase_name = \""+name+"\"\ndatabase_id = \""+id+"\"\nmigrations_dir = \"atlas/migrations\"\n";
if(config.includes("[["+section+"]]"))throw Error("Existing D1 binding requires review");
config+=block;
writeFileSync("wrangler.toml",config);
console.log("Bound "+name+" for "+target);
