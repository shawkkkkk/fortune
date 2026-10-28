import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {CreatorCanonRegistry} from '../../scripts/creator-canon-registry.mjs';import {revalidateCharacterRecord} from '../../scripts/revalidate-character-record.mjs';import {emptyCharacter} from '../../lib/creator-character.ts';
import {policy,now,code,signature,creatorFor,client,a,h} from '../fixtures/creator-canon.mjs';
import {createServer} from 'node:http';import {once} from 'node:events';import {createPublicClient,http,parseAbi,encodeAbiParameters,parseAbiParameters} from 'viem';
const later=now+600000;
async function setup(filled=true){const dir=mkdtempSync(join(tmpdir(),'fortune-character-recheck-')),path=join(dir,'canon.sqlite'),policyPath=join(dir,'policy.json');writeFileSync(policyPath,JSON.stringify(policy));CreatorCanonRegistry.initialize(path,policy,now);let creator;
 if(filled){const book=new CreatorCanonRegistry(path,policy,{now:()=>now});try{const p=book.prepare({...emptyCharacter,name:'Private fixture character'});creator=await creatorFor(p);await book.accept({update:p.update,signature},[client(creator),client(creator)]);}finally{book.close();}}
 return {dir,path,policyPath,token:policy.token,creator,cleanup(){rmSync(dir,{recursive:true,force:true});}};}
function observed(s,o={}){let oldReads=0;return {async getBlockNumber(){await o.during?.();return o.head??160n;},async getChainId(){return o.chain??97;},
 async getBlock({blockNumber}){assert.ok(blockNumber===110n||blockNumber===140n);if(blockNumber===110n){oldReads++;return {number:blockNumber,hash:o.oldHash??(o.reorg&&oldReads>1?h(9):h(110)),timestamp:BigInt(now/1000)-10n};}return {number:blockNumber,hash:o.hash??h(140),timestamp:BigInt(later/1000)-(o.stale?500n:10n)+(o.timestampOffset??0n)};},
 async getCode({address,blockNumber}){assert.equal(blockNumber,140n);return address===policy.factory?(o.badCode?'0x6001':code):(Object.hasOwn(o,'creatorCode')?o.creatorCode:o.delegated?'0x6000':'0x');},
 async readContract({address,blockNumber,functionName,args}){assert.equal(address,policy.factory);assert.equal(blockNumber,140n);assert.equal(functionName,'launches');assert.deepEqual(args,[7n]);return [o.creator??s.creator,o.token??policy.token,a(3),a(4),a(5),a(6),a(7),h(8),h(9),1n];}};}
