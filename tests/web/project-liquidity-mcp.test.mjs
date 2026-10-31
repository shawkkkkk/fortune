import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { keccak256, decodeFunctionData, encodeFunctionResult } from 'viem';
import { LP_READ_ABI, LP_MANAGER, LP_FACTORY } from '../../lib/managed-liquidity-position.ts';
import { projectLiquidityReader } from '../../scripts/project-liquidity-reader.mjs';
import { createProjectMcp } from '../../scripts/project-mcp-server.mjs';

const a = n => '0x' + n.toString(16).padStart(40,'0'), h = n => '0x' + n.toString(16).padStart(64,'0');
const code = '0x6001600055', pin = address => ({ address, codeHash: keccak256(code) }), token = a(1);
const policy = () => ({ chainId:97, manager:pin(LP_MANAGER), factory:pin(LP_FACTORY), pool:pin(a(9)),
  token0:pin(token), token1:pin(a(2)), owner:a(3), fee:500, positionId:'12' });
const result = (name, p=policy()) => ({ positions:[0n,a(0),token,a(2),500,-10,10,123n,1n,2n,3n,4n],
  ownerOf:p.owner, getApproved:a(0), factory:LP_FACTORY, getPool:p.pool.address, token0:token, token1:a(2), fee:500, tickSpacing:10 })[name];
function client(extra={}) { return {
  async getBlockNumber(){return 130n;}, async getChainId(){return 97;},
  async getBlock({blockNumber}) { assert.equal(blockNumber,110n); return {number:blockNumber,hash:h(110)}; },
  async getCode(){return code;}, async readContract({functionName,blockNumber}) {assert.equal(blockNumber,110n);return result(functionName);}, ...extra,
}; }
function setup(p=policy()) {
  const dir=mkdtempSync(join(tmpdir(),'fortune-lp-mcp-')), policyPath=join(dir,'policy.json');
  writeFileSync(policyPath,JSON.stringify(p));
  return {dir,policyPath,token,cleanup(){rmSync(dir,{recursive:true,force:true});}};
}
const req=(id,method,params)=>({jsonrpc:'2.0',id,method,params});
const init=req(1,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'lp-test',version:'1'}});
const initialized={jsonrpc:'2.0',method:'notifications/initialized'}, uri=`fortune://97/${token}/liquidity-position`;
async function ready(config={}) { const f=createProjectMcp({token,...config});await f(init);await f(initialized);return f; }

test('LP MCP opt-in preserves defaults, all existing readers and the shared four-read quota',async()=>{
  const base=await ready();assert.equal((await base(req(2,'tools/list'))).result.tools.length,2);
  assert.ok((await base(req(3,'tools/call',{name:'get_liquidity_position'}))).error);
  assert.throws(()=>createProjectMcp({token,readLiquidity:{}}));
  const s=setup();try {
    const readLiquidity=projectLiquidityReader(s,[client(),client()]);
    const f=await ready({readLiquidity,readCharacter:async()=>({source:'history'}),readProvenance:async()=>({source:'provenance'}),readNotebook:async()=>({source:'notebook'}),readCanon:async()=>({source:'canon'}),readSnapshot:async()=>({source:'snapshot'})});
    const names=(await f(req(2,'tools/list'))).result.tools.map(t=>t.name);assert.equal(names.length,6);assert.ok(names.includes('get_liquidity_position'));
    assert.ok((await f(req(3,'resources/list'))).result.resources.some(r=>r.uri===uri));
    assert.ok((await f(req(4,'tools/call',{name:'get_liquidity_position',arguments:{owner:a(7)}}))).error);
    assert.ok((await f(req(5,'resources/read',{uri:uri.replace(token,a(7))}))).error);
    const one=JSON.parse((await f(req(6,'tools/call',{name:'get_liquidity_position'}))).result.content[0].text);
    const two=JSON.parse((await f(req(7,'resources/read',{uri}))).result.contents[0].text);
    assert.deepEqual({...one.position,observedAtMs:0},{...two.position,observedAtMs:0});
    assert.equal(one.position.liquidityUnits,'123');assert.equal(one.position.claimableFees,null);assert.equal(one.position.totalValue,null);
    for(const k of ['projectCustodyVerified','independentProvidersVerified','fullManagedLiquidityReadiness','executionAuthorized'])assert.equal(one[k],false);
    assert.equal(one.currentAuthorization,null);assert.doesNotMatch(JSON.stringify(one),/policy.json|https:|codeHash/);
    assert.equal(JSON.parse((await f(req(8,'tools/call',{name:'get_project_canon'}))).result.content[0].text).source,'canon');
    assert.equal(JSON.parse((await f(req(9,'tools/call',{name:'get_research_notebook'}))).result.content[0].text).source,'notebook');
    assert.equal((await f(req(10,'tools/call',{name:'get_liquidity_position'}))).result.isError,true);
  }finally{s.cleanup();}
});

