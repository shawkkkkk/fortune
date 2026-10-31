import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readShareArtwork} from '../../lib/share-artwork-fetch.ts';
const uri='ipfs://QmYwAPJzv5CZsnAzt8auVZRnGiRAom3ZYKhYbG7XdCLnGx/art.png';
const png=new Uint8Array([137,80,78,71,13,10,26,10]);
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
test('artwork real deadline returns fallback and late fetch cannot access body',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let release,bodyReads=0,state='pending';
 const p=readShareArtwork(uri,()=>new Promise(r=>release=r)).then(v=>state=v);
 t.mock.timers.tick(3000);await flush();
 const timed=state;release({get body(){bodyReads++;},headers:new Headers(),ok:false});await p;
 assert.equal(timed,null);assert.equal(bodyReads,0);
});
test('artwork hung stream and stuck rejection cancellation cannot delay fallback or read again',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let release,reads=0,state='pending';
 const reader={read(){reads++;return new Promise(r=>release=r);},cancel(){return new Promise(()=>{});},releaseLock(){}};
 const p=readShareArtwork(uri,async()=>({ok:true,headers:new Headers({'content-type':'image/png'}),body:{getReader:()=>reader}})).then(v=>state=v);
 await flush();t.mock.timers.tick(3000);await flush();const timed=state;release({done:true});await p;
 assert.equal(timed,null);assert.equal(reads,1);
 let invalid='pending';const q=readShareArtwork(uri,async()=>({ok:false,headers:new Headers(),body:{cancel:()=>new Promise(()=>{})}})).then(v=>invalid=v);
 await flush();assert.equal(invalid,null);await q;
});
test('artwork clock rollback rejects even when above initial clock',async t=>{
 let i=0;const times=[10000,10002,10001];t.mock.method(Date,'now',()=>times[Math.min(i++,2)]);
 assert.equal(await readShareArtwork(uri,async()=>new Response(png,{headers:{'content-type':'image/png'}})),null);
});
test('artwork real three-second timer handles noncooperating fetch', {timeout:6000},async()=>{
 let release,reads=0;const p=readShareArtwork(uri,()=>new Promise(r=>release=r));
 assert.equal(await p,null);release({get body(){reads++;}});await flush();assert.equal(reads,0);
});
test('actual HTTP artwork bytes preserve trusted source, guards and raster fallback',async()=>{
 let invalid=false,calls=0;const server=createServer((req,res)=>{calls++;res.writeHead(200,{'content-type':'image/png'});res.end(invalid?'bad':png);});server.listen(0,'127.0.0.1');await once(server,'listening');
 const fetcher=(url,init)=>{assert.equal(url,'https://ipfs.io/ipfs/'+uri.slice(7));assert.equal(init.redirect,'error');return fetch(`http://127.0.0.1:${server.address().port}/art.png`,init);};
 try{assert.equal(await readShareArtwork(uri,fetcher),'data:image/png;base64,'+Buffer.from(png).toString('base64'));invalid=true;assert.equal(await readShareArtwork(uri,fetcher),null);assert.equal(calls,2);}finally{server.close();server.closeAllConnections();}
});
