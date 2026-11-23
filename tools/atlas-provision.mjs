// Run from repository root with authenticated Wrangler. Never writes credentials.
import {spawnSync} from "node:child_process";
const target=process.argv[2];
if(!["next","production"].includes(target))throw Error("Usage: node tools/atlas-provision.mjs next|production");
const name="inflite-atlas-"+target;
const run=(args)=>{const r=spawnSync("npx",["wrangler",...args],{stdio:"inherit",shell:process.platform==="win32"});if(r.status!==0)throw Error("Wrangler command failed");};
run(["d1","create",name]);
console.log("Add the returned database UUID to the matching environment's ATLAS_DB binding in wrangler.toml, with migrations_dir = \"atlas/migrations\". Then run wrangler d1 migrations apply "+name+" --remote --env "+(target==="next"?"next":'""')+".");
