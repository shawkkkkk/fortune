import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';import {once} from 'node:events';import {encodeAbiParameters,parseAbiParameters} from 'viem';
import {CreatorCanonRegistry} from '../../scripts/creator-canon-registry.mjs';import {characterRecordReader} from '../../scripts/character-record-reader.mjs';import {characterProvenanceReader} from '../../scripts/character-provenance-reader.mjs';import {createProjectMcp} from '../../scripts/project-mcp-server.mjs';import {emptyCharacter} from '../../lib/creator-character.ts';
import {policy,now,code,signature,creatorFor,client,a,h} from '../fixtures/creator-canon.mjs';
const req=(id,method,params)=>({jsonrpc:'2.0',id,method,params}),init=req(1,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'provenance-fixture',version:'1'}}),initialized={jsonrpc:'2.0',method:'notifications/initialized'};
async function ready(config={}){const handle=createProjectMcp({token:policy.token,...config});await handle(init);await handle(initialized);return handle;}
async function setup(){const dir=mkdtempSync(join(tmpdir(),'fortune-provenance-mcp-')),path=join(dir,'history.sqlite'),policyPath=join(dir,'policy.json');writeFileSync(policyPath,JSON.stringify(policy));CreatorCanonRegistry.initialize(path,policy,now);const book=new CreatorCanonRegistry(path,policy,{now:()=>now});let creator;try{const prepared=book.prepare({...emptyCharacter,name:'Private fixture text'});creator=await creatorFor(prepared);await book.accept({update:prepared.update,signature},[client(creator),client(creator)]);}finally{book.close();}return {dir,path,policyPath,token:policy.token,creator,cleanup(){rmSync(dir,{recursive:true,force:true});}};}
test('separate provenance opt-in preserves defaults, authority boundaries and the shared four-read quota',async()=>{
 const base=await ready();assert.equal((await base(req(2,'tools/list'))).result.tools.length,2);assert.ok((await base(req(3,'tools/call',{name:'get_character_provenance'}))).error);
 assert.throws(()=>createProjectMcp({token:policy.token,readProvenance:async()=>({})}));
 const s=await setup();try{const before=readFileSync(s.path),readCharacter=characterRecordReader({...s,now:()=>now}),readProvenance=characterProvenanceReader(s,[client(s.creator),client(s.creator)],{now:()=>now});
 const handle=await ready({readCharacter,readProvenance,readCanon:async()=>({character:{voice:null}})});
 assert.deepEqual((await handle(req(2,'tools/list'))).result.tools.map(t=>t.name),['get_project_canon','get_project_snapshot','get_character_record','get_character_provenance']);
 const uri=`fortune://97/${policy.token}/character-provenance`;assert.ok((await handle(req(3,'resources/list'))).result.resources.some(r=>r.uri===uri));
 assert.ok((await handle(req(4,'tools/call',{name:'get_character_provenance',arguments:{path:s.path}}))).error);
 assert.ok((await handle(req(5,'resources/read',{uri:`fortune://97/${a(99)}/character-provenance`}))).error);
 const one=JSON.parse((await handle(req(6,'tools/call',{name:'get_character_provenance'}))).result.content[0].text),two=JSON.parse((await handle(req(7,'resources/read',{uri}))).result.contents[0].text);
 assert.deepEqual(one,two);assert.equal(one.currentAuthorization,null);assert.equal(one.executionAuthorized,false);assert.equal(one.factoryCreatorMatched,true);assert.doesNotMatch(JSON.stringify(one),/Private fixture|signature":|sqlite|policy.json/);
 await handle(req(8,'tools/call',{name:'get_character_record'}));await handle(req(9,'tools/call',{name:'get_project_canon'}));assert.equal((await handle(req(10,'tools/call',{name:'get_character_provenance'}))).result.isError,true);assert.deepEqual(readFileSync(s.path),before);
 }finally{s.cleanup();}
});
test('startup-pinned policy, fixed project and missing storage reject before RPC; failed rechecks never become historical authority',async()=>{
 const s=await setup();try{let calls=0;const counter={async getBlockNumber(){calls++;throw Error('PRIVATE_PROVIDER/path');}};
 assert.throws(()=>characterProvenanceReader({...s,path:join(s.dir,'missing')},[counter,{...counter}],{now:()=>now}));assert.equal(existsSync(join(s.dir,'missing')),false);
 const read=characterProvenanceReader(s,[counter,{...counter}],{now:()=>now});await assert.rejects(read(a(99)));writeFileSync(s.policyPath,JSON.stringify({...policy,launchIndex:8}));await assert.rejects(read(policy.token));assert.equal(calls,0);
 writeFileSync(s.policyPath,JSON.stringify(policy));const handle=await ready({readCharacter:characterRecordReader({...s,now:()=>now}),readProvenance:read});const failed=await handle(req(2,'tools/call',{name:'get_character_provenance'}));assert.equal(failed.result.isError,true);assert.doesNotMatch(JSON.stringify(failed),/PRIVATE_PROVIDER|history.sqlite/);
 const history=JSON.parse((await handle(req(3,'tools/call',{name:'get_character_record'}))).result.content[0].text);assert.equal(history.currentAuthorization,null);assert.equal(history.executionAuthorized,false);assert.equal(history.record.revision,1);
 }finally{s.cleanup();}
});
test('actual stdio CLI connects the recheck through viem HTTP/ABI to real read-only SQLite',async()=>{
 const s=await setup();let server;try{let calls=0;const blockTime=BigInt(Math.floor(Date.now()/1000))-10n;server=createServer(async(req,res)=>{try{let raw='';for await(const chunk of req)raw+=chunk;const q=JSON.parse(raw);calls++;let result;
 if(q.method==='eth_chainId')result='0x61';else if(q.method==='eth_blockNumber')result='0xa0';
 else if(q.method==='eth_getBlockByNumber'){assert.ok(['0x6e','0x8c'].includes(q.params[0]));result={number:q.params[0],hash:q.params[0]==='0x6e'?h(110):h(140),timestamp:'0x'+blockTime.toString(16),transactions:[]};}
 else if(q.method==='eth_getCode'){assert.equal(q.params[1],'0x8c');result=q.params[0].toLowerCase()===policy.factory?code:'0x';}
 else if(q.method==='eth_call'){assert.equal(q.params[1],'0x8c');result=encodeAbiParameters(parseAbiParameters('address,address,address,address,address,address,address,bytes32,bytes32,uint64'),[s.creator,policy.token,a(3),a(4),a(5),a(6),a(7),h(8),h(9),1n]);}
 else throw Error('Unexpected RPC');res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));}catch{res.statusCode=500;res.end('{}');}});server.listen(0,'127.0.0.1');await once(server,'listening');
 const before=readFileSync(s.path),uri=`fortune://97/${policy.token}/character-provenance`,env={...process.env,FORTUNE_PROJECT_MCP_ENABLED:'true',FORTUNE_PROJECT_TOKEN:policy.token,FORTUNE_PROJECT_CHARACTER_ENABLED:'true',FORTUNE_PROJECT_CHARACTER_DB:s.path,FORTUNE_PROJECT_CHARACTER_POLICY:s.policyPath,FORTUNE_PROJECT_CHARACTER_RECHECK_ENABLED:'true',FORTUNE_PROJECT_NOTEBOOK_ENABLED:'',FORTUNE_CANON_READ_RPC_URL:'https://reviewed-one.invalid/rpc',FORTUNE_CANON_SECONDARY_RPC_URL:'https://reviewed-two.invalid/rpc',FORTUNE_TEST_CHARACTER_RPC:`http://127.0.0.1:${server.address().port}`};
 const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/character-provenance-http.mjs','scripts/project-mcp.mjs'],{env});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
 child.stdin.end([init,initialized,req(2,'tools/list'),req(3,'tools/call',{name:'get_character_provenance'}),req(4,'resources/read',{uri})].map(JSON.stringify).join('\n')+'\n');
 const [status]=await once(child,'exit');assert.equal(status,0,err);const replies=out.trim().split('\n').map(JSON.parse);assert.equal(replies.length,4);assert.equal(replies[1].result.tools.length,4);const one=JSON.parse(replies[2].result.content[0].text),two=JSON.parse(replies[3].result.contents[0].text);assert.deepEqual(one.checkedBlock,two.checkedBlock);assert.equal(one.checkedBlock.number,'140');assert.equal(one.executionAuthorized,false);assert.equal(two.currentAuthorization,null);assert.ok(calls>20);assert.deepEqual(readFileSync(s.path),before);assert.doesNotMatch(out,/Private fixture|history.sqlite|reviewed-one|signature":/);
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}s.cleanup();}
});
test('actual CLI requires separate history sharing and reviewed distinct HTTPS origins without leaking paths or credentials',()=>{
 const base={...process.env,FORTUNE_PROJECT_MCP_ENABLED:'true',FORTUNE_PROJECT_TOKEN:policy.token,FORTUNE_PROJECT_CHARACTER_ENABLED:'',FORTUNE_PROJECT_NOTEBOOK_ENABLED:'',FORTUNE_PROJECT_CHARACTER_RECHECK_ENABLED:'true',FORTUNE_PROJECT_CHARACTER_DB:'/private/absent',FORTUNE_CANON_READ_RPC_URL:'https://private.invalid/key',FORTUNE_CANON_SECONDARY_RPC_URL:'https://private.invalid/other'};
 const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/project-mcp.mjs'],{env:base,input:'',encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stdout,'');assert.doesNotMatch(r.stderr,/\/private\/|private.invalid|\/key/);
});

test('valid protected history does not permit HTTP, userinfo or identical RPC origins at startup',async()=>{
 const s=await setup();try{
  for(const urls of [['http://reviewed-one.invalid','https://reviewed-two.invalid'],['https://same.invalid/a','https://same.invalid/b'],['https://user:password@one.invalid','https://two.invalid']]){
   const env={...process.env,FORTUNE_PROJECT_MCP_ENABLED:'true',FORTUNE_PROJECT_TOKEN:policy.token,FORTUNE_PROJECT_CHARACTER_ENABLED:'true',FORTUNE_PROJECT_CHARACTER_DB:s.path,FORTUNE_PROJECT_CHARACTER_POLICY:s.policyPath,FORTUNE_PROJECT_NOTEBOOK_ENABLED:'',FORTUNE_PROJECT_CHARACTER_RECHECK_ENABLED:'true',FORTUNE_CANON_READ_RPC_URL:urls[0],FORTUNE_CANON_SECONDARY_RPC_URL:urls[1]};
   const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/project-mcp.mjs'],{env,input:'',encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stdout,'');assert.doesNotMatch(r.stderr,/password|history.sqlite|policy.json|same.invalid/);
  }
 }finally{s.cleanup();}
});
