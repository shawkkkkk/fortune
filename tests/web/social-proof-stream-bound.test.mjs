import test from 'node:test';
import assert from 'node:assert/strict';
import { SOCIAL_PLATFORMS } from '../../lib/social-fees.ts';
import { verifySocialProof } from '../../lib/social-verify.ts';
const code='fortune-0123456789abcdef01234567';
const request={platform:SOCIAL_PLATFORMS.find(p=>p.key==='github'),account:'octocat',code,wallet:'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',proofUrl:'https://gist.github.com/octocat/aa5a315d61ae9438b18d'};
const gist=new TextEncoder().encode(JSON.stringify({owner:{login:'octocat',id:42},description:code}));
function source(fragments,tiny){let calls=0,cancels=0,releases=0;const reads=[];
 const fetcher=async()=>{const index=reads.push(0)-1;calls++;return {ok:true,status:200,body:{getReader:()=>({async read(){const n=++reads[index];if(n<=fragments)return {done:false,value:tiny?new Uint8Array([32]):new Uint8Array()};if(n===fragments+1)return {done:false,value:gist};return {done:true};},cancel(){cancels++;return new Promise(()=>{});},releaseLock(){releases++;}})}};};
 return {fetcher,stats:()=>({calls,cancels,releases,reads})};
}
for(const tiny of [false,true])test(`social ownership rejects excessive ${tiny?'tiny':'empty'} fragments before projecting proof`,async()=>{
 const s=source(4097,tiny),result=await verifySocialProof(request,{env:{},fetcher:s.fetcher});
 assert.equal(result.code,'SOURCE_UNAVAILABLE');assert.equal(result.ok,false);
 assert.deepEqual(s.stats(),{calls:2,cancels:2,releases:2,reads:[4097,4097]});
});
test('4096 non-final fragments including proof remain accepted; final done read is not a fragment',async()=>{
 for(const tiny of [false,true]){const s=source(4095,tiny),result=await verifySocialProof(request,{env:{},fetcher:s.fetcher});assert.equal(result.ok,true);assert.equal(result.stableRawId,'42');assert.deepEqual(s.stats(),{calls:1,cancels:1,releases:1,reads:[4097]});}
});
