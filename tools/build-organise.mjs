// Keep the native app graph immutable: an older open tab must load its own
// editor and stylesheet, even after a newer release is deployed.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {transformSync} from 'esbuild';
const build=process.argv[2];if(!/^\d+\.\d+\.\d+$/.test(build||''))throw Error('Usage: node tools/build-organise.mjs 4.6.1 [--draft]');
const root=resolve(import.meta.dirname,'../today/public'),source=resolve(root,'organise'),base='/organise/releases/'+build+'/',files=['app.js','store.js','model.js','editor.js','links.js','actions.js','connected.js','import.js','organise.css','editor.css'];
function put(path,contents){if(existsSync(path)&&readFileSync(path,'utf8')!==contents&&!process.argv.includes('--draft'))throw Error('Release assets are immutable: '+path);mkdirSync(resolve(path,'..'),{recursive:true});writeFileSync(path,contents)}
for(const f of files){
 const contents=readFileSync(resolve(source,f),'utf8');
 put(resolve(root,'.'+base+f),f.endsWith('.js')?transformSync(contents,{format:'esm',minifyIdentifiers:true,minifySyntax:true,legalComments:'none'}).code:contents);
}
for(const app of ['calendar','notes','people']){
 const path='/'+app+'/roof/releases/'+build+'/';
 put(resolve(root,'.'+path+app+'.js'),readFileSync(resolve(root,app,'roof',app+'.js'),'utf8').replace("'/organise/app.js'",JSON.stringify(base+'app.js')));
 let c=readFileSync(resolve(root,app,'roof/connector.js'),'utf8');c=c.replaceAll('/organise/',base).replace('/'+app+'/roof/'+app+'.js',path+app+'.js');
 put(resolve(root,'.'+path+'connector.js'),c);
}
console.log('Built immutable native app graph '+build);
