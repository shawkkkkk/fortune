import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256,encodeFunctionData,parseAbi} from 'viem';
import {inspectLiquidityCustodyDepositReceipt as inspect} from '../../lib/liquidity-custody-deposit-receipt.ts';
import {LP_MANAGER,LP_FACTORY} from '../../lib/managed-liquidity-position.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0'),zero=a(0),code='0x6001600055';
const pin=address=>({address,codeHash:keccak256(code)});
const policy=()=>({chainId:97,manager:pin(LP_MANAGER),factory:pin(LP_FACTORY),pool:pin(a(9)),token0:pin(a(1)),token1:pin(a(2)),custody:pin(a(10)),governor:a(3),guardian:a(4),treasury:a(5),fee:500,positionId:'12',tickLower:-10,tickUpper:10,expectedLiquidity:'123'});
const rawPolicy=p=>({...Object.fromEntries(['manager','factory','pool','token0','token1'].map(k=>[k,{target:p[k].address,codeHash:p[k].codeHash}])),positionId:12n,fee:500,tickLower:-10,tickUpper:10,expectedLiquidity:123n});
function client(o={}){const p=policy();let blocks=0;const base={
  async getBlockNumber(){return 130n;},async getChainId(){return 97;},
  async getBlock({blockNumber}){assert.equal(blockNumber,110n);return {number:blockNumber,hash:h(110),timestamp:++blocks>= (o.changedHeaderAt??Infinity)?1001n:1000n,transactions:[h(50)]};},
  async getCode({address,blockNumber}){assert.equal(blockNumber,110n);return address.toLowerCase()===p.custody.address&&o.wrongCode?'0x01':code;},
  async readContract({address,functionName,blockNumber}){
    assert.equal(blockNumber,110n);
    if(address.toLowerCase()===p.custody.address){
      if(o.onCustody)return o.onCustody(functionName);
      if(['governor','guardian','treasury'].includes(functionName))return o[functionName]??p[functionName];
      if(functionName==='paused')return o.paused??false;
      if(functionName==='held')return o.held??true;
      if(functionName==='released')return o.released??false;
      if(functionName==='policy'){const v=rawPolicy(p);o.changePolicy?.(v);return v;}
    }
    if(functionName==='positions')return [0n,o.approved??zero,a(1),a(2),500,-10,10,o.liquidity??123n,1n,2n,3n,4n];
    if(functionName==='ownerOf')return o.owner??p.custody.address;
    if(functionName==='getApproved')return o.approved??zero;
    if(functionName==='factory')return LP_FACTORY;
    if(functionName==='getPool')return p.pool.address;
    if(functionName==='token0')return a(1);
    if(functionName==='token1')return a(2);
    if(functionName==='fee')return 500;
    if(functionName==='tickSpacing')return 10;
    throw Error('Unexpected read');
  }
};return Object.assign(base,{async getTransactionReceipt(){return receipt(o);},async getTransaction(){return {...transaction(),...o.tx};}});}

const input=()=>({policy:policy(),transactionHash:h(50)});
const topic=a=>'0x'+'0'.repeat(24)+a.slice(2).toLowerCase(),sig=s=>keccak256(new TextEncoder().encode(s));
function receipt(o={}){const p=policy();const r={transactionHash:h(50),status:'success',blockNumber:110n,blockHash:h(110),transactionIndex:0,from:p.governor,to:p.custody.address,logs:[
 {address:p.manager.address,topics:[sig('Approval(address,address,uint256)'),topic(p.governor),topic(zero),h(12)],data:'0x'},
 {address:p.manager.address,topics:[sig('Transfer(address,address,uint256)'),topic(p.governor),topic(p.custody.address),h(12)],data:'0x'},
 {address:p.custody.address,topics:[sig('PositionDeposited(uint256,address)'),h(12),topic(p.governor)],data:'0x'},
 ].map((l,i)=>({...l,blockNumber:110n,blockHash:h(110),transactionHash:h(50),transactionIndex:0,logIndex:i+4,removed:false}))};o.changeReceipt?.(r);return r;}
