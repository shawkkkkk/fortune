import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256} from 'viem';
import {inspectLiquidityCustody} from '../../lib/managed-liquidity-custody.ts';
import {LP_MANAGER,LP_FACTORY} from '../../lib/managed-liquidity-position.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0'),zero=a(0),code='0x6001600055';
const pin=address=>({address,codeHash:keccak256(code)});
const policy=()=>({chainId:97,manager:pin(LP_MANAGER),factory:pin(LP_FACTORY),pool:pin(a(9)),token0:pin(a(1)),token1:pin(a(2)),custody:pin(a(10)),governor:a(3),guardian:a(4),treasury:a(5),fee:500,positionId:'12',tickLower:-10,tickUpper:10,expectedLiquidity:'123'});
const rawPolicy=p=>({...Object.fromEntries(['manager','factory','pool','token0','token1'].map(k=>[k,{target:p[k].address,codeHash:p[k].codeHash}])),positionId:12n,fee:500,tickLower:-10,tickUpper:10,expectedLiquidity:123n});
function client(o={}){const p=policy();let blocks=0;return {
  async getBlockNumber(){return 130n;},async getChainId(){return 97;},
  async getBlock({blockNumber}){assert.equal(blockNumber,110n);return {number:blockNumber,hash:h(110),timestamp:++blocks>= (o.changedHeaderAt??Infinity)?1001n:1000n};},
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
};}
const cs=o=>[client(o),client(o)];
const custodyValue=k=>({governor:a(3),guardian:a(4),treasury:a(5),paused:false,held:true,released:false,policy:rawPolicy(policy())})[k];
test('actual LP reader and custody policy agree at the same historical height without granting authority',async()=>{
  for(const paused of [false,true]){const r=await inspectLiquidityCustody(cs({paused}),policy());assert.equal(r.paused,paused);assert.equal(r.held,true);assert.equal(r.released,false);assert.equal(r.position.owner,a(10));assert.equal(r.position.blockNumber,'110');assert.equal(r.position.blockTimestamp,'1000');assert.equal(r.position.liquidityUnits,'123');assert.equal(r.position.claimableFees,null);assert.equal(r.position.totalValue,null);assert.equal(r.currentAuthorization,null);for(const k of ['projectConsentVerified','capitalOriginVerified','independentProvidersVerified','finalityVerified','executionAuthorized','fullManagedLiquidityReadiness'])assert.equal(r[k],false);assert.ok(Object.isFrozen(r));}
});
test('exact offline policy, distinct clients and invalid clocks fail before RPC; supplied policy is cloned',async()=>{
  for(const p of [{...policy(),extra:1},{...policy(),chainId:56},{...policy(),guardian:a(3)},{...policy(),treasury:a(1)},{...policy(),custody:pin(a(9))},{...policy(),expectedLiquidity:'0'},{...policy(),expectedLiquidity:(1n<<128n).toString()},{...policy(),tickUpper:-10},{...policy(),custody:{...pin(a(10)),extra:1}}]){let reads=0;const c={async getBlockNumber(){reads++;return 130n;}};await assert.rejects(inspectLiquidityCustody([c,{...c}],p));assert.equal(reads,0);}
  const one=client();await assert.rejects(inspectLiquidityCustody([one,one],policy()));
  const real=Date.now;try{for(const n of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){Date.now=()=>n;let reads=0;const c={async getBlockNumber(){reads++;return 130n;}};await assert.rejects(inspectLiquidityCustody([c,{...c}],policy()));assert.equal(reads,0);}}finally{Date.now=real;}
  const p=policy(),pending=inspectLiquidityCustody(cs(),p);p.governor=a(99);assert.equal((await pending).governor,a(3));
});
test('held state, runtime, owner, zero approval, exact liquidity and every constructor policy field fail closed',async()=>{
  for(const o of [{held:false},{released:true},{paused:1},{governor:a(8)},{guardian:a(8)},{treasury:a(8)},{wrongCode:true},{owner:a(3)},{approved:a(8)},{liquidity:124n},...['manager','factory','pool','token0','token1'].flatMap(k=>[{changePolicy:v=>v[k].target=a(8)},{changePolicy:v=>v[k].codeHash=h(8)}]),...['positionId','fee','tickLower','tickUpper','expectedLiquidity'].map(k=>({changePolicy:v=>v[k]=typeof v[k]==='bigint'?v[k]+1n:v[k]+1}))])await assert.rejects(inspectLiquidityCustody(cs(o),policy()));
});
test('custody reads reject changed headers after the old reader finished, disagreement and clock rollback',async()=>{
  for(const changedHeaderAt of [3,4])await assert.rejects(inspectLiquidityCustody([client(),client({changedHeaderAt})],policy()),/snapshot changed/);
  await assert.rejects(inspectLiquidityCustody([client(),client({paused:true})],policy()),/disagree/);
  const real=Date.now;let now=10000;try{Date.now=()=>now;const c=client(),read=c.readContract;c.readContract=async q=>{const r=await read(q);if(q.functionName==='held')now--;return r;};await assert.rejects(inspectLiquidityCustody([client(),c],policy()),/clock moved backward/);}finally{Date.now=real;}
});
test('custody peer failure fences delayed results and preserves original method receivers',async()=>{
  const releases=[];let after=0;const left=client(),right=client();const read=left.readContract;left.readContract=async function(q){assert.equal(this,left);if(q.address.toLowerCase()===policy().custody.address)throw Error('Fixture custody read failed');return read(q);};
  const rread=right.readContract;right.readContract=async function(q){assert.equal(this,right);if(q.address.toLowerCase()===policy().custody.address)return new Promise(r=>{releases.push(()=>r(custodyValue(q.functionName)));});return rread(q);};
  const block=right.getBlock;right.getBlock=async q=>{after++;return block(q);};
  await assert.rejects(inspectLiquidityCustody([left,right],policy()),/Fixture custody read failed/);const before=after;assert.equal(releases.length,7);releases.forEach(r=>r());await new Promise(r=>setImmediate(r));assert.equal(after,before);
});
test('one thirty-second outer lifetime bounds a hung custody read and fences late work',{timeout:40000},async()=>{
  const releases=[];let headers=0;const c=client({onCustody:k=>new Promise(r=>releases.push(()=>r(custodyValue(k))))});const block=c.getBlock;c.getBlock=async q=>{headers++;return block(q);};const started=Date.now();
  await assert.rejects(inspectLiquidityCustody([client(),c],policy()),/timed out/);assert.ok(Date.now()-started>=29000);assert.equal(releases.length,7);const before=headers;releases.forEach(r=>r());await new Promise(r=>setImmediate(r));assert.equal(headers,before);
});
