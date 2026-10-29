import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { keccak256 } from 'viem';
import { inspectLiquidityPosition,LP_MANAGER,LP_FACTORY } from '../../lib/managed-liquidity-position.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0'),zero=a(0),code='0x6001600055';
const pin=address=>({address,codeHash:keccak256(code)});
const policy=()=>({chainId:97,manager:pin(LP_MANAGER),factory:pin(LP_FACTORY),pool:pin(a(9)),token0:pin(a(1)),token1:pin(a(2)),owner:a(3),fee:500,positionId:'12'});
function client(options={}){
  const p=policy();let blockReads=0;
  return {
    async getChainId(){if(options.unavailable)throw Error('secret upstream');return options.chainId??97;},
    async getBlockNumber(){return options.head??130n;},
    async getBlock({blockNumber}){assert.equal(blockNumber,110n);blockReads++;return {number:blockNumber,hash:options.reorg&&blockReads>1?h(9):options.blockHash??h(110)};},
    async getCode({blockNumber}){assert.equal(blockNumber,110n);return options.wrongCode?'0x00':code;},
    async readContract({address,functionName,blockNumber}){
      assert.equal(blockNumber,110n);
      if(functionName==='positions')return [0n,zero,a(1),options.wrongToken?a(8):a(2),500,options.badTicks?-11:-10,10,options.empty?0n:123n,1n,2n,options.negative?-1n:3n,4n];
      if(functionName==='ownerOf')return options.owner??p.owner;
      if(functionName==='getApproved')return options.approvalMismatch?a(7):zero;
      if(functionName==='factory')return LP_FACTORY;
      if(functionName==='getPool')return options.wrongPool?a(8):p.pool.address;
      if(functionName==='token0')return a(1);
      if(functionName==='token1')return a(2);
      if(functionName==='fee')return 500;
      if(functionName==='tickSpacing')return 10;
      throw Error('Unexpected read');
    }
  };
}
const clients=o=>[client(o),client(o)];
test('position observation pins every read and reports raw liquidity and owed fields without value or fee claims',async()=>{
  const r=await inspectLiquidityPosition(clients(),policy());assert.equal(r.blockNumber,'110');assert.equal(r.liquidityUnits,'123');assert.equal(r.lastComputedOwed0,'3');
  assert.equal(r.claimableFees,null);assert.equal(r.totalValue,null);assert.equal(r.globalOperatorApprovalsEnumerated,false);assert.equal(r.executionAuthorized,false);assert.ok(Object.isFrozen(r));
  assert.equal((await inspectLiquidityPosition(clients({empty:true}),policy())).liquidityUnits,'0');
});
test('position inspection rejects custody, pool, runtime, tick, malformed integer and canonicality failures',async()=>{
  for(const o of [{chainId:56},{unavailable:true},{wrongPool:true},{wrongToken:true},{wrongCode:true},{owner:a(8)},{badTicks:true},{negative:true},{approvalMismatch:true},{reorg:true},{head:19n}]) await assert.rejects(inspectLiquidityPosition(clients(o),policy()));
  await assert.rejects(inspectLiquidityPosition([client(),client({blockHash:h(111)})],policy()),/disagree/);
});
test('policy is testnet-only, exact venue pinned, bounded and immutable during asynchronous reads',async()=>{
  for(const p of [{...policy(),chainId:56},{...policy(),positionId:'0'},{...policy(),positionId:(1n<<256n).toString()},{...policy(),manager:pin(a(7))},{...policy(),owner:zero},{...policy(),token1:pin(a(1))}])await assert.rejects(inspectLiquidityPosition(clients(),p));
  const one=client();await assert.rejects(inspectLiquidityPosition([one,one],policy()));
  const p=policy(),promise=inspectLiquidityPosition(clients(),p);p.owner=a(99);assert.equal((await promise).owner,a(3));
});
test('operator CLI fails without printing credentials or private paths',()=>{
  const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/inspect-liquidity-position.mjs','private-policy.json'],{encoding:'utf8',env:{...process.env,FORTUNE_LP_READ_RPC_URL:'https://secret.invalid/key'}});
  assert.equal(r.status,1);assert.equal(r.stdout,'');assert.doesNotMatch(r.stderr,/private-policy|secret.invalid|\/key/);
});

test('a failed LP observation fences delayed client completions before further reads',async()=>{
  let release,reads=0;
  const failed={...client(),async getChainId(){throw Error('Fixture provider stopped');}};
  const delayed={...client(),getChainId:()=>new Promise(resolve=>{release=resolve;}),async getBlock(){reads++;throw Error('Late read');}};
  await assert.rejects(inspectLiquidityPosition([failed,delayed],policy()),/Fixture provider stopped/);
  assert.equal(typeof release,'function');release(97);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,0,'A returned failure cannot allow follow-on RPC actions');
});
test('a hung LP head request has a real wall deadline and cannot resume observation afterward',{timeout:40000},async()=>{
  const releases=[];let reads=0;
  const delayed={getBlockNumber:()=>new Promise(resolve=>releases.push(resolve)),async getChainId(){reads++;return 97;}};
  const started=Date.now();
  await assert.rejects(inspectLiquidityPosition([delayed,{...delayed}],policy()),/timed out/);
  assert.ok(Date.now()-started>=29000,'The real 30-second timer must run');
  releases.forEach(resolve=>resolve(130n));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,0);
});
