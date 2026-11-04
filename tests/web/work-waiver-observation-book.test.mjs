import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync,chmodSync,symlinkSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {once} from 'node:events';import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {keccak256,decodeFunctionData,encodeFunctionResult,parseAbi,encodeFunctionData,createPublicClient,http} from 'viem';
import {WORK_ESCROW_READ_ABI} from '../../lib/work-escrow-observation.ts';
import {WorkBatchObservationBook as PaymentBook} from '../../scripts/work-batch-observation-book.mjs';
import {WorkWaiverObservationBook as Book} from '../../scripts/work-waiver-observation-book.mjs';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0');
const code='0x60006000f3',pin=keccak256(code),abi=[...WORK_ESCROW_READ_ABI,...parseAbi(['function balanceOf(address) view returns(uint256)'])];
const singlePolicy=()=>({chainId:97,escrow:a(1),escrowCodeHash:pin,governor:a(2),guardian:a(3),arbitrator:a(4),jobId:'1',client:a(5),worker:a(6),asset:a(7),assetCodeHash:pin,maxPerJob:'10000',amount:'100',termsHash:h(1),transactionHash:h(9)});
const waivers=(count=2)=>Array.from({length:count},(_,i)=>i+1).map(id=>({id:String(id),expectedRevision:String(id%3)}));
const policy=(count=2)=>Array.from({length:count},(_,i)=>i+1).map(id=>({...singlePolicy(),jobId:String(id),worker:a(6),client:a(id+20),asset:a(id%2+7),amount:String(id*100),termsHash:h(id),waivers:waivers(count)}));
const batchAbi=parseAbi(['function waivePaymentsMany((uint256 id,uint256 expectedRevision)[] waivers)']);
async function rpcFixture(fn){
 const dir=mkdtempSync(join(tmpdir(),'fortune-work-cli-')),path=join(dir,'private-policy.json');writeFileSync(path,JSON.stringify(policy()));
 const timestamp=BigInt(Math.floor(Date.now()/1000)-60);let calls=0,mode='ok',count=2,txHash=h(9),blockHash=h(80),jobStart=1;
 const server=createServer(async(req,res)=>{try{let body='';for await(const c of req)body+=c;const q=JSON.parse(body);calls++;
  if(mode==='changed'){writeFileSync(path,JSON.stringify(policy())+'\n');mode='ok';}
  if(mode==='provider-error')throw Error('PRIVATE_PROVIDER');let result;
  if(q.method==='eth_chainId')result='0x61';
  else if(q.method==='eth_blockNumber')result='0x64';
  else if(q.method==='eth_getBlockByNumber'){assert.equal(q.params[0],'0x50');result={number:'0x50',hash:blockHash,timestamp:'0x'+timestamp.toString(16),transactions:[txHash]};}
  else if(q.method==='eth_getTransactionReceipt')result={transactionHash:txHash,status:'0x1',blockHash:blockHash,blockNumber:'0x50',transactionIndex:'0x0',from:a(6),to:a(1),gasUsed:'0x100',cumulativeGasUsed:'0x100',effectiveGasPrice:'0x1',logs:Array.from({length:count},(_,i)=>i+jobStart).flatMap(id=>[
   {address:a(id%2+7),topics:[keccak256(new TextEncoder().encode('Transfer(address,address,uint256)')),h(1),h(id+20)],data:h(mode==='unbacked'&&id===2?199:id*100),logIndex:'0x'+(3*id).toString(16)},
   {address:a(1),topics:[keccak256(new TextEncoder().encode('JobSettled(uint256,uint256,uint256,address)')),h(id),h(6)],data:h(0)+h(id*100).slice(2),logIndex:'0x'+(3*id+1).toString(16)},
   {address:a(1),topics:[keccak256(new TextEncoder().encode('PaymentWaived(uint256,address,uint256)')),h(id),h(6)],data:h(id%3),logIndex:'0x'+(3*id+2).toString(16)}]).map(l=>({...l,blockHash:blockHash,blockNumber:'0x50',transactionHash:txHash,transactionIndex:'0x0',removed:false}))};
  else if(q.method==='eth_getTransactionByHash')result={hash:txHash,blockHash:blockHash,blockNumber:'0x50',transactionIndex:'0x0',chainId:'0x61',from:a(6),to:a(1),value:'0x0',input:encodeFunctionData({abi:batchAbi,functionName:'waivePaymentsMany',args:[waivers(count).map(p=>({...p,id:BigInt(p.id)+BigInt(jobStart-1),expectedRevision:BigInt((Number(p.id)+jobStart-1)%3)}))]}),type:'0x0',gas:'0x100',gasPrice:'0x1',nonce:'0x0',v:'0x1b',r:h(1),s:h(1)};
  else if(q.method==='eth_getCode'){assert.equal(q.params[1],'0x50');result=code;}
  else if(q.method==='eth_call'){assert.equal(q.params[1],'0x50');const {functionName,args}=decodeFunctionData({abi,data:q.params[0].data});const id=Number(args?.[0]??1n);const fixed={governor:a(2),guardian:a(3),arbitrator:a(4),paused:mode==='paused',nextJob:2n,jobs:[a(id+20),a(6),a(id%2+7),BigInt(id*100),10n,20n,mode==='foreign'&&id===2?txHash:h(id),4],latestResultRevision:BigInt(id%3),disputedResultRevision:0n,resultHashes:h(id+10),assetCodeHash:pin,maxPerJob:10000n,reserved:mode==='settled'?0n:100n};
   const value=functionName==='balanceOf'?(mode==='unbacked'?99n:100n):fixed[functionName];result=encodeFunctionResult({abi,functionName,result:value});}
  else throw Error('Unexpected write/RPC');res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
 }catch{res.statusCode=500;res.end('PRIVATE_PROVIDER');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const url=`http://127.0.0.1:${server.address().port}`,clients=[0,1].map(()=>createPublicClient({transport:http(url,{retryCount:0,timeout:2000})}));
 try{await fn({dir,path,clients,inputs:()=>policy(count).map(p=>{const id=Number(p.jobId)+jobStart-1;return {...p,jobId:String(id),worker:a(6),client:a(id+20),asset:a(id%2+7),amount:String(id*100),termsHash:h(id),transactionHash:txHash,waivers:waivers(count).map(x=>({...x,id:String(Number(x.id)+jobStart-1),expectedRevision:String((Number(x.id)+jobStart-1)%3)}))};}),calls:()=>calls,mode:v=>mode=v,count:v=>count=v,tx:v=>txHash=h(v),reorg:()=>blockHash=h(81),start:v=>jobStart=v});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
}

const bookPolicy=()=>Object.fromEntries(['chainId','escrow','escrowCodeHash','governor','guardian','arbitrator','worker'].map(k=>[k,singlePolicy()[k]]));
function openBook(f,options={}){const path=join(f.dir,'book.sqlite');if(!existsSync(path))Book.initialize(path,bookPolicy(),{enabled:true,now:options.now?options.now():Date.now()});return {path,b:new Book(path,bookPolicy(),{enabled:true,readOnly:false,...options})};}
function rows(path){const d=new DatabaseSync(path,{readOnly:true});try{return ['waiver_book','waiver_observations','waiver_receipts'].map(t=>d.prepare(`SELECT * FROM ${t} ORDER BY 1`).all());}finally{d.close();}}

test('actual HTTP ABI batch capture persists both assets and stable IDs; reopen and reordered-policy retries never renew records',async()=>rpcFixture(async f=>{
 let {b,path}=openBook(f);try{const head=b.read().head,first=await b.capture(f.clients,f.inputs(),head);assert.equal(first.inserted,true);const view=b.read(),before=rows(path);assert.equal(view.total,1);assert.equal(rows(path)[2].length,2);assert.deepEqual(view.entries[0].observation.refunds.map(p=>p.asset),[a(8),a(7)]);assert.deepEqual(view.entries[0].observation.refunds.map(p=>p.clientRefund),['100','200']);
 for(const key of ['executionAuthorized','fullSyndicateReadiness','partyIdentityVerified','workDeliveryVerified','independentProvidersVerified','globalSolvencyVerified'])assert.equal(view[key],false);assert.equal(view.currentAuthorization,null);
 b.close();b=new Book(path,bookPolicy(),{enabled:true,readOnly:false});const count=f.calls(),reordered=f.inputs().map(p=>Object.fromEntries(Object.entries(p).reverse()));const retry=await b.capture(f.clients,reordered,head);assert.equal(retry.inserted,false);assert.equal(retry.digest,first.digest);assert.equal(retry.recordedAtMs,first.recordedAtMs);assert.equal(retry.readerObservedAtMs,first.readerObservedAtMs);assert.ok(f.calls()>count);assert.deepEqual(rows(path),before);assert.deepEqual(b.read(),view);
 }finally{b.close();}
}));

test('positive changed block observation quarantines permanently without replacing records or receipt IDs',async()=>rpcFixture(async f=>{
 let {b,path}=openBook(f);try{const head=b.read().head;await b.capture(f.clients,f.inputs(),head);const before=rows(path);f.reorg();await assert.rejects(b.capture(f.clients,f.inputs(),head),/conflict quarantined/);assert.equal(b.read().quarantined,true);assert.deepEqual(rows(path).slice(1),before.slice(1));b.close();b=new Book(path,bookPolicy(),{enabled:true,readOnly:false});const calls=f.calls();await assert.rejects(b.capture(f.clients,f.inputs(),head),/quarantined/);assert.equal(f.calls(),calls);assert.equal(b.read().total,1);
 }finally{b.close();}
}));

test('disabled, read-only, foreign and stale-head preflight create nothing and do zero RPC',async()=>rpcFixture(async f=>{
 const missing=join(f.dir,'missing');assert.throws(()=>Book.initialize(missing,bookPolicy()),/disabled/);assert.throws(()=>new Book(missing,bookPolicy()),/disabled/);assert.equal(existsSync(missing),false);assert.throws(()=>Book.initialize('file:memory?mode=memory',bookPolicy(),{enabled:true}),/absolute/i);
 let {b,path}=openBook(f);try{const head=b.read().head,before=rows(path);await assert.rejects(b.capture(f.clients,f.inputs(),h(999).slice(2)),/head/);await assert.rejects(b.capture(f.clients,f.inputs().map(p=>({...p,worker:a(99)})),head),/Foreign/);for(const input of [[],Array(1),f.inputs().map(p=>({...p,extra:'x'.repeat(65536)}))])await assert.rejects(b.capture(f.clients,input,head));let touched=false;const getter={};Object.defineProperty(getter,'chainId',{get(){touched=true;return 97;},enumerable:true});await assert.rejects(b.capture(f.clients,[getter],head));assert.equal(touched,false);assert.equal(f.calls(),0);assert.deepEqual(rows(path),before);
 b.close();b=new Book(path,bookPolicy(),{enabled:true});await assert.rejects(b.capture(f.clients,f.inputs(),head),/read-only/);assert.equal(f.calls(),0);
 }finally{b.close();}
}));

test('later job and provider failures never write any observation or receipt index',async()=>rpcFixture(async f=>{
 const {b,path}=openBook(f);try{const head=b.read().head,before=rows(path);for(const mode of ['foreign','unbacked','provider-error']){f.mode(mode);await assert.rejects(b.capture(f.clients,f.inputs(),head));assert.deepEqual(rows(path),before);}assert.equal(b.read().quarantined,false);
 }finally{b.close();}
}));

test('metadata-time expiry or clock reversal rolls back all writes, preserving original head for explicit retry',async()=>rpcFixture(async f=>{
 for(const value of [6000,-6000,NaN]){let delta=0,touched=false;const {b,path}=openBook(f,{now:()=>Date.now()+delta});const old=DatabaseSync.prototype.prepare;try{const head=b.read().head,before=rows(path);DatabaseSync.prototype.prepare=function(sql){const statement=old.call(this,sql);if(!sql.startsWith('UPDATE waiver_book SET last_clock='))return statement;return new Proxy(statement,{get(t,k){const v=Reflect.get(t,k,t);if(k==='run')return(...a)=>{const out=v.apply(t,a);touched=true;delta=value;return out;};return typeof v==='function'?v.bind(t):v;}});};await assert.rejects(b.capture(f.clients,f.inputs(),head),/clock|expired/);assert.equal(touched,true);DatabaseSync.prototype.prepare=old;assert.deepEqual(rows(path),before);delta=0;assert.equal((await b.capture(f.clients,f.inputs(),head)).inserted,true);
 }finally{DatabaseSync.prototype.prepare=old;b.close();rmSync(path);rmSync(path+'-wal',{force:true});rmSync(path+'-shm',{force:true});}}
}));

test('two handles racing the same actual receipt insert one batch and retain one durable index',async()=>rpcFixture(async f=>{
 const {b,path}=openBook(f),other=new Book(path,bookPolicy(),{enabled:true,readOnly:false});try{const head=b.read().head;const results=await Promise.all([b.capture(f.clients,f.inputs(),head),other.capture(f.clients,f.inputs(),head)]);assert.deepEqual(results.map(r=>r.inserted).sort(),[false,true]);assert.equal(b.read().total,1);assert.equal(rows(path)[2].length,2);
 }finally{b.close();other.close();}
}));

test('protected files reject aliases and loose permissions without repair',async()=>rpcFixture(async f=>{
 const {b,path}=openBook(f);b.close();const alias=join(f.dir,'alias');symlinkSync(path,alias);assert.throws(()=>new Book(alias,bookPolicy(),{enabled:true}));rmSync(alias);linkSync(path,alias);assert.throws(()=>new Book(path,bookPolicy(),{enabled:true}));rmSync(alias);chmodSync(path,0o644);assert.throws(()=>new Book(path,bookPolicy(),{enabled:true}));chmodSync(path,0o600);assert.throws(()=>new Book(path,{...bookPolicy(),worker:a(99)},{enabled:true}));
}));
test('schema, hash history and receipt index corruption fail closed without repair',async()=>{
 for(const sql of ['UPDATE waiver_book SET version=2',"UPDATE waiver_observations SET digest='broken'",'DELETE FROM waiver_receipts','CREATE TABLE foreign_data(value TEXT)'])await rpcFixture(async f=>{const {b,path}=openBook(f);await b.capture(f.clients,f.inputs(),b.read().head);b.close();const d=new DatabaseSync(path);try{d.exec(sql);}finally{d.close();}const before=rows(path);assert.throws(()=>new Book(path,bookPolicy(),{enabled:true}));assert.deepEqual(rows(path),before);});
});
test('same job in a different positive transaction quarantines instead of consuming it twice',async()=>rpcFixture(async f=>{
 const {b,path}=openBook(f);try{await b.capture(f.clients,f.inputs(),b.read().head);const before=rows(path);f.tx(10);await assert.rejects(b.capture(f.clients,f.inputs(),b.read().head),/job conflict quarantined/);assert.equal(b.read().quarantined,true);assert.deepEqual(rows(path).slice(1),before.slice(1));}finally{b.close();}
}));
test('one and sixteen actual HTTP ABI jobs fit bounded documents and preserve every distinct receipt ID',async()=>{
 for(const count of [1,16])await rpcFixture(async f=>{f.count(count);const {b,path}=openBook(f);try{await b.capture(f.clients,f.inputs(),b.read().head);assert.equal(b.read().entries[0].observation.refunds.length,count);assert.equal(rows(path)[2].length,count);}finally{b.close();}});
});

test('64-batch capacity never prunes or makes RPC for a new batch; original retry remains available',async()=>rpcFixture(async f=>{
 f.count(1);const {b,path}=openBook(f);try{const initial=b.read().head;for(let n=1;n<=64;n++){f.tx(100+n);f.start(n);await b.capture(f.clients,f.inputs(),b.read().head);}assert.equal(b.read().total,64);assert.equal(rows(path)[2].length,64);const before=rows(path),calls=f.calls();f.tx(165);f.start(65);await assert.rejects(b.capture(f.clients,f.inputs(),b.read().head),/capacity/);assert.equal(f.calls(),calls);assert.deepEqual(rows(path),before);f.tx(101);f.start(1);const r=await b.capture(f.clients,f.inputs(),initial);assert.equal(r.inserted,false);assert.equal(r.sequence,1);assert.deepEqual(rows(path),before);
 }finally{b.close();}
}));

test('capture clock covers the read-only preflight without restarting its monotonic sequence',async()=>rpcFixture(async f=>{
 const base=Date.now()+1000;let samples=[base],i=0;const path=join(f.dir,'clock.sqlite');Book.initialize(path,bookPolicy(),{enabled:true,now:base-100});const b=new Book(path,bookPolicy(),{enabled:true,readOnly:false,now:()=>samples[Math.min(i++,samples.length-1)]});
 try{const head=b.read().head,before=rows(path);samples=[base,base+20,base+15,base+30];i=0;await assert.rejects(b.capture(f.clients,f.inputs(),head),/clock/);assert.equal(f.calls(),0);assert.deepEqual(rows(path),before);}finally{b.close();}
}));

test('waiver books reject result-payment schemas and preserve original client/refund revisions',async()=>rpcFixture(async f=>{
 const oldPath=join(f.dir,'payment.sqlite'),oldPolicy={...bookPolicy(),client:a(5)};delete oldPolicy.worker;
 PaymentBook.initialize(oldPath,oldPolicy,{enabled:true});const bytes=readFileSync(oldPath);assert.throws(()=>new Book(oldPath,bookPolicy(),{enabled:true}),/schema/);assert.deepEqual(readFileSync(oldPath),bytes);
 const {b,path}=openBook(f);try{await b.capture(f.clients,f.inputs(),b.read().head);const rows=b.read().entries[0].observation.refunds;assert.deepEqual(rows.map(r=>r.client),[a(21),a(22)]);assert.deepEqual(rows.map(r=>r.workerRefund),[{kind:'waiver',revision:'1'},{kind:'waiver',revision:'2'}]);assert.ok(rows.every(r=>r.workerPaid==='0'));assert.throws(()=>new PaymentBook(path,oldPolicy,{enabled:true}),/schema/);}finally{b.close();}
}));