function transaction(){const p=policy();return {hash:h(50),blockNumber:110n,blockHash:h(110),transactionIndex:0,chainId:97,from:p.governor,to:p.custody.address,value:0n,input:encodeFunctionData({abi:parseAbi(['function deposit()']),functionName:'deposit'})};}
const cs=o=>[client(o),client(o)];
test('actual unchanged LP observation plus exact deposit receipt bind governor/custody/NFT/raw liquidity and stable historical replay',async()=>{
 const r=await inspect(cs(),input()),again=await inspect(cs(),input());assert.equal(r.evidenceId,`97:${a(10)}:${h(50)}:6`);assert.equal(again.evidenceId,r.evidenceId);assert.equal(again.receiptConsistencyDigest,r.receiptConsistencyDigest);assert.equal(r.position.owner,a(10));assert.equal(r.position.liquidityUnits,'123');assert.equal(r.blockNumber,'110');assert.equal(r.position.claimableFees,null);assert.equal(r.position.totalValue,null);assert.equal(r.held,true);assert.equal(r.released,false);assert.equal(r.currentAuthorization,null);for(const k of ['executionAuthorized','treasuryControlVerified','projectConsentVerified','capitalOriginVerified','preDepositStateVerified','independentProvidersVerified','finalityVerified','fullManagedLiquidityReadiness'])assert.equal(r[k],false);assert.ok(Object.isFrozen(r));assert.equal((await inspect(cs({paused:true}),input())).pausedAtBlock,true);await assert.rejects(inspect(cs({tx:{input:encodeFunctionData({abi:parseAbi(['function releaseToTreasury()']),functionName:'releaseToTreasury'})}}),input()));
});
test('offline input-policy/client/clock rejection precedes RPC and input is copied before awaits',async()=>{
 for(const v of [{...input(),extra:1},{...input(),transactionHash:h(0)},{...input(),policy:{...policy(),chainId:56}},{...input(),policy:{...policy(),extra:1}},{...input(),policy:{...policy(),expectedLiquidity:'0'}}]){let calls=0;const c={async getBlockNumber(){calls++;return 130n;}};await assert.rejects(inspect([c,{...c}],v));assert.equal(calls,0);}
 const one=client();await assert.rejects(inspect([one,one],input()));const real=Date.now;try{for(const n of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){Date.now=()=>n;let calls=0;const c={async getBlockNumber(){calls++;return 130n;}};await assert.rejects(inspect([c,{...c}],input()));assert.equal(calls,0);}}finally{Date.now=real;}
 const v=input(),pending=inspect(cs(),v);v.policy.governor=a(99);assert.equal((await pending).governor,a(3));
});
test('canonical Approval/Transfer/Depositd framing rejects wrong NFT/recipient/removed/reordered/extra/foreign/malformed logs',async()=>{
 for(const changeReceipt of [r=>r.logs[0].topics[2]=topic(a(99)),r=>r.logs[1].topics[3]=h(13),r=>r.logs[1].topics[2]=topic(a(3)),r=>r.logs[2].topics[2]=topic(a(5)),r=>r.logs[1].removed=true,r=>r.logs.reverse(),r=>r.logs.push(r.logs[2]),r=>r.logs.shift(),r=>r.logs[0].address=a(8),r=>r.logs[2].data=h(1),r=>r.logs[1].logIndex=8,r=>r.logs[0].transactionHash=h(99),r=>r.logs[0].topics.pop(),r=>r.status='reverted',r=>r.from=a(8),r=>r.to=a(8),r=>r.transactionIndex=-1])await assert.rejects(inspect(cs({changeReceipt}),input()));
});
test('direct governor zero-native exact call and complete transaction/header bindings reject foreign/smart-wallet/failed observations',async()=>{
 for(const tx of [{from:a(8)},{to:a(8)},{value:1n},{input:'0x'},{hash:h(8)},{blockHash:h(8)},{blockNumber:109n},{transactionIndex:1},{chainId:56}])await assert.rejects(inspect(cs({tx}),input()));
 for(const head of [129n,19n,1n<<64n]){const c=client();c.getBlockNumber=async()=>head;await assert.rejects(inspect([c,client()],input()));}
 const c=client();c.getBlockNumber=async()=>141n;await assert.rejects(inspect([c,client()],input()));
});
test('receipt-height recorded held state, all policy fields and actual old position checks fail closed',async()=>{
 for(const o of [{held:false},{released:true},{paused:1},{governor:a(8)},{guardian:a(8)},{treasury:a(8)},{wrongCode:true},{owner:a(3)},{approved:a(8)},{liquidity:124n},...['manager','factory','pool','token0','token1'].flatMap(k=>[{changePolicy:v=>v[k].target=a(8)},{changePolicy:v=>v[k].codeHash=h(8)}]),...['positionId','fee','tickLower','tickUpper','expectedLiquidity'].map(k=>({changePolicy:v=>v[k]=typeof v[k]==='bigint'?v[k]+1n:v[k]+1}))])await assert.rejects(inspect(cs(o),input()));
});
test('receipt rereads, final headers, provider agreement and monotonic rollback reject changed evidence',async()=>{
 const c=client();let reads=0;c.getTransactionReceipt=async()=>receipt(++reads===2?{changeReceipt:r=>r.logs[0].logIndex--}:{});await assert.rejects(inspect([c,client()],input()));
 await assert.rejects(inspect([client(),client({changedHeaderAt:4})],input()));await assert.rejects(inspect([client(),client({paused:true})],input()),/disagree/);
 const real=Date.now;let now=2000000;try{Date.now=()=>now;const c=client(),read=c.readContract;c.readContract=async q=>{const r=await read(q);if(q.functionName==='held')now--;return r;};await assert.rejects(inspect([c,client()],input()),/clock/);}finally{Date.now=real;}
});
test('peer failure and real thirty-second lifetime fence late RPC and preserve original receivers',{timeout:40000},async()=>{
 let release,calls=0;const left=client(),right=client();left.getChainId=async()=>{throw Error('Fixture peer failed');};right.getChainId=function(){assert.equal(this,right);return new Promise(r=>release=r);};right.getTransactionReceipt=async()=>{calls++;return receipt();};await assert.rejects(inspect([left,right],input()));release(97);await new Promise(r=>setImmediate(r));assert.equal(calls,0);
 const c=client();let finish,after=0;c.getBlockNumber=function(){assert.equal(this,c);return new Promise(r=>finish=r);};c.getChainId=async()=>{after++;return 97;};const started=Date.now();await assert.rejects(inspect([client(),c],input()),/timed out/);assert.ok(Date.now()-started>=29000);finish(130n);await new Promise(r=>setImmediate(r));assert.equal(after,0);
});

test('every canonical topic requires an own present value, including signature and indexed fields',async()=>{
 const valid=await inspect(cs(),input());assert.equal(valid.executionAuthorized,false);
 for(let log=0;log<3;log++)for(let slot=0;slot<receipt().logs[log].topics.length;slot++)for(const kind of ['hole','undefined','null','inherited']){
  const changeReceipt=r=>{const topics=r.logs[log].topics,value=topics[slot];
   if(kind==='undefined')topics[slot]=undefined;
   else if(kind==='null')topics[slot]=null;
   else {delete topics[slot];if(kind==='inherited'){const prototype=Object.create(Array.prototype);Object.defineProperty(prototype,slot,{value,configurable:true});Object.setPrototypeOf(topics,prototype);}}
  };
  await assert.rejects(inspect(cs({changeReceipt}),input()),/Canonical .* log binding differs/,`${kind} log${log} topic${slot}`);
  let reads=0;const left=client();left.getTransactionReceipt=async()=>receipt(++reads===2?{changeReceipt}:{});
  await assert.rejects(inspect([left,client()],input()),/Canonical .* log binding differs/,`reread ${kind} log${log} topic${slot}`);
 }
 assert.equal((await inspect(cs(),input())).evidenceId,valid.evidenceId);
});