test('literal bounded startup policy and token binding reject without RPC or file creation',async()=>{
  let reads=0;const c=client({async getBlockNumber(){reads++;throw Error('PRIVATE_RPC');}});
  for(const p of [{...policy(),extra:'text'},{...policy(),positionId:12},{...policy(),chainId:56},{...policy(),manager:{...policy().manager,extra:1}},{...policy(),token0:pin(a(4)),token1:pin(a(5))}]){
    const s=setup(p);try{assert.throws(()=>projectLiquidityReader(s,[c,{...c}]));}finally{s.cleanup();}
  }
  const s=setup();try{
    assert.throws(()=>projectLiquidityReader({...s,policyPath:join(s.dir,'absent')},[c,{...c}]));assert.equal(existsSync(join(s.dir,'absent')),false);
    assert.throws(()=>projectLiquidityReader(s,[c,c]));
    writeFileSync(s.policyPath,' '.repeat(16385));assert.throws(()=>projectLiquidityReader(s,[c,{...c}]));
    writeFileSync(s.policyPath,Buffer.from([255]));assert.throws(()=>projectLiquidityReader(s,[c,{...c}]));
    assert.equal(reads,0);
  }finally{s.cleanup();}
});

test('policy bytes are rechecked before and after awaits; RPC failures stay private and consume quota',async()=>{
  const s=setup();try {
    let reads=0;const c=client({async getBlockNumber(){reads++;throw Error('PRIVATE_RPC/key');}});
    const read=projectLiquidityReader(s,[c,{...c}]);await assert.rejects(read(a(8)));assert.equal(reads,0);
    const original=readFileSync(s.policyPath);writeFileSync(s.policyPath,Buffer.concat([original,Buffer.from('\n')]));await assert.rejects(read(token));assert.equal(reads,0);
    writeFileSync(s.policyPath,original);const f=await ready({readLiquidity:read});
    for(let i=0;i<5;i++){const response=await f(req(i+2,'tools/call',{name:'get_liquidity_position'}));assert.equal(response.result.isError,true);assert.doesNotMatch(JSON.stringify(response),/PRIVATE_RPC|policy.json|\/key/);}
    assert.equal(reads,8);
    const changed=projectLiquidityReader(s,[client({async getBlockNumber(){writeFileSync(s.policyPath,Buffer.concat([original,Buffer.from('\n')]));return 130n;}}),client()]);
    await assert.rejects(changed(token),/Policy changed/);
  }finally{s.cleanup();}
});

