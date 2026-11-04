import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {keccak256,decodeFunctionData,encodeFunctionResult} from 'viem';
import {LP_READ_ABI,LP_MANAGER,LP_FACTORY} from '../../lib/managed-liquidity-position.ts';
import {LP_CUSTODY_READ_ABI} from '../../lib/managed-liquidity-custody.ts';
import {projectLiquidityCustodyReader} from '../../scripts/project-liquidity-custody-reader.mjs';
import {projectLiquidityReader} from '../../scripts/project-liquidity-reader.mjs';
import {createProjectMcp} from '../../scripts/project-mcp-server.mjs';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0'),code='0x6001600055',token=a(1);
const pin=address=>({address,codeHash:keccak256(code)}),options={enabled:true,discloseCustody:true};
const policy=()=>({chainId:97,manager:pin(LP_MANAGER),factory:pin(LP_FACTORY),pool:pin(a(9)),token0:pin(token),token1:pin(a(2)),custody:pin(a(10)),governor:a(3),guardian:a(4),treasury:a(5),fee:500,positionId:'12',tickLower:-10,tickUpper:10,expectedLiquidity:'123'});
const rawPolicy=p=>({...Object.fromEntries(['manager','factory','pool','token0','token1'].map(k=>[k,{target:p[k].address,codeHash:p[k].codeHash}])),positionId:12n,fee:500,tickLower:-10,tickUpper:10,expectedLiquidity:123n});
function result(address,name,o={}){const p=policy();if(address.toLowerCase()===p.custody.address)return ({governor:p.governor,guardian:p.guardian,treasury:p.treasury,paused:false,held:true,released:false,policy:rawPolicy(p),...o})[name];
 return ({positions:[0n,a(0),token,a(2),500,-10,10,123n,1n,2n,3n,4n],ownerOf:p.custody.address,getApproved:a(0),factory:LP_FACTORY,getPool:p.pool.address,token0:token,token1:a(2),fee:500,tickSpacing:10,...o})[name];}
function clients(o={}){return [1,2].map(marker=>({marker,async getBlockNumber(){assert.equal(this.marker,marker);return 130n;},async getChainId(){return 97;},async getBlock({blockNumber}){assert.equal(blockNumber,110n);return {number:110n,hash:h(110),timestamp:1000n};},async getCode(){return code;},async readContract(q){assert.equal(q.blockNumber,110n);return result(q.address,q.functionName,o);}}));}
function setup(){const dir=mkdtempSync(join(tmpdir(),'fortune-project-custody-')),policyPath=join(dir,'policy.json');writeFileSync(policyPath,JSON.stringify(policy()));return {dir,policyPath,token,cleanup(){rmSync(dir,{recursive:true,force:true});}};}
const req=(id,method,params)=>({jsonrpc:'2.0',id,method,params}),init=req(1,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'custody-test',version:'1'}}),initialized={jsonrpc:'2.0',method:'notifications/initialized'},uri=`fortune://97/${token}/liquidity-custody`;
async function ready(config={}){const f=createProjectMcp({token,...config});await f(init);await f(initialized);return f;}
const envFor=s=>({...process.env,FORTUNE_PROJECT_MCP_ENABLED:'true',FORTUNE_PROJECT_TOKEN:token,FORTUNE_PROJECT_CHARACTER_ENABLED:'',FORTUNE_PROJECT_CHARACTER_RECHECK_ENABLED:'',FORTUNE_PROJECT_NOTEBOOK_ENABLED:'',FORTUNE_PROJECT_LP_READ_ENABLED:'',FORTUNE_PROJECT_LP_CUSTODY_READ_ENABLED:'true',FORTUNE_PROJECT_LP_CUSTODY_DISCLOSURE_REVIEWED:'true',FORTUNE_PROJECT_LP_CUSTODY_POLICY:s.policyPath,FORTUNE_LP_READ_RPC_URL:'https://lp-one.invalid/rpc',FORTUNE_LP_SECONDARY_RPC_URL:'https://lp-two.invalid/rpc'});

