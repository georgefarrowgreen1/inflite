import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import * as store from '../today/src/atlas-store.js';
import * as repository from '../today/src/atlas-repository.js';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const hash=value=>createHash('sha1').update(value).digest('hex');
const blob=text=>hash(Buffer.concat([Buffer.from('blob '+Buffer.byteLength(text)+'\0'),Buffer.from(text)]));
const clone=files=>Object.fromEntries(Object.entries(files).map(([path,value])=>[path,{...value}]));
const TOKEN='github-fixture-token-for-alice-only';

function githubFixture(name='owner/project'){
  const calls=[],trees=new Map(),commits=new Map(),branches=new Map(),pulls=[];
  const initial={'src/app.js':{text:'export const value = 1;\n',mode:'100644'},'README.md':{text:'# Original\n',mode:'100644'},'link.js':{text:'src/app.js',mode:'120000'},'.env':{text:'FIXTURE_ONLY=yes',mode:'100644'}};
  const treeFor=files=>{
    const sha=hash(JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))));trees.set(sha,clone(files));return sha;
  };
  const entries=files=>Object.entries(files).map(([path,value])=>({path,mode:value.mode,type:'blob',sha:blob(value.text),size:Buffer.byteLength(value.text)}));
  const baseSha=hash('original fixture commit'),baseTree=treeFor(initial);
  commits.set(baseSha,{sha:baseSha,tree:{sha:baseTree},parents:[],message:'Original'});branches.set('main',baseSha);
  const state={name,calls,trees,commits,branches,pulls,baseSha,baseTree,treeFor,contentsSha:null,treeTruncated:false,logLocation:'https://fixture.blob.core.windows.net/logs/job.txt?sig=fixture-only',logs:'A fixture failure\n',downloadError:false,failAfterPull:false,changedPull:false,pullReads:0};
  state.send=async(input,init={})=>{
    const url=new URL(input),headers=new Headers(init.headers),method=init.method||'GET',body=init.body?JSON.parse(init.body):null;
    calls.push({url:url.href,method,headers,body,redirect:init.redirect,credentials:init.credentials});
    assert.equal(init.redirect,'manual','every GitHub and log fetch disables automatic redirects');
    if(url.origin!=='https://api.github.com'){
      assert.equal(headers.has('authorization'),false);assert.equal(headers.has('cookie'),false);assert.equal(init.credentials,'omit');
      if(state.downloadError)throw Error('fixture SAS or token must not escape');
      return new Response(state.logs);
    }
    if(url.pathname==='/user')return json({login:headers.get('authorization')?.includes('bob')?'bob':'alice'});
    if(url.pathname==='/user/repos')return json([{full_name:name,private:true,default_branch:'main'}]);
    if(url.pathname==='/repos/'+name)return json({full_name:name,private:true,default_branch:'main',permissions:{push:true}});
    const prefix='/repos/'+name;
    assert.ok(url.pathname.startsWith(prefix+'/'),'fixture route remains in its repository');
    const path=decodeURIComponent(url.pathname.slice(prefix.length));
    if(path.startsWith('/commits/')){
      const ref=path.slice('/commits/'.length),sha=branches.get(ref)||ref,commit=commits.get(sha);
      return commit?json({sha,commit:{tree:commit.tree}}):json({},404);
    }
    if(path.startsWith('/git/commits/')&&method==='GET')return json(commits.get(path.slice('/git/commits/'.length))||{},commits.has(path.slice('/git/commits/'.length))?200:404);
    if(path.startsWith('/git/trees/')&&method==='GET'){
      const id=path.slice('/git/trees/'.length),files=trees.get(id)||trees.get(commits.get(id)?.tree.sha);
      return files?json({sha:id,tree:entries(files),truncated:state.treeTruncated}):json({},404);
    }
    if(path.startsWith('/contents/')){
      const filePath=path.slice('/contents/'.length),ref=url.searchParams.get('ref'),sha=branches.get(ref)||ref,file=trees.get(commits.get(sha)?.tree.sha)?.[filePath];
      return file?json({type:'file',encoding:'base64',sha:state.contentsSha||blob(file.text),size:Buffer.byteLength(file.text),content:Buffer.from(file.text).toString('base64')}):json({},404);
    }
    if(path==='/git/trees'&&method==='POST'){
      const files=clone(trees.get(body.base_tree));
      for(const item of body.tree){assert.equal(item.type,'blob');files[item.path]={text:item.content,mode:item.mode};}
      return json({sha:treeFor(files)},201);
    }
    if(path==='/git/commits'&&method==='POST'){
      const sha=hash(JSON.stringify(body)),commit={sha,tree:{sha:body.tree},parents:body.parents.map(sha=>({sha})),message:body.message};commits.set(sha,commit);return json(commit,201);
    }
    if(path.startsWith('/git/ref/heads/')){
      const branch=path.slice('/git/ref/heads/'.length),sha=branches.get(branch);return sha?json({ref:'refs/heads/'+branch,object:{sha}}):json({},404);
    }
    if(path==='/git/refs'&&method==='POST'){
      const branch=body.ref.slice('refs/heads/'.length);if(branches.has(branch))return json({},422);branches.set(branch,body.sha);return json({ref:body.ref,object:{sha:body.sha}},201);
    }
    if(path==='/pulls'&&method==='GET'){
      const wanted=url.searchParams.get('head')?.split(':').slice(1).join(':');return json(pulls.filter(p=>p.state==='open'&&(!wanted||p.head.ref===wanted)));
    }
    if(path==='/pulls'&&method==='POST'){
      const pr={number:pulls.length+1,html_url:'https://github.com/'+name+'/pull/'+(pulls.length+1),state:'open',draft:body.draft,title:body.title,body:body.body,head:{ref:body.head,sha:branches.get(body.head)},base:{ref:body.base,sha:branches.get(body.base)}};
      pulls.push(pr);if(state.failAfterPull){state.failAfterPull=false;throw Error('fixture lost response after creation');}return json(pr,201);
    }
    if(path==='/pulls/42'){
      state.pullReads++;return json({number:42,title:'Fixture review',body:'Check this change',html_url:'https://github.com/'+name+'/pull/42',head:{sha:state.changedPull&&state.pullReads>1?hash('moved head'):hash('pull head')},base:{sha:baseSha},changed_files:1});
    }
    if(path==='/pulls/42/files')return json([{filename:'src/app.js',patch:'@@ -1 +1 @@\n-old\n+new'}]);
    if(path==='/actions/jobs/41')return json({id:41,name:'Unit tests',status:'completed',conclusion:'failure',head_sha:baseSha,html_url:'https://github.com/'+name+'/actions/runs/1/job/41',steps:[{name:'Test',conclusion:'failure'}]});
    if(path==='/actions/jobs/41/logs')return new Response(null,{status:302,headers:{Location:state.logLocation}});
    throw Error('Unexpected fixture GitHub route: '+method+' '+path);
  };
  return state;
}

