import test from 'node:test';
import assert from 'node:assert/strict';
import {readLimitedBytes} from '../../lib/creator-metadata.ts';
import {handleImageUpload} from '../../lib/image-upload.ts';
const bounded=async(p,ms)=>{let t;try{return await Promise.race([p,new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('old unbounded body')),ms);})]);}finally{clearTimeout(t);}};
test('body reader rejects an ignored stalled read within its real ten-second lifetime',{timeout:13000},async()=>{
 let cancels=0;const response=new Response(new ReadableStream({pull:()=>new Promise(()=>{}),cancel(){cancels++;return new Promise(()=>{});}}));
 await assert.rejects(bounded(readLimitedBytes(response,32),11500),/Body read unavailable/);assert.equal(cancels,1);
});
test('size rejection never awaits non-cooperating cancellation',async()=>{
 const response=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(4));},cancel(){return new Promise(()=>{});}}));
 await assert.rejects(bounded(readLimitedBytes(response,3),1500),/size/);
});
test('empty and tiny nonfinal fragments are bounded independently of byte caps',async()=>{
 for(const empty of [true,false]){let n=0;const response=new Response(new ReadableStream({pull(c){if(n++<4097)c.enqueue(new Uint8Array(empty?0:1));else c.close();}}));await assert.rejects(readLimitedBytes(response,8192),/fragment/);}
});
test('body clock reversal and unsafe clocks reject without returning bytes',async()=>{
 const original=Date.now;try{for(const value of [999,NaN,Infinity,-1,Number.MAX_SAFE_INTEGER+1]){let now=1000;Date.now=()=>now;const response=new Response(new ReadableStream({pull(c){now=value;c.enqueue(new Uint8Array([1]));c.close();}}));await assert.rejects(readLimitedBytes(response,3),/Body read unavailable/);}}finally{Date.now=original;}
});
test('body byte ceilings, declared lengths and fragmented controls are preserved',async()=>{
 assert.deepEqual(await readLimitedBytes(new Response(new Uint8Array([1,2,3])),3),new Uint8Array([1,2,3]));
 for(const r of [new Response('four'),new Response('x',{headers:{'content-length':'4'}}),new Response('x',{headers:{'content-length':'bad'}})])await assert.rejects(readLimitedBytes(r,3),/size/);
 let n=0;assert.equal((await readLimitedBytes(new Response(new ReadableStream({pull(c){if(n++<4096)c.enqueue(new Uint8Array([1]));else c.close();}})),4096)).length,4096);
});
test('actual upload rejects a stalled over-limit body before wallet, quota or storage work',async()=>{
 const keys=['FORTUNE_UPLOADS_ENABLED','PINATA_JWT','UPSTASH_REDIS_REST_TOKEN','UPSTASH_REDIS_REST_URL'];const prior=keys.map(k=>process.env[k]);let calls=0;
 try{Object.assign(process.env,{FORTUNE_UPLOADS_ENABLED:'true',PINATA_JWT:'fixture-unused',UPSTASH_REDIS_REST_TOKEN:'fixture-unused',UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io'});
 const request=new Request('https://fortunepad.fun/api/images/upload',{method:'POST',headers:{origin:'https://fortunepad.fun','content-type':'multipart/form-data; boundary=fixture'},duplex:'half',body:new ReadableStream({start(c){c.enqueue(new Uint8Array(2*1024*1024+8193));},cancel(){return new Promise(()=>{});}})});
 await assert.rejects(bounded(handleImageUpload(request,async()=>{calls++;throw Error('unexpected provider');}),1500),e=>e.status===400&&/malformed/.test(e.message));assert.equal(calls,0);
 }finally{keys.forEach((k,i)=>{if(prior[i]===undefined)delete process.env[k];else process.env[k]=prior[i];});}
});