test('actual stdio CLI invokes the real LP engine through viem HTTP/ABI', {timeout:20000},async()=>{
  const s=setup();let calls=0,child,timer;const server=createServer(async(req,res)=>{
    try { let body='';for await(const chunk of req)body+=chunk;const q=JSON.parse(body);calls++;let value;
      if(q.method==='eth_chainId')value='0x61';else if(q.method==='eth_blockNumber')value='0x82';
      else if(q.method==='eth_getBlockByNumber'){assert.equal(q.params[0],'0x6e');value={number:'0x6e',hash:h(110),timestamp:'0x6a000000',transactions:[]};}
      else if(q.method==='eth_getCode'){assert.equal(q.params[1],'0x6e');value=code;}
      else if(q.method==='eth_call'){assert.equal(q.params[1],'0x6e');const {functionName}=decodeFunctionData({abi:LP_READ_ABI,data:q.params[0].data});value=encodeFunctionResult({abi:LP_READ_ABI,functionName,result:result(functionName)});}
      else throw Error('Unexpected RPC');res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result:value}));
    }catch{res.statusCode=500;res.end('{}');}
  });server.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    const before=readFileSync(s.policyPath),env={...process.env,FORTUNE_PROJECT_MCP_ENABLED:'true',FORTUNE_PROJECT_TOKEN:token,FORTUNE_PROJECT_CHARACTER_ENABLED:'',FORTUNE_PROJECT_CHARACTER_RECHECK_ENABLED:'',FORTUNE_PROJECT_NOTEBOOK_ENABLED:'',FORTUNE_PROJECT_LP_READ_ENABLED:'true',FORTUNE_PROJECT_LP_POLICY:s.policyPath,FORTUNE_LP_READ_RPC_URL:'https://lp-one.invalid/rpc',FORTUNE_LP_SECONDARY_RPC_URL:'https://lp-two.invalid/rpc',FORTUNE_TEST_LP_RPC:`http://127.0.0.1:${server.address().port}`};
    child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/project-liquidity-http.mjs','scripts/project-mcp.mjs'],{env});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);timer=setTimeout(()=>child.kill(),15000);
    child.stdin.end([init,initialized,req(2,'tools/list'),req(3,'tools/call',{name:'get_liquidity_position'}),req(4,'resources/read',{uri})].map(JSON.stringify).join('\n')+'\n');
    const [status]=await once(child,'exit');assert.equal(status,0,err);const replies=out.trim().split('\n').map(JSON.parse);assert.equal(replies[1].result.tools.length,3);
    const one=JSON.parse(replies[2].result.content[0].text),two=JSON.parse(replies[3].result.contents[0].text);assert.equal(one.position.blockNumber,'110');assert.equal(two.position.liquidityUnits,'123');assert.equal(two.projectCustodyVerified,false);assert.equal(two.executionAuthorized,false);assert.ok(calls>40);assert.deepEqual(readFileSync(s.policyPath),before);assert.doesNotMatch(out,/lp-one|policy.json|codeHash/);
  }finally{clearTimeout(timer);child?.kill();server.closeAllConnections();await new Promise(r=>server.close(r));s.cleanup();}
});

test('CLI opt-in preflight rejects missing/foreign policy and non-distinct HTTPS origins privately',()=>{
  const s=setup();try {
    const base={...process.env,FORTUNE_PROJECT_MCP_ENABLED:'true',FORTUNE_PROJECT_TOKEN:token,FORTUNE_PROJECT_CHARACTER_ENABLED:'',FORTUNE_PROJECT_CHARACTER_RECHECK_ENABLED:'',FORTUNE_PROJECT_NOTEBOOK_ENABLED:'',FORTUNE_PROJECT_LP_READ_ENABLED:'true',FORTUNE_PROJECT_LP_POLICY:s.policyPath};
    for(const urls of [['http://lp-one.invalid','https://lp-two.invalid'],['https://same.invalid/a','https://same.invalid/b'],['https://user:password@one.invalid','https://two.invalid']]){
      const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/project-mcp.mjs'],{env:{...base,FORTUNE_LP_READ_RPC_URL:urls[0],FORTUNE_LP_SECONDARY_RPC_URL:urls[1]},input:'',encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stdout,'');assert.doesNotMatch(r.stderr,/password|policy.json|same.invalid/);
    }
    const disabled=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/project-mcp.mjs'],{env:{...base,FORTUNE_PROJECT_LP_READ_ENABLED:'',FORTUNE_PROJECT_LP_POLICY:'/private/absent'},input:[init,initialized,req(2,'tools/list')].map(JSON.stringify).join('\n')+'\n',encoding:'utf8'});
    assert.equal(disabled.status,0,disabled.stderr);assert.equal(JSON.parse(disabled.stdout.trim().split('\n')[1]).result.tools.length,2);
  }finally{s.cleanup();}
});
