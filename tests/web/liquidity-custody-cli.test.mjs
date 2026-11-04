import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {once} from 'node:events';import {createServer} from 'node:http';import {createHash} from 'node:crypto';
import {keccak256,parseAbi,decodeFunctionData,encodeFunctionResult,encodeFunctionData} from 'viem';
import {LP_MANAGER,LP_FACTORY,LP_READ_ABI} from '../../lib/managed-liquidity-position.ts';
import {LP_CUSTODY_READ_ABI} from '../../lib/managed-liquidity-custody.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0'),zero=a(0),code='0x6001600055',pin=address=>({address,codeHash:keccak256(code)}),sig=s=>keccak256(new TextEncoder().encode(s));
const abi=[...LP_READ_ABI,...LP_CUSTODY_READ_ABI,...parseAbi(['function deposit()','function releaseToTreasury()'])];
const policy=()=>({chainId:97,manager:pin(LP_MANAGER),factory:pin(LP_FACTORY),pool:pin(a(9)),token0:pin(a(1)),token1:pin(a(2)),custody:pin(a(10)),governor:a(3),guardian:a(4),treasury:a(5),fee:500,positionId:'12',tickLower:-10,tickUpper:10,expectedLiquidity:'123'});
const input=()=>({policy:policy(),transactionHash:h(50)});
const rawPolicy=p=>({...Object.fromEntries(['manager','factory','pool','token0','token1'].map(k=>[k,{target:p[k].address,codeHash:p[k].codeHash}])),positionId:12n,fee:500,tickLower:-10,tickUpper:10,expectedLiquidity:123n});
async function fixture(fn){
 const dir=mkdtempSync(join(tmpdir(),'fortune-lp-cli-')),path=join(dir,'private-policy.json');writeFileSync(path,JSON.stringify(input()));
 const p=policy(),timestamp=BigInt(Math.floor(Date.now()/1000)-60);let calls=0,kind='deposit',mode='ok';
 const server=createServer(async(req,res)=>{try{let body='';for await(const c of req)body+=c;const q=JSON.parse(body);calls++;
  if(mode==='changed'){writeFileSync(path,JSON.stringify(input())+'\n');mode='ok';}
  if(mode==='provider-error')throw Error('PRIVATE_PROVIDER');let result;
  if(q.method==='eth_chainId')result='0x61';
  else if(q.method==='eth_blockNumber')result='0x82';
  else if(q.method==='eth_getBlockByNumber'){assert.equal(q.params[0],'0x6e');result={number:'0x6e',hash:h(110),timestamp:'0x'+timestamp.toString(16),transactions:[h(50)]};}
  else if(q.method==='eth_getCode'){assert.equal(q.params[1],'0x6e');result=code;}
  else if(q.method==='eth_getTransactionByHash')result={hash:h(50),blockHash:h(110),blockNumber:'0x6e',transactionIndex:'0x0',chainId:'0x61',from:p.governor,to:p.custody.address,value:'0x0',input:encodeFunctionData({abi,functionName:kind==='deposit'?'deposit':'releaseToTreasury'}),type:'0x0',gas:'0x100',gasPrice:'0x1',nonce:'0x0',v:'0x1b',r:h(1),s:h(1)};
  else if(q.method==='eth_getTransactionReceipt'){
   const owner=kind==='deposit'?p.governor:p.custody.address,to=kind==='deposit'?p.custody.address:p.treasury;
   const topic=address=>'0x'+'0'.repeat(24)+address.slice(2).toLowerCase();
   const logs=[{address:p.manager.address,topics:[sig('Approval(address,address,uint256)'),topic(owner),topic(zero),h(12)]},{address:p.manager.address,topics:[sig('Transfer(address,address,uint256)'),topic(owner),topic(to),h(12)]},{address:p.custody.address,topics:[sig(kind==='deposit'?'PositionDeposited(uint256,address)':'PositionReleased(uint256,address)'),h(12),topic(kind==='deposit'?p.governor:p.treasury)]}];
   if(mode==='wrong-nft')logs[1].topics[3]=h(99);
   result={transactionHash:h(50),status:'0x1',blockHash:h(110),blockNumber:'0x6e',transactionIndex:'0x0',from:p.governor,to:p.custody.address,gasUsed:'0x100',cumulativeGasUsed:'0x100',effectiveGasPrice:'0x1',logs:logs.map((l,i)=>({...l,data:'0x',blockHash:h(110),blockNumber:'0x6e',transactionHash:h(50),transactionIndex:'0x0',logIndex:'0x'+(i+4).toString(16),removed:false}))};
  }else if(q.method==='eth_call'){
   assert.equal(q.params[1],'0x6e');const {functionName}=decodeFunctionData({abi,data:q.params[0].data});
   const fixed={governor:p.governor,guardian:p.guardian,treasury:p.treasury,paused:kind==='release',held:kind==='deposit',released:kind==='release',policy:rawPolicy(p),positions:[0n,zero,a(1),a(2),500,-10,10,123n,1n,2n,3n,4n],ownerOf:kind==='deposit'?p.custody.address:p.treasury,getApproved:zero,factory:LP_FACTORY,getPool:p.pool.address,token0:a(1),token1:a(2),fee:500,tickSpacing:10};
   result=encodeFunctionResult({abi,functionName,result:fixed[functionName]});
  }else throw Error('Unexpected write/RPC');res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
 }catch{res.statusCode=500;res.end('PRIVATE_PROVIDER');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const env={...process.env,FORTUNE_LP_CUSTODY_RECEIPT_READ_ENABLED:'true',FORTUNE_LP_READ_RPC_URL:'https://lp-custody-one.invalid/private-marker',FORTUNE_LP_SECONDARY_RPC_URL:'https://lp-custody-two.invalid/private-marker',FORTUNE_TEST_LP_CUSTODY_RPC:`http://127.0.0.1:${server.address().port}`};
 async function run(overrides={},args=[kind,path]){
  const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/liquidity-custody-http.mjs','scripts/inspect-liquidity-custody-receipt.mjs',...args],{env:{...env,...overrides}});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  const timer=setTimeout(()=>child.kill('SIGKILL'),40000);try{const [status]=await once(child,'exit');return{status,out,err};}finally{clearTimeout(timer);}
 }
 try{await fn({dir,path,run,calls:()=>calls,mode:v=>mode=v,kind:v=>kind=v,timestamp});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
}
const rejected=r=>{assert.equal(r.status,1,r.err);assert.equal(r.out,'');assert.match(r.err,/Liquidity custody receipt unavailable/);assert.doesNotMatch(r.err,/PRIVATE_PROVIDER|private-marker|private-policy|lp-custody-one|lp-custody-two/);};
test('actual custody operator CLI invokes both unchanged receipt engines through HTTP ABI and preserves stable replay',async()=>fixture(async f=>{
 for(const kind of ['deposit','release']){f.kind(kind);const bytes=readFileSync(f.path),r=await f.run();assert.equal(r.status,0,r.err);const v=JSON.parse(r.out),x=v.observation;assert.equal(v.kind,kind);assert.equal(v.policySha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(x.position.liquidityUnits,'123');assert.equal(x.position.claimableFees,null);assert.equal(x.position.totalValue,null);assert.equal(x.position.owner,kind==='deposit'?a(10):a(5));assert.equal(x.blockTimestamp,f.timestamp.toString());assert.equal(x.currentAuthorization,null);assert.equal(v.currentAuthorization,null);
 for(const key of ['executionAuthorized','fullManagedLiquidityReadiness','independentProvidersVerified','capitalOriginVerified','treasuryControlVerified','projectConsentVerified','finalityVerified'])assert.equal(x[key],false);assert.equal(v.executionAuthorized,false);assert.equal(v.fullManagedLiquidityReadiness,false);
 const second=await f.run();assert.equal(second.status,0,second.err);assert.equal(JSON.parse(second.out).observation.evidenceId,x.evidenceId);assert.deepEqual(readFileSync(f.path),bytes);assert.doesNotMatch(r.out,/private-marker|private-policy|lp-custody-one/);
 rejected(await f.run({},[kind==='deposit'?'release':'deposit',f.path]));}
 assert.ok(f.calls()>50);
}));
test('disabled/arguments/strict bounded regular file and malformed exact policies reject before RPC',async()=>fixture(async f=>{
 rejected(await f.run({FORTUNE_LP_CUSTODY_RECEIPT_READ_ENABLED:''},['deposit',join(f.dir,'absent')]));for(const args of [[],['deposit'],['unknown',f.path],['deposit',f.path,'extra'],['deposit',f.dir],['deposit',join(f.dir,'absent')]])rejected(await f.run({},args));
 for(const bytes of [Buffer.from([255]),' '.repeat(16385),JSON.stringify({...input(),extra:1}),JSON.stringify({...input(),policy:{...policy(),chainId:56}}),JSON.stringify({...input(),transactionHash:h(0)})]){writeFileSync(f.path,bytes);rejected(await f.run());}
 assert.equal(f.calls(),0);
}));
test('unsafe/credential-bearing/same-origin providers reject privately before RPC',async()=>fixture(async f=>{
 for(const [one,two] of [['http://lp-custody-one.invalid','https://lp-custody-two.invalid'],['https://same.invalid/a','https://same.invalid/b'],['https://user:private-marker@lp-custody-one.invalid','https://lp-custody-two.invalid'],['https://lp-custody-one.invalid/#fragment','https://lp-custody-two.invalid']])rejected(await f.run({FORTUNE_LP_READ_RPC_URL:one,FORTUNE_LP_SECONDARY_RPC_URL:two}));assert.equal(f.calls(),0);
}));
test('wrong canonical receipt, provider errors and literal policy changes during RPC discard output privately',async()=>fixture(async f=>{
 for(const kind of ['deposit','release'])for(const mode of ['wrong-nft','provider-error','changed']){f.kind(kind);writeFileSync(f.path,JSON.stringify(input()));f.mode(mode);rejected(await f.run());}assert.ok(f.calls()>0);
}));
test('exact16KiB policy succeeds; over-bound and writerless FIFO reject without RPC',async()=>fixture(async f=>{
 const json=JSON.stringify(input());writeFileSync(f.path,json+' '.repeat(16384-Buffer.byteLength(json)));const r=await f.run();assert.equal(r.status,0,r.err);const before=f.calls();writeFileSync(f.path,json+' '.repeat(16385-Buffer.byteLength(json)));rejected(await f.run());assert.equal(f.calls(),before);
 if(process.platform==='linux'){const pipe=join(f.dir,'writerless');assert.equal(spawnSync('mkfifo',[pipe]).status,0);rejected(await f.run({},['deposit',pipe]));assert.equal(f.calls(),before);}
}));
