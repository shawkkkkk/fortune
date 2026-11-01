import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeEventTopics,encodeAbiParameters,encodeFunctionData,keccak256,parseAbiParameters } from 'viem';
import { inspectVaultPermanentBurn,inspectPermanentBurn,PERMANENT_BURN_ABI as abi,VAULT_BURN_ABI as vaultAbi } from '../../lib/omnichain-burn-receipt.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0'),code='0x60006000f3',vaultCode='0x60016000f3';
const policy=()=>({chainId:97,token:a(1),runtimeHash:keccak256(code),manifestHash:h(4),vault:a(2),vaultRuntimeHash:keccak256(vaultCode),caller:a(3),amount:'123',transactionHash:h(5)});
const timestamp=BigInt(Math.floor(Date.now()/1000))-1n;
function fixture(change=()=>{}) {
 const p=policy(),base={transactionHash:p.transactionHash,blockHash:h(10),blockNumber:10n,transactionIndex:0,removed:false};
 const log=(eventName,args,index)=>({...base,address:p.token,topics:encodeEventTopics({abi,eventName,args}),data:encodeAbiParameters(parseAbiParameters('uint256'),[123n]),logIndex:index});
 const r={...base,status:'success',to:p.vault,from:p.caller,logs:[log('Transfer',{from:p.vault,to:a(0)},2),log('PermanentBurn',{holder:p.vault},3),{...base,address:p.vault,topics:encodeEventTopics({abi:vaultAbi,eventName:'InventoryBurned',args:{sequence:1n,caller:p.caller}}),data:encodeAbiParameters(parseAbiParameters('uint256,uint256'),[123n,123n]),logIndex:4}]};
 const tx={hash:p.transactionHash,blockNumber:10n,blockHash:h(10),transactionIndex:0,to:p.vault,from:p.caller,chainId:97,value:0n,input:encodeFunctionData({abi:vaultAbi,functionName:'burn',args:[123n]})};
 const b={number:10n,hash:h(10),timestamp,transactions:[p.transactionHash]};
 const state={token:p.token,runtimeHash:p.runtimeHash,manifestHash:p.manifestHash,maxPerBurn:200n,paused:false,totalBurned:999n,burnCount:5n};change({r,tx,b,state});
 return {async getChainId(){return 97;},async getBlockNumber(){return 30n;},async getTransactionReceipt(){return structuredClone(r);},async getTransaction(){return structuredClone(tx);},async getBlock(){return structuredClone(b);},async getCode({address}){return address.toLowerCase()===p.vault?vaultCode:code;},async readContract({address,functionName,blockNumber}){assert.equal(blockNumber,10n);if(address.toLowerCase()===p.vault)return state[functionName];return functionName==='bridgeEnabled'?false:functionName==='deploymentChainId'?97n:functionName==='launchManifestHash'?p.manifestHash:1000n;}};
}
const clients=fn=>[fixture(fn),fixture(fn)];
test('actual nested event ABI binds caller, vault/token runtimes, amount and stable token-log evidence identity',async()=>{
 const p=policy(),r=await inspectVaultPermanentBurn(clients(),p),again=await inspectVaultPermanentBurn(clients(),p);
 assert.equal(r.holder,p.vault);assert.equal(r.amount,'123');assert.equal(r.vaultObservation.caller,p.caller);assert.equal(r.vaultObservation.sequence,'1');assert.equal(r.vaultObservation.vaultCumulativeAtEvent,'123');assert.equal(r.vaultObservation.vaultTotalBurnedAtBlock,'999');assert.equal(r.vaultObservation.vaultBurnCountAtBlock,'5');assert.equal(r.cumulativePermanentBurnAtBlock,'1000');assert.equal(r.evidenceId,again.evidenceId);assert.equal(r.permanentBurnObserved,true);
 for(const k of ['transportBurn','buybackVerified','feeFundingVerified','independentProvidersVerified','finalityVerified','globalSupplyReconciled','executionAuthorized'])assert.equal(r[k],false,k);
 await assert.rejects(inspectPermanentBurn(clients(),{...p,holder:p.vault}));
});
test('outer calldata/recipient/caller and nested receipt/log identities reject mismatches without accepting a transport burn',async()=>{
 for(const change of [({r})=>r.logs.pop(),({r})=>r.logs.push(r.logs[2]),({r})=>r.to=a(9),({r})=>r.from=a(9),({tx})=>tx.input=encodeFunctionData({abi,functionName:'burn',args:[123n]}),({tx})=>tx.value=1n,
 ({r})=>r.logs[2].address=a(9),({r})=>r.logs[2].removed=true,({r})=>r.logs[2].transactionHash=h(9),({r})=>r.logs[2].logIndex=5,({r})=>r.logs[2].logIndex=NaN,({r})=>r.logs[2].data='0x',({r})=>r.logs[2].topics[2]='0x01'+r.logs[2].topics[2].slice(4),({r})=>r.logs.reverse(),({r})=>r.logs[2].data=encodeAbiParameters(parseAbiParameters('uint256,uint256'),[124n,124n]),({r})=>r.logs[2].data=encodeAbiParameters(parseAbiParameters('uint256,uint256'),[123n,1000n])])await assert.rejects(inspectVaultPermanentBurn(clients(change),policy()));
});
test('vault policy, runtime, immutable token pins, cap and block-end counters fail closed',async()=>{
 for(const p of [{...policy(),chainId:84532},{...policy(),vault:a(0)},{...policy(),vault:policy().token},{...policy(),caller:policy().vault},{...policy(),amount:(1n<<128n).toString()}])await assert.rejects(inspectVaultPermanentBurn([{},{}],p));
 const c=clients();c[0].getCode=async()=>code;await assert.rejects(inspectVaultPermanentBurn(c,policy()),/runtime/);
 for(const [key,value] of [['token',a(9)],['runtimeHash',h(9)],['manifestHash',h(9)],['paused',true],['maxPerBurn',122n],['maxPerBurn',1n<<128n],['totalBurned',122n],['burnCount',0n]])await assert.rejects(inspectVaultPermanentBurn(clients(({state})=>state[key]=value),policy()));
 const d=clients();const read=d[0].readContract;d[0].readContract=async args=>args.functionName==='bridgeEnabled'?true:read(args);await assert.rejects(inspectVaultPermanentBurn(d,policy()));
});
test('provider disagreement, changed reread and invalid host clocks never return vault evidence',async()=>{
 await assert.rejects(inspectVaultPermanentBurn([fixture(),fixture(({state})=>state.totalBurned=998n)],policy()),/disagree/);
 const c=clients();let n=0,read=c[0].getTransactionReceipt;c[0].getTransactionReceipt=async()=>{const r=await read();if(++n>1)r.logs[2].logIndex=5;return r;};await assert.rejects(inspectVaultPermanentBurn(c,policy()),/changed/);
 const original=Date.now;try{for(const now of [NaN,Infinity,-1,Number.MAX_SAFE_INTEGER+1]){Date.now=()=>now;let calls=0;const c=[{getBlockNumber:async()=>{calls++;return 30n;}},{}];await assert.rejects(inspectVaultPermanentBurn(c,policy()));assert.equal(calls,0);}}finally{Date.now=original;}
});
test('vault observer shares failure fences with direct mode and does not start late follow-on reads',async()=>{
 let release,reads=0;const c=clients();c[0].getBlockNumber=async()=>{throw Error('Peer stopped');};c[1].getBlockNumber=()=>new Promise(r=>release=r);c[1].getChainId=async()=>{reads++;return 97;};await assert.rejects(inspectVaultPermanentBurn(c,policy()),/Peer stopped/);release(30n);await new Promise(r=>setImmediate(r));assert.equal(reads,0);
});

