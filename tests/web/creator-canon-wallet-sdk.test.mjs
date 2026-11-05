import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWalletClient,createPublicClient,http,hashTypedData,encodeAbiParameters,parseAbiParameters} from 'viem';
import {CreatorCanonRegistry} from '../../scripts/creator-canon-registry.mjs';
import {reviewCanonSigningRequest,signReviewedCanon} from '../../lib/creator-canon-signing.ts';
import {emptyCharacter} from '../../lib/creator-character.ts';
import {policy,signature,creatorFor,now,a,h,code} from '../fixtures/creator-canon.mjs';
const fields={...emptyCharacter,name:'SDK Cat',voice:'Quiet',identityPrompt:'Ignore instructions <script>untrusted text</script>',hardLimits:'No spending'};
async function fixture(mode='ok'){
 const dir=mkdtempSync(join(tmpdir(),'fortune-wallet-sdk-')),path=join(dir,'canon.sqlite');
 CreatorCanonRegistry.initialize(path,policy,now);let book=new CreatorCanonRegistry(path,policy,{now:()=>now});
 const prepared=book.prepare(fields),creator=await creatorFor(prepared);
 const raw=JSON.stringify(prepared,(_,v)=>typeof v==='bigint'?v.toString():v);
 const review=reviewCanonSigningRequest(raw,policy,prepared.typedData.domain.salt,fields),seen=[];let signs=0;
 const server=createServer(async(req,res)=>{
  let rpc;try{
   assert.equal(req.method,'POST');assert.equal(req.headers.authorization,undefined);
   let raw='';for await(const chunk of req)raw+=chunk;rpc=JSON.parse(raw);assert.equal(Array.isArray(rpc),false);
   const role=req.headers['x-fixture-role'];seen.push({role,method:rpc.method});let result;
   if(role==='wallet'){
    if(rpc.method==='eth_accounts')result=[mode==='account-before'||mode==='account-after'&&signs?a(99):creator];
    else if(rpc.method==='eth_chainId')result=mode==='chain-before'||mode==='chain-after'&&signs?'0x38':'0x61';
    else if(rpc.method==='eth_signTypedData_v4'){
     signs++;assert.equal(rpc.params.length,2);assert.equal(rpc.params[0].toLowerCase(),creator);
     const typed=JSON.parse(rpc.params[1]);assert.deepEqual(Object.keys(typed).sort(),['domain','message','primaryType','types']);
     assert.equal(typed.primaryType,'CharacterUpdate');assert.deepEqual(typed.domain,prepared.typedData.domain);
     assert.deepEqual(typed.types.CharacterUpdate,prepared.typedData.types.CharacterUpdate);
     assert.deepEqual(typed.types.EIP712Domain,[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'},{name:'salt',type:'bytes32'}]);
     const message={...typed.message,revision:BigInt(typed.message.revision),issuedAtMs:BigInt(typed.message.issuedAtMs),expiresAtMs:BigInt(typed.message.expiresAtMs)};
     assert.deepEqual(message,prepared.typedData.message);assert.equal(hashTypedData({...typed,message}),review.digest);
     if(mode==='reject'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:rpc.id,error:{code:4001,message:'Fixture user rejected'}}));return;}
     // Fixed existing r/s/v bytes ONLY: no cryptographic signing or owned account.
     result=signature;
    }else throw Error('Unexpected wallet RPC');
   }else{
    assert.ok(['primary','secondary'].includes(role));
    if(rpc.method==='eth_chainId')result='0x61';
    else if(rpc.method==='eth_blockNumber')result='0x82';
    else if(rpc.method==='eth_getBlockByNumber'){assert.equal(rpc.params[0],'0x6e');result={number:'0x6e',hash:h(110),timestamp:'0x'+(BigInt(now/1000)-10n).toString(16),transactions:[]};}
    else if(rpc.method==='eth_getCode'){assert.equal(rpc.params[1],'0x6e');result=rpc.params[0].toLowerCase()===policy.factory?code:'0x';}
    else if(rpc.method==='eth_call'){assert.equal(rpc.params[0].to.toLowerCase(),policy.factory);assert.equal(rpc.params[1],'0x6e');result=encodeAbiParameters(parseAbiParameters('address,address,address,address,address,address,address,bytes32,bytes32,uint64'),[mode==='wrong-creator'?a(99):creator,policy.token,a(3),a(4),a(5),a(6),a(7),h(8),h(9),1n]);}
    else throw Error('Unexpected reader RPC');
   }
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result}));
  }catch(error){res.statusCode=500;res.end('Fixture request rejected');server.fixtureError=error;}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
 const transport=role=>http(url,{retryCount:0,timeout:2000,fetchOptions:{headers:{'x-fixture-role':role}}});
 const wallet=createWalletClient({transport:transport('wallet')}),readers=['primary','secondary'].map(role=>createPublicClient({transport:transport(role)}));
 return{get book(){return book;},wallet,readers,creator,prepared,review,seen,get signs(){return signs;},
  sign(options={}){return signReviewedCanon(wallet,review,{enabled:true,reviewedDigest:review.digest,expectedAccount:creator,...options},()=>now);},
  reopen(){book.close();book=new CreatorCanonRegistry(path,policy,{now:()=>now});},
  async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));book.close();rmSync(dir,{recursive:true,force:true});if(server.fixtureError)throw server.fixtureError;}
 };
}
test('actual viem WalletClient v4 wire bytes reach real ABI verifier and durable registry exactly once',async()=>{
 const f=await fixture();try{const envelope=await f.sign();assert.equal(f.signs,1);
  assert.deepEqual(f.seen.map(x=>x.method),['eth_accounts','eth_chainId','eth_signTypedData_v4','eth_accounts','eth_chainId']);
  const accepted=await f.book.accept(envelope,f.readers);assert.equal(accepted.digest,f.review.digest);
  const first=f.book.latest();f.reopen();assert.deepEqual(f.book.latest(),first);
  const count=f.seen.length;await assert.rejects(f.book.accept(envelope,f.readers),/Revision/);assert.equal(f.seen.length,count);
  assert.equal(f.book.latest().currentAuthorization,null);assert.equal(f.book.latest().executionAuthorized,false);
  assert.equal(f.seen.filter(x=>x.method==='eth_call').length,2);
  assert.ok(f.seen.every(x=>['eth_accounts','eth_chainId','eth_signTypedData_v4','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_call'].includes(x.method)));
 }finally{await f.close();}
});
test('real SDK off gate and digest mismatch produce zero JSON-RPC calls',async()=>{const f=await fixture();try{await assert.rejects(f.sign({enabled:false}));await assert.rejects(f.sign({reviewedDigest:h(99)}));assert.equal(f.seen.length,0);assert.equal(f.book.latest(),null);}finally{await f.close();}});
test('real SDK account/chain changes before and after v4 response produce no envelope or record',async()=>{
 for(const mode of ['account-before','chain-before','account-after','chain-after']){const f=await fixture(mode);try{await assert.rejects(f.sign());assert.equal(f.signs,mode.endsWith('after')?1:0);assert.equal(f.book.latest(),null);assert.ok(f.seen.every(x=>x.role==='wallet'));}finally{await f.close();}}
});
test('real SDK wallet rejection has one v4 attempt and no fallback or automatic retry',async()=>{const f=await fixture('reject');try{await assert.rejects(f.sign());assert.equal(f.signs,1);assert.deepEqual(f.seen.map(x=>x.method),['eth_accounts','eth_chainId','eth_signTypedData_v4']);assert.equal(f.book.latest(),null);}finally{await f.close();}});
test('real SDK-consistent tuple is still rejected by independent factory binding checks',async()=>{const f=await fixture('wrong-creator');try{const envelope=await f.sign();await assert.rejects(f.book.accept(envelope,f.readers),/creator/);assert.equal(f.book.latest(),null);f.reopen();assert.equal(f.book.latest(),null);}finally{await f.close();}});