async function fixture(t,{connect=true}={}){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-10-01',cf:false,d1Databases:['ATLAS_DB']}));t.after(()=>mf.dispose());
  const env={ATLAS_DB:await mf.getD1Database('ATLAS_DB'),ATLAS_ENCRYPTION_KEY:btoa(String.fromCharCode(...new Uint8Array(32).fill(9)))};
  await store.upgradeStorage(env);const api=githubFixture();
  if(connect)await repository.connectGithub(env,'alice',TOKEN,{send:api.send});
  return {env,api};
}

function replaceRepositoryFiles(api, files) {
  api.baseTree=api.treeFor(files);
  api.commits.get(api.baseSha).tree={sha:api.baseTree};
}

const sourceFile=text=>({text,mode:'100644'});
const readFile=(reader,path,position={})=>reader.runTool('repository_read_file',{path,start_line:1,line_count:100,start_column:0,...position});

async function draft(env,api){
  const c=await store.createConversation(env,'alice',{title:'Code review',mode:'developer',repository:api.name});
  const inputs=await repository.patchInputs(env,'alice',{repository:api.name,paths:['src/app.js']},{send:api.send});
  const validated=repository.validatePatchOutput({title:'Improve the value',summary:'Update the selected constant.',testPlan:'Run unit tests and review CI.',files:[{path:'src/app.js',content:'export const value = 2;\n'}]},inputs);
  return repository.savePatch(env,'alice',c.id,validated);
}

