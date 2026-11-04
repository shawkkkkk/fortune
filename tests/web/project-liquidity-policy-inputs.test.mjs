import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {keccak256} from 'viem';
import {LP_MANAGER,LP_FACTORY} from '../../lib/managed-liquidity-position.ts';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0'),code='0x6001600055';
const pin=address=>({address,codeHash:keccak256(code)}),token=a(1);
const policy={chainId:97,manager:pin(LP_MANAGER),factory:pin(LP_FACTORY),pool:pin(a(9)),token0:pin(token),token1:pin(a(2)),owner:a(3),fee:500,positionId:'12'};
const loader=resolve('scripts/register-ts.mjs');
const envFor=path=>({...process.env,FORTUNE_PROJECT_MCP_ENABLED:'true',FORTUNE_PROJECT_TOKEN:token,FORTUNE_PROJECT_CHARACTER_ENABLED:'',FORTUNE_PROJECT_CHARACTER_RECHECK_ENABLED:'',FORTUNE_PROJECT_NOTEBOOK_ENABLED:'',FORTUNE_PROJECT_LP_READ_ENABLED:'true',FORTUNE_PROJECT_LP_POLICY:path,FORTUNE_LP_READ_RPC_URL:'https://lp-one.invalid/rpc',FORTUNE_LP_SECONDARY_RPC_URL:'https://lp-two.invalid/rpc'});
const messages=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'policy-test',version:'1'}}},{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:2,method:'tools/list'}].map(JSON.stringify).join('\n')+'\n';

for(const stage of ['startup','before-read','after-read'])test(`LP adapter rejects writerless FIFO at ${stage} without blocking`,{skip:process.platform!=='linux'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'fortune-lp-policy-'));
 try{
  const fifo=join(dir,'fifo'),link=join(dir,'fifo-link'),path=join(dir,'policy.json');
  assert.equal(spawnSync('mkfifo',[fifo]).status,0);symlinkSync(fifo,link);
  for(const target of [fifo,link]){
   writeFileSync(path,JSON.stringify(policy));
   const source=`import {projectLiquidityReader} from ${JSON.stringify(resolve('scripts/project-liquidity-reader.mjs'))};
    import {unlinkSync,symlinkSync} from 'node:fs';
    const policy=${JSON.stringify(policy)},path=${JSON.stringify(path)},target=${JSON.stringify(target)},stage=${JSON.stringify(stage)};
    let reads=0,replaced=false;
    const replace=()=>{if(!replaced){unlinkSync(path);symlinkSync(target,path);replaced=true;}};
    const result={positions:[0n,${JSON.stringify(a(0))},policy.token0.address,policy.token1.address,500,-10,10,123n,1n,2n,3n,4n],ownerOf:policy.owner,getApproved:${JSON.stringify(a(0))},factory:policy.factory.address,getPool:policy.pool.address,token0:policy.token0.address,token1:policy.token1.address,fee:500,tickSpacing:10};
    const client=()=>({getBlockNumber:async()=>{reads++;if(stage==='after-read')replace();return 130n;},getChainId:async()=>97,getBlock:async()=>({number:110n,hash:${JSON.stringify(h(110))},timestamp:1000n}),getCode:async()=>${JSON.stringify(code)},readContract:async q=>result[q.functionName]});
    try{const read=projectLiquidityReader({token:policy.token0.address,policyPath:stage==='startup'?target:path},[client(),client()]);if(stage==='before-read')replace();await read(policy.token0.address);process.exitCode=1;}catch{console.log(JSON.stringify({rejected:true,reads}));}`;
   const r=spawnSync(process.execPath,['--import',loader,'--input-type=module','-e',source],{encoding:'utf8',timeout:3000});
   assert.equal(r.error,undefined,'Policy read must not wait for a FIFO writer');assert.equal(r.status,0,r.stderr);
   const out=JSON.parse(r.stdout);assert.equal(out.rejected,true);if(stage==='after-read')assert.ok(out.reads>0);else assert.equal(out.reads,0);
   // The child can replace the regular file with a FIFO symlink.
   rmSync(path,{force:true});
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('actual MCP rejects FIFO policies privately; exact16KiB regular files and symlinks retain discovery',{skip:process.platform!=='linux'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'fortune-lp-policy-cli-'));
 try{
  const fifo=join(dir,'fifo'),link=join(dir,'fifo-link'),path=join(dir,'policy.json'),regularLink=join(dir,'regular-link');
  assert.equal(spawnSync('mkfifo',[fifo]).status,0);symlinkSync(fifo,link);
  for(const target of [fifo,link]){
   const r=spawnSync(process.execPath,['--import',loader,'scripts/project-mcp.mjs'],{env:envFor(target),input:messages,encoding:'utf8',timeout:3000});
   assert.equal(r.error,undefined,'MCP startup must not wait for a FIFO writer');assert.equal(r.status,1);assert.equal(r.stdout,'');
   assert.match(r.stderr,/Fortune project MCP stopped/);assert.doesNotMatch(r.stderr,/lp-one|fifo|policy.json/);
  }
  const raw=JSON.stringify(policy);writeFileSync(path,raw+' '.repeat(16384-Buffer.byteLength(raw)));symlinkSync(path,regularLink);
  for(const target of [path,regularLink]){
   const r=spawnSync(process.execPath,['--import',loader,'scripts/project-mcp.mjs'],{env:envFor(target),input:messages,encoding:'utf8',timeout:3000});
   assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout.trim().split('\n')[1]).result.tools.length,3);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