test('custody policy, disclosure and fixed project preflight reject before RPC; bounded regular symlinks remain',async()=>{
 let calls=0;const cs=[{getBlockNumber:async()=>{calls++;throw Error('PRIVATE');}},{}];
 assert.throws(()=>projectLiquidityCustodyReader({token,policyPath:'/missing'},cs));assert.throws(()=>projectLiquidityCustodyReader({token,policyPath:'/missing'},cs,{enabled:true}));
 const s=setup();try{
  for(const patch of [{chainId:56},{extra:1},{positionId:12},{expectedLiquidity:'0'},{guardian:a(3)},{token0:pin(a(8))}]){writeFileSync(s.policyPath,JSON.stringify({...policy(),...patch}));assert.throws(()=>projectLiquidityCustodyReader(s,cs,options));}
  for(const input of [Buffer.from([255]),' '.repeat(16385),'{}']){writeFileSync(s.policyPath,input);assert.throws(()=>projectLiquidityCustodyReader(s,cs,options));}assert.equal(calls,0);
  const raw=JSON.stringify(policy());writeFileSync(s.policyPath,raw+' '.repeat(16384-Buffer.byteLength(raw)));const link=join(s.dir,'regular-link');symlinkSync(s.policyPath,link);
  const readers=clients();assert.throws(()=>projectLiquidityCustodyReader(s,[readers[0],readers[0]],options));
  const read=projectLiquidityCustodyReader({...s,policyPath:link},readers,options);await assert.rejects(read(a(8)));const x=await read(token);assert.equal(x.custody.held,true);assert.equal(x.custody.position.claimableFees,null);assert.equal(x.custody.position.totalValue,null);assert.equal(x.currentAuthorization,null);assert.equal(x.projectCustodyVerified,false);assert.equal(x.executionAuthorized,false);
  assert.doesNotMatch(JSON.stringify(x),/policy.json|codeHash|regular-link/);
 }finally{s.cleanup();}
});
test('MCP custody tool/resource coexist with old LP/history readers and share four reads including failures',async()=>{
 const base=await ready();assert.equal((await base(req(2,'tools/list'))).result.tools.length,2);assert.ok((await base(req(3,'tools/call',{name:'get_liquidity_custody'}))).error);assert.throws(()=>createProjectMcp({token,readCustody:3}));
 const s=setup();try{
  const readCustody=projectLiquidityCustodyReader(s,clients(),options),p=policy(),lp={...p,owner:p.custody.address};for(const k of ['custody','governor','guardian','treasury','tickLower','tickUpper','expectedLiquidity'])delete lp[k];const lpPath=join(s.dir,'lp.json');writeFileSync(lpPath,JSON.stringify(lp));
  const f=await ready({readCustody,readLiquidity:projectLiquidityReader({...s,policyPath:lpPath},clients()),readCharacter:async()=>({history:true}),readProvenance:async()=>({provenance:true}),readNotebook:async()=>({notebook:true}),readCanon:async()=>({canon:true})});
  assert.equal((await f(req(2,'tools/list'))).result.tools.length,7);assert.equal((await f(req(3,'resources/list'))).result.resources.length,7);
  assert.ok((await f(req(4,'tools/call',{name:'get_liquidity_custody',arguments:{policyPath:'/private'}}))).error);assert.ok((await f(req(5,'resources/read',{uri:uri.replace(token,a(8))}))).error);
  const one=JSON.parse((await f(req(6,'tools/call',{name:'get_liquidity_custody'}))).result.content[0].text),two=JSON.parse((await f(req(7,'resources/read',{uri}))).result.contents[0].text);
  assert.deepEqual({...one.custody,observedAtMs:0,position:{...one.custody.position,observedAtMs:0}},{...two.custody,observedAtMs:0,position:{...two.custody.position,observedAtMs:0}});
  assert.equal(JSON.parse((await f(req(8,'tools/call',{name:'get_liquidity_position'}))).result.content[0].text).position.owner,p.custody.address);
  assert.equal(JSON.parse((await f(req(9,'tools/call',{name:'get_project_canon'}))).result.content[0].text).canon,true);assert.equal((await f(req(10,'tools/call',{name:'get_liquidity_custody'}))).result.isError,true);
  writeFileSync(s.policyPath,JSON.stringify({...policy(),guardian:a(8)}));const failed=await ready({readCustody});for(let i=0;i<5;i++){const r=await failed(req(i+2,'tools/call',{name:'get_liquidity_custody'}));assert.equal(r.result.isError,true);assert.doesNotMatch(JSON.stringify(r),/policy.json|PRIVATE/);}
 }finally{s.cleanup();}
});
test('actual custody engine rejects released/wrong-role states; literal pins and monotonic fences stop late work',async()=>{
 const s=setup();try{
  for(const o of [{held:false},{released:true},{governor:a(8)},{ownerOf:a(3)},{getApproved:a(8)}])await assert.rejects(projectLiquidityCustodyReader(s,clients(o),options)(token));
  const original=readFileSync(s.policyPath),cs=clients();let calls=0;cs[0].getBlockNumber=async()=>{calls++;writeFileSync(s.policyPath,Buffer.concat([original,Buffer.from('\n')]));return 130n;};await assert.rejects(projectLiquidityCustodyReader(s,cs,options)(token),/policy changed/);assert.equal(calls,1);writeFileSync(s.policyPath,original);
  const c=clients();let release,follow=0;c[0].getBlockNumber=async()=>{throw Error('peer');};c[1].getBlockNumber=()=>new Promise(r=>release=r);c[1].getChainId=async()=>{follow++;return 97;};await assert.rejects(projectLiquidityCustodyReader(s,c,options)(token));release(130n);await new Promise(r=>setImmediate(r));assert.equal(follow,0);
  const real=Date.now;try{let now=10000;Date.now=()=>now;const c=clients();c[0].getBlockNumber=async()=>{now=11000;return 130n;};c[0].getChainId=async()=>{now=10500;return 97;};await assert.rejects(projectLiquidityCustodyReader(s,c,options)(token),/clock/);}finally{Date.now=real;}
 }finally{s.cleanup();}
});

