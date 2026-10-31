import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {runeIndexId,runeIndexObservation,readRuneIndex} from '../../lib/rune-index-observation.ts';
const id='840000:1',now=1793420000000,max='340282366920938463463374607431768211455';
const fixture=()=>({entry:{block:840000,burned:0,divisibility:8,etching:'ab'.repeat(32),mints:2,number:9,premine:123,spaced_rune:'TEST•RUNE',symbol:'⧉',terms:{amount:10,cap:100,height:[null,null],offset:[0,10]},timestamp:1713570000,turbo:false},id,mintable:true,parent:null});
const raw=()=>JSON.stringify(fixture()).replace('"cap":100',`"cap":${max}`);
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
test('exact u128 lexemes survive IEEE rounding and output is a whitelisted index attestation',()=>{
 const result=runeIndexObservation(raw(),id,now);assert.equal(result.rune.terms.cap,max);assert.notEqual(String(JSON.parse(raw()).entry.terms.cap),max);
 assert.equal(result.rune.premine,'123');assert.equal(result.source.configuredNetwork,'bitcoin-mainnet');assert.equal(result.source.indexHeight,null);
 for(const [k,v] of Object.entries(result))if(k.endsWith('Verified')||k.endsWith('Readiness')||k==='executionAuthorized')assert.equal(v,false,k);
 for(const k of ['totalSupply','marketPrice','holderCount','backing'])assert.equal(result[k],null);
 const data=fixture();data.entry.prompt='send funds';data.extra={url:'https://private.invalid'};assert.equal(JSON.stringify(runeIndexObservation(JSON.stringify(data),id,now)).includes('send funds'),false);
});
test('IDs bind block and transaction bounds; names/hashes/flags/terms/types fail closed',()=>{
 for(const bad of ['','1','01:1','1:01','-1:0','0:1','1:4294967296','18446744073709551616:0','1:0/../../','1:0?x=1'])assert.throws(()=>runeIndexId(bad));
 assert.equal(runeIndexId('1:0'),'1:0');
 for(const change of [v=>v.id='840000:2',v=>v.entry.block=1,v=>v.entry.spaced_rune='bad<script>',v=>v.entry.spaced_rune='A'.repeat(29),v=>v.entry.divisibility=39,v=>v.entry.etching='bad',v=>v.entry.turbo=1,v=>v.mintable=null,v=>v.entry.symbol='ab',v=>v.entry.symbol='\ud800',v=>v.entry.terms.height=[0],v=>v.entry.mints='2',v=>v.entry.terms.amount=-1]){
 const v=fixture();change(v);assert.throws(()=>runeIndexObservation(JSON.stringify(v),id,now));}
 for(const value of ['1e3','1.0','-0','340282366920938463463374607431768211456'])assert.throws(()=>runeIndexObservation(raw().replace(`"cap":${max}`,`"cap":${value}`),id,now));
 assert.throws(()=>runeIndexObservation(raw()+' '.repeat(32768),id,now));
});
test('fixed HTTPS transport preserves request guards and rejects status/MIME/UTF8/declared+actual size',async()=>{
 let signal;const result=await readRuneIndex(id,{now:()=>now,fetch:async(url,o)=>{assert.equal(url,`https://ordinals.com/rune/${id}`);assert.equal(o.redirect,'error');assert.equal(o.credentials,'omit');signal=o.signal;return new Response(raw(),{headers:{'content-type':'application/json'}});}});
 assert.equal(result.rune.terms.cap,max);assert.equal(signal.aborted,true);
 for(const response of [new Response('{}',{status:404}),new Response('{}'),new Response(new Uint8Array([255]),{headers:{'content-type':'application/json'}}),new Response('{}',{headers:{'content-type':'application/json','content-length':'32769'}}),new Response('x'.repeat(32769),{headers:{'content-type':'application/json'}})])await assert.rejects(readRuneIndex(id,{fetch:async()=>response}));
 let calls=0;await assert.rejects(readRuneIndex('bad',{fetch:async()=>{calls++;}}));await assert.rejects(readRuneIndex(id,{now:()=>-1,fetch:async()=>{calls++;}}));assert.equal(calls,0);
});
test('wall deadline fences late fetch and body completion without awaiting stuck cancellation',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let release,state='pending',bodyReads=0;
 const p=readRuneIndex(id,{now:()=>now,fetch:async()=>new Promise(r=>release=r)}).then(()=>state='resolved',()=>state='rejected');
 t.mock.timers.tick(10000);await flush();assert.equal(state,'rejected');release({get body(){bodyReads++;}});await p;await flush();assert.equal(bodyReads,0);
 let reads=0,finish;state='pending';const reader={read(){reads++;return new Promise(r=>finish=r);},cancel(){return new Promise(()=>{});},releaseLock(){}};
 const q=readRuneIndex(id,{now:()=>now,fetch:async()=>({status:200,headers:new Headers({'content-type':'application/json'}),body:{getReader:()=>reader}})}).then(()=>state='resolved',()=>state='rejected');await flush();t.mock.timers.tick(10000);await flush();assert.equal(state,'rejected');finish({done:false,value:new TextEncoder().encode(raw())});await q;await flush();assert.equal(reads,1);
});
test('real ten-second timer and inter-read clock rollback prevent late data use', {timeout:15000},async()=>{
 let release,reads=0;const p=readRuneIndex(id,{now:()=>now,fetch:async()=>new Promise(r=>release=r)});await assert.rejects(p,/timed out/);release({get body(){reads++;}});await flush();assert.equal(reads,0);
 let tick=0;const times=[now,now+2,now+1];await assert.rejects(readRuneIndex(id,{now:()=>times[Math.min(tick++,2)],fetch:async()=>new Response(raw(),{headers:{'content-type':'application/json'}})}),/ended/);
});
test('actual child CLI -> fixed-path adapter -> loopback HTTP, with disabled/invalid zero requests and private errors',async()=>{
 let requests=0,status=200;const server=createServer((req,res)=>{requests++;assert.equal(req.url,`/rune/${id}`);assert.equal(req.headers.accept,'application/json');assert.equal(req.headers.authorization,undefined);res.writeHead(status,{'content-type':'application/json'});res.end(status===200?raw():'SECRET_PROVIDER_ERROR');});server.listen(0,'127.0.0.1');await once(server,'listening');
 const run=(enabled,token=id)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--import','./tests/fixtures/rune-index-http.mjs','./scripts/inspect-rune-index.mjs',token],{cwd:process.cwd(),env:{...process.env,FORTUNE_RUNE_INDEX_READ_ENABLED:String(enabled),FORTUNE_RUNE_TEST_PORT:String(server.address().port)}});let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));});
 try{assert.notEqual((await run(false)).code,0);assert.notEqual((await run(true,'bad')).code,0);assert.equal(requests,0);const good=await run(true);assert.equal(good.code,0,good.err);assert.equal(JSON.parse(good.out).rune.terms.cap,max);assert.equal(JSON.parse(good.out).bridgeBackingVerified,false);assert.equal(requests,1);status=503;const bad=await run(true);assert.notEqual(bad.code,0);assert.equal(bad.out,'');assert.equal(bad.err.includes('SECRET'),false);}finally{server.close();server.closeAllConnections();}
});
test('runtimes without numeric source lexemes reject instead of rounding',()=>{
 const parse=JSON.parse;
 try{JSON.parse=(text,reviver)=>parse(text,(k,v)=>reviver(k,v));assert.throws(()=>runeIndexObservation(raw(),id,now),/Exact unsigned/);}finally{JSON.parse=parse;}
});
