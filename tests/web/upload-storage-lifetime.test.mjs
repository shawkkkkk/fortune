import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {pinAndVerifyTokenImage,normalizeTokenImage} from '../../lib/image-upload.ts';import sharp from 'sharp';
const cid='bafy'+'a'.repeat(55),bytes=new Uint8Array([1,2,3]),enc=new TextEncoder();
const unavailable=e=>e.status===503&&!/secret|provider detail/.test(e.message);
const bounded=async(p,ms)=>{let t;try{return await Promise.race([p,new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('old unbounded storage')),ms);})]);}finally{clearTimeout(t);}};
const ok=()=>new Response(JSON.stringify({IpfsHash:cid}));
test('storage pin fetch has real20sec lifetime and fences late retrieval',{timeout:24000},async()=>{
 let release,calls=0;const p=pinAndVerifyTokenImage(bytes,()=>{calls++;return new Promise(r=>release=r);});await assert.rejects(bounded(p,21500),unavailable);release(ok());await new Promise(r=>setImmediate(r));assert.equal(calls,1);
});
test('storage retrieval bounds hung read and non-cooperating cancellation at10sec',{timeout:14000},async()=>{
 let calls=0,cancel=0;const fetcher=async()=>++calls===1?ok():new Response(new ReadableStream({pull:()=>new Promise(()=>{}),cancel(){cancel++;return new Promise(()=>{});}}));await assert.rejects(bounded(pinAndVerifyTokenImage(bytes,fetcher),11500),unavailable);assert.equal(calls,2);assert.equal(cancel,1);
});
test('storage pin response rejects UTF8 corruption and excess fragments without retrieval',async()=>{
 for(const type of ['utf8','empty']){let calls=0,n=0;const response=type==='utf8'?new Response(new Uint8Array([...enc.encode('{"IpfsHash":"'+cid+'","extra":"'),255,...enc.encode('"}')])):new Response(new ReadableStream({pull(c){if(n++<4097)c.enqueue(new Uint8Array());else{c.enqueue(enc.encode(JSON.stringify({IpfsHash:cid})));c.close();}}}));await assert.rejects(pinAndVerifyTokenImage(bytes,async()=>++calls===1?response:new Response(bytes)),unavailable);assert.equal(calls,1);}
});
test('storage clocks and returned CID, bytes, status and private errors fail closed',async()=>{
 for(const f of [async()=>new Response('x',{status:500}),async()=>new Response('{"IpfsHash":"bad"}'),async()=>{throw Error('secret provider detail');}])await assert.rejects(pinAndVerifyTokenImage(bytes,f),unavailable);
 let calls=0;await assert.rejects(pinAndVerifyTokenImage(bytes,async()=>++calls===1?ok():new Response('wrong')),unavailable);
 const original=Date.now;let now=original();Date.now=()=>now;try{await assert.rejects(pinAndVerifyTokenImage(bytes,async()=>{now--;return ok();}),unavailable);}finally{Date.now=original;}
});
test('actual Sharp to fixed-provider POST to HTTP retrieval returns exact normalized digest with no credentials sent locally',async()=>{
 const input=await sharp({create:{width:8,height:8,channels:4,background:'red'}}).png().toBuffer();const normalized=await normalizeTokenImage(input,'image/png');const {createServer}=await import('node:http');let calls=0,uploaded;
 const server=createServer(async(req,res)=>{assert.equal(req.headers.authorization,undefined);if(req.method==='POST'){const chunks=[];for await(const chunk of req)chunks.push(chunk);const f=await new Response(Buffer.concat(chunks),{headers:{'content-type':req.headers['content-type']}}).formData();uploaded=new Uint8Array(await f.get('file').arrayBuffer());assert.deepEqual(uploaded,new Uint8Array(normalized));res.end(JSON.stringify({IpfsHash:cid}));}else{assert.equal(req.url,'/ipfs/'+cid);res.end(uploaded);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const result=await pinAndVerifyTokenImage(normalized,(url,options)=>{calls++;assert.equal(url,calls===1?'https://api.pinata.cloud/pinning/pinFileToIPFS':'https://gateway.pinata.cloud/ipfs/'+cid);assert.equal(options.redirect,'error');return fetch('http://127.0.0.1:'+server.address().port+(calls===1?'/pin':'/ipfs/'+cid),{method:options.method,body:options.body,signal:options.signal});});assert.equal(calls,2);assert.deepEqual(result,{uri:'ipfs://'+cid,contentType:'image/webp',bytes:normalized.length,sha256:createHash('sha256').update(normalized).digest('hex')});}finally{await new Promise(r=>server.close(r));}
});
test('storage preserves pin and retrieval declared/actual byte ceilings',async()=>{
 for(const stage of ['pin','retrieval'])for(const declared of [false,true]){let calls=0;const limit=stage==='pin'?8192:2*1024*1024;await assert.rejects(pinAndVerifyTokenImage(bytes,async()=>{calls++;if(stage==='retrieval'&&calls===1)return ok();return declared?new Response('x',{headers:{'content-length':String(limit+1)}}):new Response(new Uint8Array(limit+1));}),unavailable);assert.equal(calls,stage==='pin'?1:2);}
});
