import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { encodeEventTopics,encodeAbiParameters,encodeFunctionData,keccak256,parseAbiParameters } from 'viem';
import { inspectPermanentBurn,PERMANENT_BURN_ABI as abi } from '../../lib/omnichain-burn-receipt.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0'),code='0x60006000f3';
const policy=()=>({chainId:97,token:a(1),runtimeHash:keccak256(code),manifestHash:h(4),holder:a(2),amount:'123',transactionHash:h(3)});
const timestamp=BigInt(Math.floor(Date.now()/1000))-1n;
function fixture(change=()=>{}) {
  const p=policy(),base={address:p.token,transactionHash:p.transactionHash,blockHash:h(10),blockNumber:10n,transactionIndex:0,removed:false};
  const log=(eventName,args,logIndex)=>({...base,topics:encodeEventTopics({abi,eventName,args}),data:encodeAbiParameters(parseAbiParameters('uint256'),[123n]),logIndex});
  const r={transactionHash:p.transactionHash,status:'success',blockNumber:10n,blockHash:h(10),transactionIndex:0,to:p.token,from:p.holder,
    logs:[log('Transfer',{from:p.holder,to:a(0)},2),log('PermanentBurn',{holder:p.holder},3)]};
  const tx={hash:p.transactionHash,blockNumber:10n,blockHash:h(10),transactionIndex:0,to:p.token,from:p.holder,chainId:97,value:0n,input:encodeFunctionData({abi,functionName:'burn',args:[123n]})};
  const b={number:10n,hash:h(10),timestamp,transactions:[p.transactionHash]};
  change({r,tx,b});
  return {async getChainId(){return 97;},async getBlockNumber(){return 30n;},async getTransactionReceipt(){return structuredClone(r);},async getTransaction(){return structuredClone(tx);},
    async getBlock(){return structuredClone(b);},async getCode(){return code;},async readContract({functionName,blockNumber}){assert.equal(blockNumber,10n);return functionName==='deploymentChainId'?97n:functionName==='launchManifestHash'?p.manifestHash:123n;}};
}
const clients=fn=>[fixture(fn),fixture(fn)];
test('direct permanent burn requires exact transaction and both events, with stable dedup identity and no economic claims',async()=>{
  const p=policy(),r=await inspectPermanentBurn(clients(),p),again=await inspectPermanentBurn(clients(),p);
  assert.equal(r.amount,'123');assert.equal(r.burnLogIndex,3);assert.equal(r.evidenceId,again.evidenceId);assert.equal(r.permanentBurnObserved,true);
  for(const flag of ['transportBurn','buybackVerified','feeFundingVerified','independentProvidersVerified','globalSupplyReconciled','executionAuthorized'])assert.equal(r[flag],false);
});
test('transport-only burns, duplicate/removed/foreign/malformed events and changed transaction bindings reject',async()=>{
  for(const change of [({r})=>r.logs.pop(),({r})=>r.logs[1]=r.logs[0],({r})=>r.logs[0].removed=true,({r})=>r.logs[1].address=a(9),
    ({r})=>r.logs[1].logIndex=4,({r})=>r.logs[1].transactionHash=h(8),({r})=>r.logs[1].data='0x',({r})=>r.status='reverted',
    ({r})=>r.logs[1].topics[1]='0x01'+r.logs[1].topics[1].slice(4),
    ({tx})=>tx.input='0x',({tx})=>tx.value=1n,({tx})=>tx.from=a(9),({tx})=>tx.chainId=56,({b})=>b.transactions=[h(9)],({b})=>b.timestamp=timestamp+10000n]) {
    await assert.rejects(inspectPermanentBurn(clients(change),policy()));
  }
});
test('policy and source provenance fail closed before accepting receipt observations',async()=>{
  for(const p of [{...policy(),chainId:56},{...policy(),amount:'0'},{...policy(),amount:(1n<<256n).toString()},{...policy(),token:a(0)}])await assert.rejects(inspectPermanentBurn([{},{}],p));
  const one=fixture();await assert.rejects(inspectPermanentBurn([one,one],policy()));
  for(const key of ['getCode','getChainId','getBlockNumber','readContract']) {
    const c=clients();c[0][key]=async()=>key==='getCode'?'0x':key==='getChainId'?56:key==='getBlockNumber'?29n:0n;
    await assert.rejects(inspectPermanentBurn(c,policy()));
  }
  const c=clients();let reads=0,read=c[0].getTransactionReceipt;c[0].getTransactionReceipt=async()=>{const r=await read();if(++reads>1)r.logs[1].logIndex=4;return r;};
  await assert.rejects(inspectPermanentBurn(c,policy()),/changed/);
});
test('failed peers fence delayed completions before any follow-on RPC',async()=>{
  let release,reads=0;const c=clients();c[0].getBlockNumber=async()=>{throw Error('Peer stopped');};c[1].getBlockNumber=()=>new Promise(r=>release=r);
  c[1].getChainId=async()=>{reads++;return 97;};await assert.rejects(inspectPermanentBurn(c,policy()),/Peer stopped/);release(30n);
  await new Promise(r=>setImmediate(r));assert.equal(reads,0);
});
test('burn observer has a genuine twenty-second wall deadline and fences late reads',{timeout:30000},async()=>{
  const releases=[];let reads=0;const c=[0,1].map(()=>({getBlockNumber:()=>new Promise(r=>releases.push(r)),async getChainId(){reads++;return 97;}}));
  const start=Date.now();await assert.rejects(inspectPermanentBurn(c,policy()),/timed out/);assert.ok(Date.now()-start>=19000);
  releases.forEach(r=>r(30n));await new Promise(r=>setImmediate(r));assert.equal(reads,0);
});
test('burn CLI defaults disabled and discloses no private path or provider value',()=>{
  const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/inspect-permanent-burn.mjs','/private/burn.json'],{encoding:'utf8',env:{...process.env,FORTUNE_PERMANENT_BURN_READ_ENABLED:'',FORTUNE_BURN_READ_RPC_URL:'https://credential.invalid/private'}});
  assert.equal(r.status,1);assert.equal(r.stdout,'');assert.doesNotMatch(r.stderr,/credential.invalid|burn.json|\/private/);
});
