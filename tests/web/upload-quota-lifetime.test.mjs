import test from 'node:test';import assert from 'node:assert/strict';
import {reserveUpload} from '../../lib/image-upload.ts';
const address='0x'+'11'.repeat(20),proof='a'.repeat(64),encoder=new TextEncoder();
const reject503=e=>e.status===503&&!/secret|upstream/.test(e.message);
const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('old unbounded reservation')),6200);})]);}finally{clearTimeout(timer);}};
test('upload quota rejects an abort-ignoring fetch within its real five-second lifetime',{timeout:8000},async()=>{
 let release,read=0;const pending=reserveUpload(address,proof,()=>new Promise(r=>release=r));
 await assert.rejects(bounded(pending),reject503);release({ok:true,json:async()=>{read++;return {result:'allowed'};}});await new Promise(r=>setImmediate(r));assert.equal(read,0);
});
test('upload quota bounds hung body and non-cooperating cancellation',{timeout:8000},async()=>{
 let cancelled=0;const response=new Response(new ReadableStream({pull:()=>new Promise(()=>{}),cancel(){cancelled++;return new Promise(()=>{});}}));
 await assert.rejects(bounded(reserveUpload(address,proof,async()=>response)),reject503);assert.equal(cancelled,1);
});
test('upload quota bounds actual/declared bytes, strict UTF8 and all fragments',async()=>{
 for(const response of [new Response(JSON.stringify({result:'allowed',extra:'x'.repeat(4096)})),new Response('{"result":"allowed"}',{headers:{'content-length':'4097'}}),new Response(new Uint8Array([0xff])),new Response('null'),new Response('{')])await assert.rejects(reserveUpload(address,proof,async()=>response),reject503);
 let n=0;const stream=new ReadableStream({pull(c){if(n++<4097)c.enqueue(new Uint8Array());else{c.enqueue(encoder.encode('{"result":"allowed"}'));c.close();}}});await assert.rejects(reserveUpload(address,proof,async()=>new Response(stream)),reject503);
});
test('upload quota preserves POST Lua keys, explicit outcomes and one request only',async()=>{
 for(const [result,status]of [['allowed',null],['replay',409],['limited',429],['foreign',503]]){let calls=0;const p=reserveUpload(address,proof,async(_url,options)=>{calls++;assert.equal(options.method,'POST');assert.equal(options.redirect,'error');const [op,lua,count,...keys]=JSON.parse(options.body);assert.equal(op,'EVAL');assert.equal(count,'3');assert.match(lua,/>= 10/);assert.match(lua,/>= 250/);assert.equal(keys[0],'fortune:upload:proof:'+proof);assert.ok(keys[1].includes(address));return new Response(JSON.stringify({result}));});if(status)await assert.rejects(p,e=>e.status===status);else await p;assert.equal(calls,1);}
});
test('upload quota rejects intermediate unsafe or reversed host clocks',async()=>{
 const original=Date.now;let now=original();Date.now=()=>now;try{for(const bad of [-1,NaN,Infinity,now-1]){now=original();await assert.rejects(reserveUpload(address,proof,async()=>{now=bad;return new Response('{"result":"allowed"}');}),reject503);}}finally{Date.now=original;}
});

test('actual local HTTP quota roundtrip preserves serialized EVAL request without credentials or signing',async()=>{
 const {createServer}=await import('node:http');let calls=0;
 const server=createServer(async(req,res)=>{calls++;assert.equal(req.method,'POST');assert.equal(req.headers.authorization,undefined);let body='';for await(const chunk of req)body+=chunk;const q=JSON.parse(body);assert.equal(q[0],'EVAL');assert.equal(q.length,6);res.setHeader('content-type','application/json');res.end('{"result":"allowed"}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await reserveUpload(address,proof,(_url,options)=>fetch('http://127.0.0.1:'+server.address().port,{method:options.method,body:options.body,signal:options.signal}));assert.equal(calls,1);}finally{await new Promise(r=>server.close(r));}
});
