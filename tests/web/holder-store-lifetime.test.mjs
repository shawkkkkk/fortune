import test from 'node:test';
import assert from 'node:assert/strict';
import {UpstashStore} from '../../lib/holder-store.ts';
const commands=[['GET','k']];
const store=fetcher=>new UpstashStore('https://fixture.upstash.io','fixture-token',fetcher);
const bytes=new TextEncoder().encode('[{"result":"ok"}]');
function response(read,cancel=async()=>{}){return {ok:true,status:200,headers:new Headers(),body:{getReader:()=>({read,cancel})},json:()=>new Promise(()=>{})};}
const bounded=async operation=>{let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('OUTER deadline exceeded')),11500);})]);}finally{clearTimeout(timer);}};
test('Upstash fetch ignores abort but rejects at real ten-second lifetime',{timeout:12500},async()=>{
 let signal,release,reads=0;await assert.rejects(bounded(store(async(_url,init)=>{signal=init.signal;return new Promise(r=>release=r);}).pipeline(commands)),e=>/Upstash.*(?:timed out|expired)/.test(e.message));assert.equal(signal.aborted,true);release(response(async()=>{reads++;return {done:true};}));await new Promise(r=>setImmediate(r));assert.equal(reads,0);
});
test('Upstash hung body and never-settling cancellation cannot extend the lifetime',{timeout:12500},async()=>{
 let canceled=0;await assert.rejects(bounded(store(async()=>response(()=>new Promise(()=>{}),()=>{canceled++;return new Promise(()=>{});})).pipeline(commands)),e=>/Upstash.*(?:timed out|expired)/.test(e.message));assert.equal(canceled,1);
});
test('Upstash bounds declared/actual bytes, fragments, strict UTF8 and malformed JSON',async()=>{
 for(const mode of ['declared','actual','fragments','utf8','json']){let n=0;const r=response(async()=>mode==='fragments'?{done:false,value:new Uint8Array()}:n++?{done:true}:{done:false,value:mode==='actual'?new Uint8Array(8388609):new Uint8Array(mode==='utf8'?[255]:[123])});if(mode==='declared')r.headers.set('content-length','8388609');await assert.rejects(store(async()=>r).pipeline(commands));}
});
test('Upstash empty pipeline is local and exact fragment boundary preserves results',async()=>{
 let calls=0,n=0,canceled=0;const r=response(async()=>n++<4095?{done:false,value:new Uint8Array()}:n===4096?{done:false,value:bytes}:{done:true},async()=>{canceled++;});r.json=async()=>[{result:'ok'}];const s=store(async()=>{calls++;return r;});assert.deepEqual(await s.pipeline([]),[]);assert.equal(calls,0);assert.deepEqual(await s.pipeline(commands),['ok']);assert.equal(canceled,1);
});
test('Upstash rejects unsafe/backward clocks before follow-on body reads',async()=>{
 const original=Date.now;let now=original(),reads=0;try{Date.now=()=>now;await assert.rejects(store(async()=>{now--;return response(async()=>{reads++;return {done:true};});}).pipeline(commands));assert.equal(reads,0);Date.now=()=>-1;let calls=0;await assert.rejects(store(async()=>{calls++;}).pipeline(commands));assert.equal(calls,0);}finally{Date.now=original;}
});

test('Upstash accepts exact eight MiB response and rejects one additional byte',async()=>{
 const payload=new Uint8Array(8388608);payload.fill(32);payload.set(bytes);let n=0;const r=response(async()=>n++?{done:true}:{done:false,value:payload});r.headers.set('content-length','8388608');assert.deepEqual(await store(async()=>r).pipeline(commands),['ok']);
});
