import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readProjectApi } from '../../lib/project-api-read.ts';
const bytes=new TextEncoder().encode('{"ok":true}');
function source(count, tiny=false){
 let reads=0,cancelled=0;
 const body=new ReadableStream({pull(c){reads++;if(reads<=count)c.enqueue(tiny?new Uint8Array([32]):new Uint8Array());else if(reads===count+1)c.enqueue(bytes);else c.close();},cancel(){cancelled++;}},{highWaterMark:0});
 return {fetch:async()=>new Response(body,{headers:{'content-type':'application/json'}}),counts:()=>({reads,cancelled})};
}
for(const tiny of [false,true])test(`excess ${tiny?'tiny':'empty'} chunks fail before projection despite staying within the byte limit`,async()=>{
 const s=source(4097,tiny);let projected=false;
 await assert.rejects(readProjectApi('https://fortunepad.fun/example',10000,s,v=>{projected=true;return v;}),/chunk/i);
 assert.equal(projected,false);assert.equal(s.counts().reads,4097);assert.equal(s.counts().cancelled,1);
});
test('the exact chunk boundary permits empty chunks and valid JSON without changing projection',async()=>{
 const s=source(4095);assert.deepEqual(await readProjectApi('https://fortunepad.fun/example',10000,s,v=>v),{ok:true});assert.equal(s.counts().reads,4097);
});
test('a real HTTP JSON response still traverses the actual bounded reader',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.write('{"ok":');res.end('true}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{assert.deepEqual(await readProjectApi(`http://127.0.0.1:${server.address().port}/`,10000,{},v=>v),{ok:true});}
 finally{await new Promise(r=>server.close(r));}
});
