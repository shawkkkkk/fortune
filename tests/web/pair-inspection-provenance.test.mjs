import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createPublicClient, http, encodeFunctionResult, encodeAbiParameters, parseAbi } from 'viem';
import { inspectPairTokenWithClient } from '../../lib/pair-inspector.ts';
import { PAIR_TOKEN_PROBE_ABI } from '../../lib/custom-pairs-artifacts.ts';
const token='0x1111111111111111111111111111111111111111';
const target='0x2222222222222222222222222222222222222222';
const hash='0x'+'ab'.repeat(32), zero='0x'+'00'.repeat(32);
const block={number:100n,hash,timestamp:1000n};
const leg={attempted:true,ok:true,amount:10n,senderSpent:10n,recipientReceived:10n,revertData:'0x'};
const report=encodeFunctionResult({abi:PAIR_TOKEN_PROBE_ABI,functionName:'run',result:{holderBalance:1000n,seed:leg,payout:leg,pull:leg,toPool:leg}});
const word=n=>encodeAbiParameters([{type:'uint256'}],[n]);
function fixture(change={}) {
  const calls=[];
  const rpc={
    getChainId:async()=>97,
    getBlockNumber:async()=>100n,
    getBlock:async()=>({...block}),
    getCode:async()=> '0x60006000',
    getStorageAt:async()=>zero,
    readContract:async({functionName})=>({name:'Fixture',symbol:'FIX',decimals:18,totalSupply:100000n,owner:'0x'+'00'.repeat(20),getOwner:'0x'+'00'.repeat(20),implementation:target})[functionName],
    createAccessList:async()=>({accessList:[{address:token,storageKeys:[zero]}]}),
    call:async({to})=>({data:to.toLowerCase()===token?word(1000n):report}),
    ...change,
  };
  for(const key of ['getCode','getStorageAt','readContract','createAccessList','call','getBlock']) {
    const original=rpc[key];rpc[key]=async args=>{calls.push({method:key,...args});return original(args);};
  }
  return {rpc,calls};
}
test('pair inspection binds all metadata, storage and simulated transfer reads to a rechecked block/hash',async()=>{
  const {rpc,calls}=fixture();const out=await inspectPairTokenWithClient({address:token,chainId:97},rpc);
  assert.equal(out.verdict,'clear');assert.equal(out.blockNumber,'100');assert.equal(out.blockHash,hash);assert.equal(out.blockTimestamp,'1000');
  assert.equal(out.simulation.buy.ok,true);assert.equal(out.maxTaxBps,0);
  assert.ok(calls.some(c=>c.method==='call'&&c.stateOverride));
  assert.ok(calls.every(c=>c.blockNumber===100n));assert.equal(calls.filter(c=>c.method==='getBlock').length,2);
});
test('pair inspection rejects reorg and chain changes after successful transfer simulation',async()=>{
  let reads=0;let f=fixture({getBlock:async()=>({...block,hash:++reads===1?hash:zero})});
  await assert.rejects(inspectPairTokenWithClient({address:token,chainId:97},f.rpc),/snapshot changed/);
  let chains=0;f=fixture({getChainId:async()=>++chains===1?97:56});
  await assert.rejects(inspectPairTokenWithClient({address:token,chainId:97},f.rpc),/snapshot changed/);
});
test('empty-code results also need a valid and rechecked snapshot',async()=>{
  let reads=0;const f=fixture({getCode:async()=> '0x',getBlock:async()=>({...block,hash:++reads===1?hash:zero})});
  await assert.rejects(inspectPairTokenWithClient({address:token,chainId:97},f.rpc),/snapshot changed/);
  for(const bad of [{...block,hash:null},{...block,hash:zero},{...block,number:101n},{...block,timestamp:-1n}]) {
    await assert.rejects(inspectPairTokenWithClient({address:token,chainId:97},fixture({getBlock:async()=>bad}).rpc));
  }
  const out=await inspectPairTokenWithClient({address:token,chainId:97},fixture({getCode:async()=> '0x'}).rpc);
  assert.equal(out.verdict,'unsupported');assert.equal(out.blockHash,hash);
});
test('unavailable or malformed proxy storage never becomes no proxy detected',async()=>{
  for(const bad of [undefined,'0x','0x01', '0x'+'ff'.repeat(12)+'22'.repeat(20)]) {
    await assert.rejects(inspectPairTokenWithClient({address:token,chainId:97},fixture({getStorageAt:async()=>bad}).rpc),/proxy storage unavailable/);
  }
  await assert.rejects(inspectPairTokenWithClient({address:token,chainId:97},fixture({getStorageAt:async()=>{throw Error('private RPC failure');}}).rpc));
});
test('proxy implementation and beacon reads fail closed; valid implementation selectors remain visible',async()=>{
  const slot='0x'+'00'.repeat(12)+target.slice(2);
  for(const code of [undefined,'0x','0xz1']) {
    const f=fixture({getStorageAt:async()=>slot,getCode:async({address})=>address.toLowerCase()===token?'0x6000':code});
    await assert.rejects(inspectPairTokenWithClient({address:token,chainId:97},f.rpc),/implementation code unavailable/);
  }
  const f=fixture({getStorageAt:async()=>slot,getCode:async({address})=>address.toLowerCase()===token?'0x6000':'0x638456cb59'});
  const out=await inspectPairTokenWithClient({address:token,chainId:97},f.rpc);assert.equal(out.contract.controls.pause,true);assert.equal(out.verdict,'caution');
  const beacon=fixture({getStorageAt:async({slot:s})=>s.startsWith('0xa3f0')?slot:zero,readContract:async({functionName})=>{if(functionName==='implementation')throw Error('offline');return null;}});
  await assert.rejects(inspectPairTokenWithClient({address:token,chainId:97},beacon.rpc));
});
test('malformed token code and unsupported direct chains reject before simulation',async()=>{
  for(const code of [null,'0x0','0xzz','0x'+'aa'.repeat(131073)])await assert.rejects(inspectPairTokenWithClient({address:token,chainId:97},fixture({getCode:async()=>code}).rpc));
  await assert.rejects(inspectPairTokenWithClient({address:token,chainId:1},fixture().rpc),/unsupported chain/);
});
test('real viem HTTP/ABI path preserves pinned block arguments through state-override simulation',async()=>{
  const received=[];
  const abi=parseAbi(['function name() view returns(string)','function symbol() view returns(string)','function decimals() view returns(uint8)','function totalSupply() view returns(uint256)','function owner() view returns(address)','function getOwner() view returns(address)']);
  const selectors={ '0x06fdde03':['name','Fixture'], '0x95d89b41':['symbol','FIX'], '0x313ce567':['decimals',18], '0x18160ddd':['totalSupply',100000n], '0x8da5cb5b':['owner','0x'+'00'.repeat(20)], '0x893d20e8':['getOwner','0x'+'00'.repeat(20)] };
  const server=createServer(async(req,res)=>{try{
    let raw='';for await(const c of req)raw+=c;const q=JSON.parse(raw);received.push(q);
    let result;
    if(q.method==='eth_chainId')result='0x61';
    else if(q.method==='eth_blockNumber')result='0x64';
    else if(q.method==='eth_getBlockByNumber')result={number:'0x64',hash,timestamp:'0x3e8',transactions:[],gasLimit:'0x1c9c380',gasUsed:'0x0',extraData:'0x',nonce:'0x0000000000000000',difficulty:'0x0',size:'0x1'};
    else if(q.method==='eth_getCode')result='0x60006000';
    else if(q.method==='eth_getStorageAt')result=zero;
    else if(q.method==='eth_createAccessList')result={accessList:[{address:token,storageKeys:[zero]}],gasUsed:'0x5208'};
    else if(q.method==='eth_call'){
      const entry=selectors[q.params[0].data];
      result=entry?encodeFunctionResult({abi,functionName:entry[0],result:entry[1]}):q.params[0].to.toLowerCase()===token?word(1000n):report;
    }else throw Error(q.method);
    res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
  }catch{res.statusCode=500;res.end();}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const rpc=createPublicClient({transport:http(`http://127.0.0.1:${server.address().port}`,{retryCount:0})});
    const out=await inspectPairTokenWithClient({address:token,chainId:97},rpc);assert.equal(out.blockHash,hash);assert.equal(out.verdict,'clear');
    for(const q of received.filter(q=>['eth_getCode','eth_call','eth_createAccessList'].includes(q.method)))assert.equal(q.params[1],'0x64');
    for(const q of received.filter(q=>q.method==='eth_getStorageAt'))assert.equal(q.params[2],'0x64');
    assert.ok(received.some(q=>q.method==='eth_call'&&q.params[2]));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