test('actual stdio custody tool/resource use viem HTTP/ABI and preserve policy bytes',{timeout:20000},async()=>{
 const s=setup();let calls=0,child,timer;const server=createServer(async(req,res)=>{try{let body='';for await(const chunk of req)body+=chunk;const q=JSON.parse(body);calls++;let value;
  if(q.method==='eth_chainId')value='0x61';else if(q.method==='eth_blockNumber')value='0x82';else if(q.method==='eth_getBlockByNumber'){assert.equal(q.params[0],'0x6e');value={number:'0x6e',hash:h(110),timestamp:'0x6a000000',transactions:[]};}else if(q.method==='eth_getCode')value=code;
  else if(q.method==='eth_call'){assert.equal(q.params[1],'0x6e');const address=q.params[0].to,abi=address.toLowerCase()===policy().custody.address?LP_CUSTODY_READ_ABI:LP_READ_ABI,{functionName}=decodeFunctionData({abi,data:q.params[0].data});value=encodeFunctionResult({abi,functionName,result:result(address,functionName)});}else throw Error('Unexpected RPC');res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result:value}));
 }catch{res.statusCode=500;res.end('{}');}});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const before=readFileSync(s.policyPath);child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/project-liquidity-http.mjs','scripts/project-mcp.mjs'],{env:{...envFor(s),FORTUNE_TEST_LP_RPC:`http://127.0.0.1:${server.address().port}`}});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);timer=setTimeout(()=>child.kill(),15000);
  child.stdin.end([init,initialized,req(2,'tools/list'),req(3,'tools/call',{name:'get_liquidity_custody'}),req(4,'resources/read',{uri})].map(JSON.stringify).join('\n')+'\n');const [status]=await once(child,'exit');assert.equal(status,0,err);const replies=out.trim().split('\n').map(JSON.parse);assert.equal(replies[1].result.tools.length,3);
  const one=JSON.parse(replies[2].result.content[0].text),two=JSON.parse(replies[3].result.contents[0].text);assert.equal(one.custody.held,true);assert.equal(two.custody.position.liquidityUnits,'123');assert.equal(two.custody.position.owner,policy().custody.address);assert.equal(two.projectCustodyVerified,false);assert.equal(two.custody.capitalOriginVerified,false);assert.equal(two.custody.independentProvidersVerified,false);assert.equal(two.executionAuthorized,false);assert.ok(calls>80);assert.deepEqual(readFileSync(s.policyPath),before);assert.doesNotMatch(out,/lp-one|policy.json|codeHash/);
 }finally{clearTimeout(timer);child?.kill();server.closeAllConnections();await new Promise(r=>server.close(r));s.cleanup();}
});
test('CLI disclosure/provider gates and FIFO preflight reject privately; disabled discovery stays unchanged',()=>{
 const s=setup();try{
  for(const patch of [{FORTUNE_PROJECT_LP_CUSTODY_DISCLOSURE_REVIEWED:''},{FORTUNE_LP_READ_RPC_URL:'http://one.invalid'},{FORTUNE_LP_READ_RPC_URL:'https://same.invalid/a',FORTUNE_LP_SECONDARY_RPC_URL:'https://same.invalid/b'},{FORTUNE_LP_READ_RPC_URL:'https://user:secret@one.invalid'},{FORTUNE_PROJECT_LP_CUSTODY_POLICY:join(s.dir,'missing')}]){const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/project-mcp.mjs'],{env:{...envFor(s),...patch},input:'',encoding:'utf8',timeout:3000});assert.equal(r.error,undefined);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.doesNotMatch(r.stderr,/secret|one.invalid|policy.json|missing/);}
  if(process.platform==='linux'){const fifo=join(s.dir,'fifo');assert.equal(spawnSync('mkfifo',[fifo]).status,0);const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/project-mcp.mjs'],{env:{...envFor(s),FORTUNE_PROJECT_LP_CUSTODY_POLICY:fifo},input:'',encoding:'utf8',timeout:3000});assert.equal(r.error,undefined);assert.equal(r.status,1);}
  const r=spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/project-mcp.mjs'],{env:{...envFor(s),FORTUNE_PROJECT_LP_CUSTODY_READ_ENABLED:'',FORTUNE_PROJECT_LP_CUSTODY_POLICY:'/private/missing'},input:[init,initialized,req(2,'tools/list')].map(JSON.stringify).join('\n')+'\n',encoding:'utf8',timeout:3000});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout.trim().split('\n')[1]).result.tools.length,2);
 }finally{s.cleanup();}
});

test('actual MCP custody timeout fences late RPC completion under the unchanged30sec engine budget',{timeout:40000},async()=>{
 const s=setup();let release,follow=0;try{
  const c=clients();c[1].getBlockNumber=()=>new Promise(r=>release=r);c[1].getChainId=async()=>{follow++;return 97;};
  const f=await ready({readCustody:projectLiquidityCustodyReader(s,c,options)}),start=Date.now();
  const r=await f(req(2,'tools/call',{name:'get_liquidity_custody'}));assert.equal(r.result.isError,true);assert.ok(Date.now()-start>=29000);
  release(130n);await new Promise(r=>setImmediate(r));assert.equal(follow,0);assert.doesNotMatch(JSON.stringify(r),/policy.json|lp-one|PRIVATE/);
 }finally{s.cleanup();}
});