test('expired historical signature can be re-observed without renewal, text disclosure or database mutation',async()=>{const s=await setup();try{const before=readFileSync(s.path),r=await revalidateCharacterRecord(s,[observed(s),observed(s)],{now:()=>later});assert.equal(r.historicalBlock.number,'110');assert.equal(r.checkedBlock.number,'140');assert.equal(r.currentAuthorization,null);assert.equal(r.executionAuthorized,false);assert.equal(r.historicalBlockMatched,true);assert.doesNotMatch(JSON.stringify(r),/Private fixture|signature":|sqlite/);assert.deepEqual(readFileSync(s.path),before);}finally{s.cleanup();}});
test('absent/empty/foreign history fails before provider reads and never initializes files',async()=>{const s=await setup(false);try{let reads=0;const c={async getBlockNumber(){reads++;throw Error('network');}};for(const config of [s,{...s,path:join(s.dir,'missing')},{...s,token:a(99)}])await assert.rejects(revalidateCharacterRecord(config,[c,{...c}],{now:()=>later}));assert.equal(reads,0);assert.equal(existsSync(join(s.dir,'missing')),false);}finally{s.cleanup();}});
test('provider disagreement, historical rollback, stale/code/creator/token/delegation/chain/head failures reject',async()=>{const s=await setup();try{const before=readFileSync(s.path);for(const o of [{hash:h(9)},{oldHash:h(9)},{reorg:true},{stale:true},{badCode:true},{creator:a(99)},{token:a(99)},{delegated:true},{creatorCode:null},{creatorCode:''},{creatorCode:'malformed'},{chain:56},{head:180n}])await assert.rejects(revalidateCharacterRecord(s,[observed(s),observed(s,o)],{now:()=>later}));assert.deepEqual(readFileSync(s.path),before);}finally{s.cleanup();}});
test('clock rollback and genuinely hung read clients fail within the bounded observation', {timeout:30000},async()=>{const s=await setup();try{let t=later;await assert.rejects(revalidateCharacterRecord(s,[observed(s,{during:()=>{t=later-1;}}),observed(s)],{now:()=>t}));const release=[];let laterReads=0;const hanging={getBlockNumber:()=>new Promise(resolve=>release.push(resolve)),getChainId:async()=>{laterReads++;return 97;}};await assert.rejects(revalidateCharacterRecord(s,[hanging,{...hanging}],{now:()=>later}),/timed out/);release.forEach(resolve=>resolve(160n));await new Promise(resolve=>setImmediate(resolve));assert.equal(laterReads,0,'Completing an old request after timeout cannot start more RPC reads');}finally{s.cleanup();}});
test('a different process-compatible writer committing a new revision during reads is preserved and recheck rejects',async()=>{const s=await setup();try{let changed=false;const during=async()=>{if(changed)return;changed=true;const b=new CreatorCanonRegistry(s.path,policy,{now:()=>now+1});try{const p=b.prepare({...emptyCharacter,name:'Second profile'}),creator=await creatorFor(p);await b.accept({update:p.update,signature},[client(creator),client(creator)]);}finally{b.close();}};await assert.rejects(revalidateCharacterRecord(s,[observed(s,{during}),observed(s)],{now:()=>later}));const b=new CreatorCanonRegistry(s.path,policy,{readOnly:true,now:()=>later});try{assert.equal(b.latest().update.revision,2);}finally{b.close();}}finally{s.cleanup();}});
test('operator CLI defaults disabled and hides configuration/private paths',()=>{const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/revalidate-character-record-cli.mjs','/private/missing','/private/policy',policy.token],{env:{...process.env,FORTUNE_CHARACTER_RECHECK_ENABLED:''},encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stdout,'');assert.doesNotMatch(r.stderr,/\/private\/|missing/);assert.match(r.stderr,/No authorization/);});
test('providers with matching block hashes but different timestamps fail closed',async()=>{
 const s=await setup();try{
  const before=readFileSync(s.path);
  await assert.rejects(revalidateCharacterRecord(s,[observed(s),observed(s,{timestampOffset:1n})],{now:()=>later}),/Providers disagree/);
  assert.deepEqual(readFileSync(s.path),before);
 }finally{s.cleanup();}
});
test('an early provider failure fences late completion before it can start another RPC read',async()=>{
 const s=await setup();let release;try{
  const before=readFileSync(s.path);let laterReads=0;
  const failed={...observed(s),async getChainId(){throw Error('Fixture provider stopped');}};
  const delayed={...observed(s),getChainId:()=>new Promise(resolve=>{release=resolve;}),async getBlock(){laterReads++;throw Error('Late RPC read');}};
  await assert.rejects(revalidateCharacterRecord(s,[failed,delayed],{now:()=>later}),/Fixture provider stopped/);
  assert.equal(typeof release,'function');release(97);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(laterReads,0,'A returned failure must fence the other client too');
  assert.deepEqual(readFileSync(s.path),before);
 }finally{s.cleanup();}
});
test('actual viem HTTP and ABI reads recheck both historical and current heights against a real SQLite record',async()=>{const s=await setup();let server;try{const heights=new Set(),seen=[];
 server=createServer(async(req,res)=>{try{let raw='';for await(const b of req)raw+=b;const rpc=JSON.parse(raw);seen.push(rpc.method);let result;
  if(rpc.method==='eth_chainId')result='0x61';else if(rpc.method==='eth_blockNumber')result='0xa0';
  else if(rpc.method==='eth_getBlockByNumber'){const height=rpc.params[0];assert.ok(['0x6e','0x8c'].includes(height));heights.add(height);result={number:height,hash:height==='0x6e'?h(110):h(140),timestamp:'0x'+(BigInt(later/1000)-10n).toString(16),transactions:[]};}
  else if(rpc.method==='eth_getCode'){assert.equal(rpc.params[1],'0x8c');result=rpc.params[0].toLowerCase()===policy.factory?code:'0x';}
  else if(rpc.method==='eth_call'){assert.equal(rpc.params[1],'0x8c');assert.equal(rpc.params[0].to.toLowerCase(),policy.factory);result=encodeAbiParameters(parseAbiParameters('address,address,address,address,address,address,address,bytes32,bytes32,uint64'),[s.creator,policy.token,a(3),a(4),a(5),a(6),a(7),h(8),h(9),1n]);}
  else throw Error('Unexpected RPC');res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result}));
 }catch{res.statusCode=500;res.end('{}');}});server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}`;
 const clients=[0,1].map(()=>createPublicClient({transport:http(url,{timeout:2000,retryCount:0})})),before=readFileSync(s.path);
 const r=await revalidateCharacterRecord(s,clients,{now:()=>later});assert.equal(r.factoryCreatorMatched,true);assert.deepEqual([...heights].sort(),['0x6e','0x8c']);assert.equal(seen.filter(x=>x==='eth_call').length,2);assert.deepEqual(readFileSync(s.path),before);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));s.cleanup();}});