test('GitHub secrets are encrypted and bound to the owner in real D1',async t=>{
  const {env,api}=await fixture(t),row=await env.ATLAS_DB.prepare("SELECT * FROM atlas_integrations WHERE owner='alice'").first();
  assert.notEqual(row.ciphertext,TOKEN);assert.ok(!JSON.stringify(row).includes(TOKEN));assert.equal((await repository.githubStatus(env,'alice')).login,'alice');assert.equal((await repository.githubStatus(env,'bob')).connected,false);
  await assert.rejects(()=>repository.repositoryTree(env,'bob',{repository:api.name},{send:api.send}),{code:'repository_not_allowed'});
  await env.ATLAS_DB.prepare("INSERT INTO atlas_integrations(owner,kind,iv,ciphertext,metadata,updated_at) VALUES('bob','github',?,?,?,?)").bind(row.iv,row.ciphertext,row.metadata,row.updated_at).run();
  await assert.rejects(()=>repository.githubStatus(env,'bob'),{code:'github_credential_unreadable'});
  await repository.disconnectGithub(env,'alice');assert.equal((await repository.githubStatus(env,'alice')).connected,false);
});

test('API redirects are not followed and repository authentication stays on the fixed GitHub host',async t=>{
  const {env}=await fixture(t);let calls=0;
  await assert.rejects(()=>repository.listRepositories(env,'alice',{send:async(url,init)=>{calls++;assert.equal(new URL(url).origin,'https://api.github.com');assert.equal(init.redirect,'manual');assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+TOKEN);return new Response(null,{status:302,headers:{Location:'https://attacker.example/token'}});}}),{code:'github_request_failed'});
  assert.equal(calls,1);
  assert.throws(()=>repository.safeRepository('../project'),{code:'repository_invalid'});assert.throws(()=>repository.safeRepository('owner/project?token=x'),{code:'repository_invalid'});
});

test('file context is pinned to a commit and rejects traversal, secrets, symlinks and mismatched blob revisions',async t=>{
  const {env,api}=await fixture(t);
  for(const path of ['../src/app.js','src/../app.js','.env','secrets.json','key.pem','src//app.js','src\\app.js'])assert.throws(()=>repository.safeRepositoryPath(path));
  const tree=await repository.repositoryTree(env,'alice',{repository:api.name},{send:api.send});assert.deepEqual(tree.files.map(f=>f.path).sort(),['README.md','src/app.js']);assert.equal(tree.ref,api.baseSha);
  const context=await repository.repositoryContext(env,'alice',{repository:api.name,kind:'file',path:'src/app.js'},{send:api.send});assert.equal(context.ref,api.baseSha);assert.equal(context.text,'export const value = 1;\n');assert.ok(context.url.includes(api.baseSha));
  const contentsCall=api.calls.find(c=>new URL(c.url).pathname.endsWith('/contents/src/app.js'));assert.equal(new URL(contentsCall.url).searchParams.get('ref'),api.baseSha);
  await assert.rejects(()=>repository.repositoryContext(env,'alice',{repository:api.name,kind:'file',path:'link.js'},{send:api.send}),{code:'file_not_text'});
  api.contentsSha=hash('unexpected blob');await assert.rejects(()=>repository.repositoryContext(env,'alice',{repository:api.name,kind:'file',path:'src/app.js'},{send:api.send}),{code:'file_revision_changed'});
});

