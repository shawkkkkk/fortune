import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,chmodSync,symlinkSync,linkSync,writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {once} from 'node:events';import {createServer} from 'node:http';import {DatabaseSync} from 'node:sqlite';
import {spawn,spawnSync} from 'node:child_process';
import {keccak256,parseAbi,decodeFunctionData,encodeFunctionData,encodeFunctionResult,createPublicClient,http} from 'viem';
import {CounterClaimObservationBook as Book} from '../../scripts/counter-claim-observation-book.mjs';
const a=n=>'0x'+BigInt(n).toString(16).padStart(40,'0'),h=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),code='0x6000',pin=keccak256(code),sig=s=>keccak256(new TextEncoder().encode(s));
const abi=parseAbi(['function claimMany(uint256[],address)','function governor() view returns(address)','function guardian() view returns(address)','function launchToken() view returns(address)','function assetCodeHash(address) view returns(bytes32)','function rounds(uint256) view returns(address,uint256,uint256,bytes32)','function claimable(uint256,address) view returns(uint256)']);
const policy=()=>({chainId:97,escrow:a(1),escrowCodeHash:pin,governor:a(2),guardian:a(3),launchToken:a(4),launchTokenCodeHash:pin,recipient:a(6)});
async function fixture(fn){
 const dir=mkdtempSync(join(tmpdir(),'fortune-counter-book-'));let calls=0,count=2,start=1,tx=9,bh=80,mode='ok';
 const claims=()=>Array.from({length:count},(_,i)=>({round:String(start+i),asset:a(20+i%2),assetCodeHash:pin,amount:String(start+i+7)}));
 const input=()=>({...policy(),caller:a(7),transactionHash:h(tx),claims:claims()});
 const server=createServer(async(req,res)=>{try{let body='';for await(const c of req)body+=c;const q=JSON.parse(body);calls++;if(mode==='input-changed'){writeFileSync(join(dir,'request.json'),readFileSync(join(dir,'request.json'),'utf8')+'\n');mode='ok';}if(mode==='config-changed'){writeFileSync(join(dir,'config.json'),readFileSync(join(dir,'config.json'),'utf8')+'\n');mode='ok';}if(mode==='provider')throw Error('fixture');let result;
  if(q.method==='eth_chainId')result='0x61';else if(q.method==='eth_blockNumber')result='0x64';
  else if(q.method==='eth_getBlockByNumber'){assert.equal(q.params[0],'0x50');result={number:'0x50',hash:h(bh),timestamp:'0x1',transactions:[h(tx)]};}
  else if(q.method==='eth_getCode'){assert.equal(q.params[1],'0x50');result=code;}
  else if(q.method==='eth_getTransactionReceipt')result=mode==='missing'?null:{transactionHash:h(tx),status:'0x1',blockHash:h(bh),blockNumber:'0x50',transactionIndex:'0x0',from:a(7),to:a(1),gasUsed:'0x100',cumulativeGasUsed:'0x100',effectiveGasPrice:'0x1',logs:claims().flatMap((c,i)=>[
   {address:c.asset,topics:[sig('Transfer(address,address,uint256)'),h(1),h(6)],data:h(mode==='wrong'&&i===1?999:c.amount),logIndex:'0x'+(4+i*2).toString(16)},
   {address:a(1),topics:[sig('Claimed(uint256,address,address,uint256)'),h(c.round),h(6),h(20+i%2)],data:h(c.amount),logIndex:'0x'+(5+i*2).toString(16)}]).map(l=>({...l,blockHash:h(bh),blockNumber:'0x50',transactionHash:h(tx),transactionIndex:'0x0',removed:false}))};
  else if(q.method==='eth_getTransactionByHash')result={hash:h(tx),blockHash:h(bh),blockNumber:'0x50',transactionIndex:'0x0',chainId:'0x61',from:a(7),to:a(1),value:'0x0',input:encodeFunctionData({abi,functionName:'claimMany',args:[claims().map(c=>BigInt(c.round)),a(6)]}),type:'0x0',gas:'0x100',gasPrice:'0x1',nonce:'0x0',v:'0x1b',r:h(1),s:h(1)};
  else if(q.method==='eth_call'){assert.equal(q.params[1],'0x50');const {functionName,args}=decodeFunctionData({abi,data:q.params[0].data});let value={governor:a(2),guardian:a(3),launchToken:a(4),assetCodeHash:pin,claimable:0n}[functionName];if(functionName==='rounds'){const c=claims().find(c=>c.round===String(args[0]));assert.ok(c);value=[c.asset,1000n,1000n-BigInt(c.amount),h(33)];}result=encodeFunctionResult({abi,functionName,result:value});}
  else throw Error('Unexpected write/RPC');res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
 }catch{res.statusCode=500;res.end('fixture failure');}});server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}`,clients=[0,1].map(()=>createPublicClient({transport:http(url,{timeout:2000,retryCount:0})}));
 try{await fn({dir,url,clients,input,calls:()=>calls,count:v=>count=v,start:v=>start=v,tx:v=>tx=v,reorg:()=>bh++,mode:v=>mode=v});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
}

function setup(f){
 const path=join(f.dir,'claims.sqlite'),configPath=join(f.dir,'config.json'),requestPath=join(f.dir,'request.json');
 Book.initialize(path,policy(),{enabled:true});const read=()=>{const b=new Book(path,policy(),{enabled:true});try{return b.read();}finally{b.close();}};
 const initial=read(),config={bookPath:path,bookId:initial.bookId,policy:policy()},request={input:f.input(),expectedHead:initial.head};
 const reset=()=>{writeFileSync(configPath,JSON.stringify(config));writeFileSync(requestPath,JSON.stringify({...request,input:f.input()}));};reset();
 const env={...process.env,FORTUNE_COUNTER_BOOK_ENABLED:'true',FORTUNE_COUNTER_BOOK_WRITE_ENABLED:'true',FORTUNE_COUNTER_READ_RPC_URL:'https://counter-one.invalid/private-key',FORTUNE_COUNTER_SECONDARY_RPC_URL:'https://counter-two.invalid/private-key',FORTUNE_TEST_COUNTER_OBSERVATION_RPC:f.url};
 async function run(mode='capture',overrides={},args=mode==='read'?['read',configPath]:[mode,configPath,requestPath]){
  const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/counter-observation-http.mjs','scripts/counter-claim-observations.mjs',...args],{env:{...env,...overrides}});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  const timer=setTimeout(()=>child.kill('SIGKILL'),15000);try{const [status]=await once(child,'exit');return {status,out,err};}finally{clearTimeout(timer);}
 }
 return {path,config,request,configPath,requestPath,read,run,reset};
}
const rejected=r=>{assert.equal(r.status,1,r.err);assert.equal(r.out,'');assert.match(r.err,/Counter claim observation book unavailable/);assert.doesNotMatch(r.err,/private-key|counter-one|counter-two|config.json|request.json|fixture failure/);};
test('actual child HTTP/ABI to SQLite capture, offline reads and replay preserve every original time and raw asset unit',async()=>fixture(async f=>{
 const s=setup(f),empty=await s.run('read');assert.equal(empty.status,0,empty.err);assert.equal(JSON.parse(empty.out).observation.total,0);assert.equal(f.calls(),0);
 const first=await s.run();assert.equal(first.status,0,first.err);const result=JSON.parse(first.out).result,saved=s.read();assert.equal(result.inserted,true);assert.equal(saved.total,1);assert.deepEqual(saved.entries[0].observation.claims.map(c=>[c.asset,c.amount]),[[a(20),'8'],[a(21),'9']]);
 const replay=await s.run();assert.equal(replay.status,0,replay.err);assert.deepEqual({...JSON.parse(replay.out).result,inserted:true},result);assert.deepEqual(s.read(),saved);
 const calls=f.calls(),read=await s.run('read',{FORTUNE_COUNTER_READ_RPC_URL:'',FORTUNE_COUNTER_SECONDARY_RPC_URL:''});assert.equal(read.status,0,read.err);assert.equal(f.calls(),calls);assert.deepEqual(JSON.parse(read.out).observation,saved);assert.match(JSON.parse(read.out).configSha256,/^[0-9a-f]{64}$/);
 assert.equal(saved.currentAuthorization,null);for(const k of ['executionAuthorized','fullCounterReadiness','holderEligibilityVerified','feeFundingVerified','capitalOriginVerified','independentProvidersVerified','globalSolvencyVerified'])assert.equal(saved[k],false);assert.equal(saved.totalAmount,undefined);
}));
test('disabled, wrong mode, foreign identity, missing existing book and stale predecessor fail before RPC without initialization',async()=>fixture(async f=>{
 const s=setup(f);rejected(await s.run('capture',{FORTUNE_COUNTER_BOOK_ENABLED:''}));rejected(await s.run('capture',{FORTUNE_COUNTER_BOOK_WRITE_ENABLED:''}));for(const args of [[],['init',s.configPath],['read',s.configPath,s.requestPath],['capture',s.configPath],['capture',s.configPath,s.requestPath,'extra']])rejected(await s.run('capture',{},args));
 for(const config of [{...s.config,bookId:'0'.repeat(64)},{...s.config,bookPath:join(f.dir,'absent')},{...s.config,policy:{...policy(),recipient:a(99)}}]){writeFileSync(s.configPath,JSON.stringify(config));rejected(await s.run());}s.reset();assert.equal(existsSync(join(f.dir,'absent')),false);
 writeFileSync(s.requestPath,JSON.stringify({...s.request,expectedHead:'0'.repeat(64)}));rejected(await s.run());s.reset();writeFileSync(s.requestPath,JSON.stringify({...s.request,input:{...f.input(),recipient:a(99)}}));rejected(await s.run());assert.equal(f.calls(),0);assert.equal(s.read().total,0);
}));
test('all 1/32 receipt entries flow through the actual child reader and durable index',async()=>{for(const count of [1,32])await fixture(async f=>{f.count(count);const s=setup(f),r=await s.run();assert.equal(r.status,0,r.err);const view=s.read();assert.equal(view.entries[0].observation.claims.length,count);assert.equal(new Set(view.entries[0].observation.claims.map(c=>c.evidenceId)).size,count);});});
test('later-claim, missing, provider and changed literal inputs fail without history writes or automatic quarantine',async()=>fixture(async f=>{
 const s=setup(f),initial=s.read();for(const mode of ['wrong','missing','provider','input-changed','config-changed']){s.reset();f.mode(mode);rejected(await s.run());assert.deepEqual(s.read(),initial);}assert.ok(f.calls()>0);
}));
test('positive receipt conflicts persist quarantine across child restarts, leave entries unchanged and block subsequent RPC',async()=>fixture(async f=>{
 const s=setup(f);assert.equal((await s.run()).status,0);const saved=s.read();f.reorg();rejected(await s.run());const blocked=s.read();assert.equal(blocked.quarantined,true);assert.deepEqual(blocked.entries,saved.entries);assert.equal(blocked.head,saved.head);
 const calls=f.calls();rejected(await s.run());assert.equal(f.calls(),calls);const read=await s.run('read');assert.equal(read.status,0,read.err);assert.deepEqual(JSON.parse(read.out).observation,blocked);assert.equal(f.calls(),calls);
}));
test('16/68KiB strict UTF8 literal files, restricted HTTPS origins and nonblocking descriptor checks fail privately before RPC',async()=>fixture(async f=>{
 const s=setup(f);for(const value of [Buffer.from([255]),' '.repeat(16385),JSON.stringify({...s.config,extra:true})]){writeFileSync(s.configPath,value);rejected(await s.run('read'));}s.reset();
 for(const value of [Buffer.from([255]),' '.repeat(69633),JSON.stringify({...s.request,extra:true})]){writeFileSync(s.requestPath,value);rejected(await s.run());}s.reset();
 for(const [one,two]of [['http://a.invalid','https://b.invalid'],['https://same.invalid/a','https://same.invalid/b'],['https://user:private-key@a.invalid','https://b.invalid'],['https://a.invalid/#fragment','https://b.invalid']])rejected(await s.run('capture',{FORTUNE_COUNTER_READ_RPC_URL:one,FORTUNE_COUNTER_SECONDARY_RPC_URL:two}));
 if(process.platform==='linux'){const fifo=join(f.dir,'fifo'),link=join(f.dir,'fifo-link');assert.equal(spawnSync('mkfifo',[fifo]).status,0);symlinkSync(fifo,link);for(const path of [fifo,link,f.dir]){rejected(await s.run('read',{},['read',path]));rejected(await s.run('capture',{},['capture',s.configPath,path]));}}
 assert.equal(f.calls(),0);assert.equal(s.read().total,0);
}));