import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {ProjectResearchNotebook as Book} from '../../scripts/project-research-notebook.mjs';
import {captureVaultBurn} from '../../scripts/capture-vault-burn.mjs';
function notebook(){const dir=mkdtempSync(join(tmpdir(),'fortune-burn-history-')),path=join(dir,'notes.sqlite'),token=policy().token;Book.initialize(path,token);const b=new Book(path,token);const expectedHead=b.read().head;b.close();return {path,token,expectedHead,policy:policy(),clean:()=>rmSync(dir,{recursive:true,force:true})};}
const capture=(request,c=clients(),options={enabled:true})=>captureVaultBurn(request,c,options);
test('burn capture is disabled by default; malformed policy and missing/foreign/stale notebooks reject before RPC',async()=>{
 const s=notebook();let calls=0;const c=[{async getBlockNumber(){calls++;return 30n;}},{}];try{
  await assert.rejects(captureVaultBurn(s,c));
  for(const request of [{...s,token:a(9)},{...s,expectedHead:'0'.repeat(64)},{...s,path:join(s.path,'absent')},
   {...s,policy:{...s.policy,amount:'01'}},{...s,policy:{...s.policy,chainId:84532}},{...s,policy:{...s.policy,token:a(9)}},{...s,policy:{...s.policy,extra:true}}])await assert.rejects(capture(request,c));
  const missing=join(s.path+'-missing');await assert.rejects(capture({...s,path:missing},c));assert.equal(existsSync(missing),false);assert.equal(calls,0);
 }finally{s.clean();}
});
test('actual vault reader persists one observation; reopen and old-history retry preserve time with zero RPC',async()=>{
 const s=notebook();try{const first=await capture(s),b=new Book(s.path,s.token);assert.equal(first.replayed,false);assert.equal(first.rpcReadPerformed,true);
  const original=b.read().notes[0],body=JSON.parse(original.body);assert.equal(body.observation.amount,'123');assert.equal(body.observation.vaultObservation.sequence,'1');assert.equal(body.observation.feeFundingVerified,false);
  for(let i=0;i<12;i++)b.append({id:'later-note-'+String(i).padStart(8,'0'),expectedHead:b.read().head,document:{kind:'observation',title:'Later',body:'Untrusted note',sources:[],corrects:0}});
  assert.equal(b.read().notes.some(x=>x.id===original.id),false);assert.deepEqual(b.readEntry(original.id),original);b.close();
  const retry=await capture(s,[]);assert.deepEqual(retry,{...first,replayed:true,rpcReadPerformed:false});assert.equal(retry.currentAuthorization,null);assert.equal(retry.sourceAuthenticated,false);assert.equal(retry.executionAuthorized,false);
  const reopened=new Book(s.path,s.token,{readOnly:true});assert.equal(reopened.read().total,13);assert.deepEqual(reopened.readEntry(original.id),original);assert.equal(JSON.parse(reopened.readEntry(original.id).body).observation.observedAtMs,body.observation.observedAtMs);reopened.close();
  await assert.rejects(capture({...s,policy:{...s.policy,amount:'124'}},[]),/conflict/);await assert.rejects(capture({...s,expectedHead:first.digest},[]),/conflict/);
 }finally{s.clean();}
});
test('provider failure and concurrent writer preserve history without partial capture or automatic head refresh',async()=>{
 const s=notebook();try{await assert.rejects(capture(s,clients(({state})=>state.paused=true)));let b=new Book(s.path,s.token);assert.equal(b.read().total,0);b.close();
  const c=clients(),head=c[0].getBlockNumber;let wrote=false;c[0].getBlockNumber=async()=>{if(!wrote){wrote=true;b=new Book(s.path,s.token);b.append({id:'concurrent-note-0001',expectedHead:s.expectedHead,document:{kind:'observation',title:'Concurrent',body:'Preserve me',sources:[],corrects:0}});b.close();}return head();};
  await assert.rejects(capture(s,c),/Head/);b=new Book(s.path,s.token,{readOnly:true});assert.equal(b.read().total,1);assert.equal(b.read().notes[0].body,'Preserve me');b.close();
 }finally{s.clean();}
});
test('actual existing stdio MCP exposes captured research as untrusted history only',async()=>{
 const s=notebook();try{await capture(s);const messages=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'burn-history-test',version:'1'}}},{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_research_notebook'}},{jsonrpc:'2.0',id:3,method:'resources/read',params:{uri:`fortune://97/${s.token}/research-notebook`}}].map(JSON.stringify).join('\n')+'\n';
 const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/project-mcp.mjs'],{encoding:'utf8',input:messages,env:{...process.env,FORTUNE_PROJECT_MCP_ENABLED:'true',FORTUNE_PROJECT_TOKEN:s.token,FORTUNE_PROJECT_NOTEBOOK_ENABLED:'true',FORTUNE_PROJECT_NOTEBOOK_DB:s.path}});assert.equal(r.status,0,r.stderr);const rows=r.stdout.trim().split('\n').map(JSON.parse),tool=JSON.parse(rows[1].result.content[0].text),resource=JSON.parse(rows[2].result.contents[0].text);assert.deepEqual(tool,resource);assert.equal(tool.total,1);assert.equal(tool.executionAuthorized,false);assert.equal(tool.source,'local-unverified-operator-research');const body=JSON.parse(tool.notes[0].body);assert.equal(body.observation.permanentBurnObserved,true);assert.equal(body.observation.finalityVerified,false);assert.doesNotMatch(r.stdout,/notes.sqlite/);
 }finally{s.clean();}
});