test('automatic repository context supplies an overview and scoped read-only tools without manual selections',async t=>{
  const {env,api}=await fixture(t);
  const reader=await repository.createRepositoryReader(env,'alice',{repository:api.name,query:'Explain the project'},{send:api.send});
  assert.equal(reader.repository,api.name);assert.equal(reader.ref,api.baseSha);assert.equal(reader.branch,'main');
  assert.match(reader.overview,/# Original/);assert.ok(reader.overview.includes(api.name));assert.ok(reader.overview.includes(api.baseSha));
  assert.ok(Buffer.byteLength(reader.overview)<=32768);assert.ok(!reader.overview.includes(TOKEN));
  assert.deepEqual(reader.tools.map(tool=>tool.name),['repository_list_files','repository_read_file','repository_search']);
  for(const tool of reader.tools){assert.equal(tool.type,'function');assert.equal(tool.strict,true);assert.equal(tool.parameters.additionalProperties,false);assert.deepEqual(tool.parameters.required,Object.keys(tool.parameters.properties));assert.equal(Object.hasOwn(tool.parameters.properties,'repository'),false);assert.equal(Object.hasOwn(tool.parameters.properties,'ref'),false);}
  assert.deepEqual(reader.sources.map(source=>source.path),['README.md']);
  assert.equal(reader.sources[0].repository,api.name);assert.equal(reader.sources[0].ref,api.baseSha);assert.equal(reader.sources[0].blobSha,blob('# Original\n'));assert.equal(reader.sources[0].mode,'100644');assert.equal(Object.hasOwn(reader.sources[0],'text'),false);
  const before=api.calls.length;
  await assert.rejects(()=>repository.createRepositoryReader(env,'bob',{repository:api.name},{send:api.send}),{code:'repository_not_allowed'});assert.equal(api.calls.length,before);
  await assert.rejects(()=>readFile(reader,'src/app.js',{repository:'other/project'}),{code:'repository_tool_arguments'});
  await assert.rejects(()=>reader.runTool('repository_read_file',{path:'src/app.js'}),{code:'repository_tool_arguments'});
  await assert.rejects(()=>reader.runTool('repository_publish_patch',{}),{code:'repository_tool_invalid'});
  assert.ok(api.calls.every(call=>call.method==='GET'));assert.ok(api.calls.every(call=>call.headers.get('authorization')==='Bearer '+TOKEN));
});

test('automatic reads support large source files, immutable commits and cached continuation',async t=>{
  const {env,api}=await fixture(t),path='email/public/app.js';
  const text=Array.from({length:10000},(_,index)=>'export const value'+index+' = "original source";').join('\n');
  assert.ok(Buffer.byteLength(text)>256*1024);assert.ok(Buffer.byteLength(text)<512*1024);
  replaceRepositoryFiles(api,{'README.md':sourceFile('# Large project\n'),[path]:sourceFile(text)});
  const reader=await repository.createRepositoryReader(env,'alice',{repository:api.name},{send:api.send});
  const changed=hash('advanced branch'),changedTree=api.treeFor({[path]:sourceFile('changed source')});api.commits.set(changed,{sha:changed,tree:{sha:changedTree}});api.branches.set('main',changed);
  const part=await readFile(reader,path,{start_line:8000,line_count:2});assert.match(part.text,/value7999 = "original source"/);assert.match(part.text,/value8000 = "original source"/);assert.deepEqual(part.next,{start_line:8002,start_column:0});
  const before=api.calls.length;await readFile(reader,path,{...part.next,line_count:2});assert.equal(api.calls.length,before,'further windows reuse the fetched source');
  const contents=api.calls.filter(call=>new URL(call.url).pathname.endsWith('/contents/'+path));assert.equal(contents.length,1);assert.equal(new URL(contents[0].url).searchParams.get('ref'),api.baseSha);
  assert.equal(reader.sources.find(source=>source.path===path).blobSha,blob(text));assert.ok(Buffer.byteLength(JSON.stringify(part))<24*1024);
});

test('repository discovery continues beyond the former 2,000-file selection limit',async t=>{
  const {env,api}=await fixture(t),files=Object.fromEntries(Array.from({length:2105},(_,index)=>['src/file'+String(index).padStart(4,'0')+'.js',sourceFile('export const fixture = '+index+';')]));
  replaceRepositoryFiles(api,files);const reader=await repository.createRepositoryReader(env,'alice',{repository:api.name},{send:api.send});
  assert.match(reader.overview,/indexed: 2105/);
  const listed=await reader.runTool('repository_list_files',{directory:'',query:'',cursor:2080,recursive:true});assert.equal(listed.items.length,25);assert.equal(listed.items.at(-1).path,'src/file2104.js');assert.equal(listed.next_cursor,null);assert.equal(listed.tree_incomplete,false);
  const found=await reader.runTool('repository_search',{query:'file2104',path_filter:'src/',cursor:0,search_content:false});assert.equal(found.matches[0].path,'src/file2104.js');
  assert.match((await readFile(reader,'src/file2104.js')).text,/fixture = 2104/);
});

test('truncated recursive trees can be explored through verified pinned directory trees',async t=>{
  const {env,api}=await fixture(t),filePath='deep/nested/feature.js',text='export const hiddenFeature = true;';
  replaceRepositoryFiles(api,{'README.md':sourceFile('# Truncated project'),[filePath]:sourceFile(text)});
  const deepSha=hash('deep tree'),nestedSha=hash('nested tree'),nestedCalls=[],send=api.send;
  const responses=new Map([
    [api.baseTree+':true',{truncated:true,tree:[{path:'README.md',type:'blob',mode:'100644',size:19,sha:blob('# Truncated project')}]}],
    [api.baseTree+':false',{truncated:false,tree:[{path:'deep',type:'tree',mode:'040000',sha:deepSha},{path:'escape',type:'blob',mode:'120000',sha:hash('symlink'),size:4},{path:'outside.js',type:'commit',mode:'160000',sha:hash('submodule')},{path:'../escape.js',type:'blob',mode:'100644',sha:blob('bad'),size:3}]}],
    [deepSha+':false',{truncated:false,tree:[{path:'nested',type:'tree',mode:'040000',sha:nestedSha},{path:'nested/injected.js',type:'blob',mode:'100644',sha:blob('bad'),size:3}]}],
    [nestedSha+':false',{truncated:false,tree:[{path:'feature.js',type:'blob',mode:'100644',sha:blob(text),size:Buffer.byteLength(text)}]}]
  ]);
  const reader=await repository.createRepositoryReader(env,'alice',{repository:api.name},{send:async(input,init)=>{
    const url=new URL(input),sha=url.pathname.split('/git/trees/')[1];
    if(sha){assert.equal(init.redirect,'manual');nestedCalls.push(sha+':'+url.searchParams.has('recursive'));const result=responses.get(sha+':'+url.searchParams.has('recursive'));assert.ok(result);return json(result);}
    return send(input,init);
  }});
  assert.match(reader.overview,/truncated the recursive tree/);
  const root=await reader.runTool('repository_list_files',{directory:'',query:'',cursor:0,recursive:false});assert.deepEqual(root.items,[{path:'deep',type:'directory'}]);
  assert.match((await readFile(reader,filePath)).text,/hiddenFeature = true/);assert.deepEqual(nestedCalls,[api.baseTree+':true',api.baseTree+':false',deepSha+':false',nestedSha+':false']);
  await assert.rejects(()=>readFile(reader,'deep/nested/injected.js'),{code:'file_not_text'});
  await assert.rejects(()=>readFile(reader,'escape/secret.js'),{code:'repository_directory_missing'});
  assert.ok(api.calls.filter(call=>new URL(call.url).pathname.includes('/contents/')).every(call=>new URL(call.url).searchParams.get('ref')===api.baseSha));
});

test('automatic discovery excludes secrets, binaries, symlinks and dependencies and reports oversized files',async t=>{
  const {env,api}=await fixture(t),excluded=['.env.production','.aws/credentials','.npmrc','config/secrets.json','cert.pem','.docker/config.json','.dev.vars','terraform.tfstate','assets/logo.png','dist/generated.js','node_modules/library/index.js'];
  const files=Object.fromEntries(excluded.map(path=>[path,sourceFile('private or generated')]));files['src/okay.js']=sourceFile('regular source');files['symlink.js']={text:'src/okay.js',mode:'120000'};files['large/source.js']=sourceFile('x'.repeat(512*1024+1));
  replaceRepositoryFiles(api,files);const reader=await repository.createRepositoryReader(env,'alice',{repository:api.name},{send:api.send});
  const listing=await reader.runTool('repository_list_files',{directory:'',query:'',cursor:0,recursive:true});assert.deepEqual(listing.items.map(item=>item.path),['large/source.js','src/okay.js']);assert.equal(listing.items[0].readable,false);
  const before=api.calls.length;
  for(const path of [...excluded,'symlink.js','../src/okay.js','src\\okay.js'])await assert.rejects(()=>readFile(reader,path));
  await assert.rejects(()=>readFile(reader,'large/source.js'),error=>error.code==='repository_file_large'&&error.message.includes('512 KiB'));
  assert.equal(api.calls.length,before,'blocked files are rejected before downloading any contents');
});

test('content search reports scanned coverage, continuation and bounded per-file matches',async t=>{
  const {env,api}=await fixture(t),files=Object.fromEntries(Array.from({length:15},(_,index)=>['src/'+String(index).padStart(2,'0')+'.js',sourceFile(index===14?'literal NEEDLE\nneedle again\nneedle third\nneedle fourth\n':'no relevant match\n')]));
  replaceRepositoryFiles(api,files);const reader=await repository.createRepositoryReader(env,'alice',{repository:api.name},{send:api.send});
  const first=await reader.runTool('repository_search',{query:'needle',path_filter:'src/',cursor:0,search_content:true});assert.equal(first.matches.length,0);assert.equal(first.scanned_files.length,12);assert.equal(first.next_cursor,12);assert.equal(first.total_candidate_files,15);assert.match(first.coverage,/only scanned_files/);assert.equal(reader.sources.length,0);
  const second=await reader.runTool('repository_search',{query:'needle',path_filter:'src/',cursor:first.next_cursor,search_content:true});assert.equal(second.scanned_files.length,3);assert.equal(second.matches.length,3);assert.equal(second.matches_limited,true);assert.equal(second.next_cursor,null);assert.deepEqual(reader.sources.map(source=>source.path),['src/14.js']);
  assert.ok(second.matches.every(match=>match.path==='src/14.js'));assert.ok(Buffer.byteLength(JSON.stringify(second))<24*1024);
});

test('long Unicode source lines have lossless bounded continuation even when JSON escaping expands text',async t=>{
  const {env,api}=await fixture(t),text=('é😀"\t'.repeat(5000))+'END';
  replaceRepositoryFiles(api,{'src/unicode.js':sourceFile(text)});const reader=await repository.createRepositoryReader(env,'alice',{repository:api.name},{send:api.send});
  let position={start_line:1,start_column:0},rebuilt='',windows=0;
  do{
    const part=await readFile(reader,'src/unicode.js',{...position,line_count:1});assert.ok(Buffer.byteLength(JSON.stringify(part))<24*1024);assert.equal(part.text.includes('\ufffd'),false);rebuilt+=part.text.replace(/^1(?::\d+)?: /,'');windows++;position=part.next;
  }while(position);
  assert.ok(windows>1);assert.equal(rebuilt,text);assert.equal(api.calls.filter(call=>new URL(call.url).pathname.endsWith('/contents/src/unicode.js')).length,1);
  await assert.rejects(()=>readFile(reader,'src/unicode.js',{start_column:2}),{code:'repository_tool_arguments'});
});

test('reader cancellation and mismatched blob revisions fail without leaking partial context',async t=>{
  const {env,api}=await fixture(t),controller=new AbortController();
  const reader=await repository.createRepositoryReader(env,'alice',{repository:api.name},{send:api.send,signal:controller.signal});api.contentsSha=hash('wrong blob');
  await assert.rejects(()=>readFile(reader,'src/app.js'),{code:'file_revision_changed'});assert.deepEqual(reader.sources.map(source=>source.path),['README.md']);
  controller.abort();const before=api.calls.length;
  await assert.rejects(()=>readFile(reader,'README.md'),{code:'request_cancelled'});await assert.rejects(()=>reader.runTool('repository_list_files',{directory:'',query:'',cursor:0,recursive:true}),{code:'request_cancelled'});assert.equal(api.calls.length,before);
  await assert.rejects(()=>repository.createRepositoryReader(env,'alice',{repository:api.name},{send:api.send,signal:controller.signal}),{code:'request_cancelled'});assert.equal(api.calls.length,before);
});

test('repository readers enforce total request, downloaded-byte and exposed-context budgets',async t=>{
  const {env,api}=await fixture(t),files=Object.fromEntries(Array.from({length:50},(_,index)=>['src/'+String(index).padStart(2,'0')+'.js',sourceFile('fixture '+index)]));
  replaceRepositoryFiles(api,files);const reader=await repository.createRepositoryReader(env,'alice',{repository:api.name},{send:api.send});
  for(let index=0;index<45;index++)await readFile(reader,'src/'+String(index).padStart(2,'0')+'.js');
  const before=api.calls.length;await assert.rejects(()=>readFile(reader,'src/45.js'),{code:'repository_context_budget'});assert.equal(api.calls.length,before);
  replaceRepositoryFiles(api,Object.fromEntries(Array.from({length:5},(_,index)=>['src/large'+index+'.js',sourceFile('x'.repeat(512*1024))])));
  const large=await repository.createRepositoryReader(env,'alice',{repository:api.name},{send:api.send});
  let returnedBytes=Buffer.byteLength(large.overview);
  for(let index=0;index<4;index++)returnedBytes+=Buffer.byteLength(JSON.stringify(await readFile(large,'src/large'+index+'.js',{line_count:1})));
  const beforeLarge=api.calls.length;await assert.rejects(()=>readFile(large,'src/large4.js'),{code:'repository_context_budget'});assert.equal(api.calls.length,beforeLarge);
  let hitLimit=false;
  for(let index=0;index<12;index++){
    try{const part=await readFile(large,'src/large0.js',{line_count:1});returnedBytes+=Buffer.byteLength(JSON.stringify(part));}
    catch(error){assert.equal(error.code,'repository_context_budget');hitLimit=true;break;}
  }
  assert.equal(hitLimit,true);assert.ok(returnedBytes<128*1024);assert.equal(api.calls.length,beforeLarge,'output limits apply to cached reads as well');
});

test('pull request context refuses a head that moves while the diff is loading',async t=>{
  const {env,api}=await fixture(t);api.changedPull=true;
  await assert.rejects(()=>repository.repositoryContext(env,'alice',{repository:api.name,kind:'pull',number:42},{send:api.send}),{code:'pull_revision_changed'});
  await assert.rejects(()=>repository.loadRepositorySelections(env,'alice',api.name,[{repository:'other/project',kind:'file',path:'README.md'}],{send:api.send}),{code:'context_repository_mismatch'});
});

test('signed log downloads omit credentials, reject hostile redirects and sanitize transport failures',async t=>{
  const {env,api}=await fixture(t);
  const context=await repository.repositoryContext(env,'alice',{repository:api.name,kind:'job',id:41},{send:api.send});assert.ok(context.text.includes('A fixture failure'));
  const download=api.calls.find(c=>!c.url.startsWith('https://api.github.com'));assert.ok(download);assert.equal(download.headers.has('authorization'),false);assert.equal(download.headers.has('cookie'),false);
  api.logLocation='https://evil.example/logs';const before=api.calls.length;await assert.rejects(()=>repository.repositoryContext(env,'alice',{repository:api.name,kind:'job',id:41},{send:api.send}),{code:'github_log_redirect'});assert.equal(api.calls.slice(before).some(c=>c.url.startsWith('https://evil.example')),false);
  api.logLocation='https://fixture.blob.core.windows.net/logs/file';api.downloadError=true;
  await assert.rejects(()=>repository.repositoryContext(env,'alice',{repository:api.name,kind:'job',id:41},{send:api.send}),e=>e.code==='github_logs_unavailable'&&!e.message.includes('SAS'));
});

test('patch output stays within selected regular files and cannot be saved into a foreign conversation',async t=>{
  const {env,api}=await fixture(t),inputs=await repository.patchInputs(env,'alice',{repository:api.name,paths:['src/app.js']},{send:api.send});
  const output={title:'Change',summary:'Fixture',testPlan:'Tests',files:[{path:'src/app.js',content:'updated\n'}]};
  for(const files of [[{path:'README.md',content:'unselected'}],[null],[{path:'src/app.js',content:'x'},{path:'src/app.js',content:'y'}]])assert.throws(()=>repository.validatePatchOutput({...output,files},inputs));
  assert.throws(()=>repository.validatePatchOutput({...output,files:[{path:'src/app.js',content:inputs.files[0].text}]},inputs),{code:'patch_no_changes'});
  await assert.rejects(()=>repository.patchInputs(env,'alice',{repository:api.name,paths:['.github/workflows/deploy.yml']},{send:api.send}),{code:'patch_workflow_restricted'});
  const bob=await store.createConversation(env,'bob',{mode:'developer',repository:api.name}),patch=repository.validatePatchOutput(output,inputs);
  await assert.rejects(()=>repository.savePatch(env,'alice',bob.id,patch),{code:'patch_conversation_invalid'});
});

test('publishing creates only a new branch and a draft PR, preserves unselected files and is idempotent',async t=>{
  const {env,api}=await fixture(t),patch=await draft(env,api),before=api.calls.length;
  assert.equal(await repository.getPatch(env,'bob',patch.id),null);await assert.rejects(()=>repository.publishPatch(env,'bob',patch.id,{send:api.send}),{code:'patch_not_found'});
  const result=await repository.publishPatch(env,'alice',patch.id,{send:api.send});assert.equal(result.url,'https://github.com/'+api.name+'/pull/1');assert.equal(api.pulls.length,1);assert.equal(api.pulls[0].draft,true);
  assert.equal(api.branches.get('main'),api.baseSha);const branchSha=api.branches.get('atlas/'+patch.id),files=api.trees.get(api.commits.get(branchSha).tree.sha);assert.equal(files['src/app.js'].text,'export const value = 2;\n');assert.equal(files['README.md'].text,'# Original\n');
  const writes=api.calls.slice(before).filter(c=>c.method!=='GET');assert.deepEqual(writes.map(c=>new URL(c.url).pathname.split('/').slice(-2).join('/')),['git/trees','git/commits','git/refs','project/pulls']);assert.equal(writes.at(-1).body.draft,true);
  const calls=api.calls.length;assert.deepEqual(await repository.publishPatch(env,'alice',patch.id,{send:api.send}),result);assert.equal(api.calls.length,calls);assert.equal((await repository.getPatch(env,'alice',patch.id)).status,'published');
});

test('publication rejects a changed base before making any GitHub writes',async t=>{
  const {env,api}=await fixture(t),patch=await draft(env,api),newSha=hash('new default branch');api.commits.set(newSha,{sha:newSha,tree:{sha:api.baseTree},parents:[{sha:api.baseSha}],message:'Another change'});api.branches.set('main',newSha);const before=api.calls.length;
  await assert.rejects(()=>repository.publishPatch(env,'alice',patch.id,{send:api.send}),{code:'patch_base_changed'});assert.equal(api.calls.slice(before).some(c=>c.method!=='GET'),false);assert.equal(api.pulls.length,0);
});

test('an ambiguous PR response retries without another commit, branch or pull request',async t=>{
  const {env,api}=await fixture(t),patch=await draft(env,api);api.failAfterPull=true;
  await assert.rejects(()=>repository.publishPatch(env,'alice',patch.id,{send:api.send}),{code:'github_unavailable'});assert.equal(api.pulls.length,1);assert.equal((await repository.getPatch(env,'alice',patch.id)).status,'failed');
  const before=api.calls.length,result=await repository.publishPatch(env,'alice',patch.id,{send:api.send});assert.equal(result.number,1);assert.equal(api.pulls.length,1);
  const writes=api.calls.slice(before).filter(c=>c.method!=='GET');assert.equal(writes.length,1);assert.ok(writes[0].url.endsWith('/git/trees'),'retry only recreates an immutable expected tree for full scope verification');
});

test('a retry rejects unselected file changes even when all approved files still match',async t=>{
  const {env,api}=await fixture(t),patch=await draft(env,api);api.failAfterPull=true;
  await assert.rejects(()=>repository.publishPatch(env,'alice',patch.id,{send:api.send}),{code:'github_unavailable'});
  const branch='atlas/'+patch.id,original=api.commits.get(api.branches.get(branch)),files=clone(api.trees.get(original.tree.sha));files['README.md'].text='Unapproved content\n';const changed=hash('foreign commit on draft branch');api.commits.set(changed,{...original,sha:changed,tree:{sha:api.treeFor(files)}});api.branches.set(branch,changed);
  await assert.rejects(()=>repository.publishPatch(env,'alice',patch.id,{send:api.send}),{code:'patch_branch_conflict'});assert.equal(api.pulls.length,1);assert.equal((await repository.getPatch(env,'alice',patch.id)).status,'failed');
});

test('a retry cannot silently accept a PR that is no longer a draft',async t=>{
  const {env,api}=await fixture(t),patch=await draft(env,api);api.failAfterPull=true;
  await assert.rejects(()=>repository.publishPatch(env,'alice',patch.id,{send:api.send}),{code:'github_unavailable'});api.pulls[0].draft=false;
  await assert.rejects(()=>repository.publishPatch(env,'alice',patch.id,{send:api.send}),{code:'patch_pr_conflict'});assert.equal(api.pulls.length,1);
});

test('concurrent publication requests claim a patch once',async t=>{
  const {env,api}=await fixture(t),patch=await draft(env,api);
  const results=await Promise.allSettled([repository.publishPatch(env,'alice',patch.id,{send:api.send}),repository.publishPatch(env,'alice',patch.id,{send:api.send})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='patch_publish_pending').length,1);assert.equal(api.pulls.length,1);
});
