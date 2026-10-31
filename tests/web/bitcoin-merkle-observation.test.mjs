import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectBitcoinMerkleObservation } from '../../lib/bitcoin-merkle-observation.ts';
const sha=b=>createHash('sha256').update(createHash('sha256').update(b).digest()).digest();
const display=b=>Buffer.from(b).reverse().toString('hex');
const raw='0200000001'+'00'.repeat(32)+'ffffffff00ffffffff020000000000000000076a5d04140114020100000000000000015100000000';
const txid=display(sha(Buffer.from(raw,'hex')));
function fixture(count=1,index=0){
 const leaves=Array.from({length:count},(_,i)=>sha(Buffer.from('synthetic leaf '+i)));leaves[index]=Buffer.from(txid,'hex').reverse();
 let level=leaves,position=index;const siblings=[];
 while(level.length>1){siblings.push(display(level[position^1]??level[position]));const next=[];
 for(let i=0;i<level.length;i+=2)next.push(sha(Buffer.concat([level[i],level[i+1]??level[i]])));
 level=next;position=Math.floor(position/2);}
 const header=Buffer.alloc(80);header.writeInt32LE(2);level[0].copy(header,36);header.writeUInt32LE(123456,68);
 return {rawTransaction:'0x'+raw,expectedTxid:txid,headerHex:'0x'+header.toString('hex'),expectedBlockHash:display(sha(header)),transactionCount:count,transactionIndex:index,siblings};
}
test('actual serialized transaction and Runestone engine bind to supplied headers across odd/even tree paths',()=>{
 for(const count of [1,2,3,4,5,7,8,9,31,32,33])for(let index=0;index<count;index++){
  const r=inspectBitcoinMerkleObservation(fixture(count,index));assert.equal(r.merklePathMatchesSuppliedHeader,true);assert.equal(r.transaction.txid,txid);assert.deepEqual(r.transaction.runestone.artifact.mint,{block:'1',tx:'2'});
 }
});
test('known genesis transaction and header hashes match without claiming live chain inclusion',()=>{
 const raw='0100000001'+'00'.repeat(32)+'ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000';
 const header='01000000'+'00'.repeat(32)+'3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a'+'29ab5f49ffff001d1dac2b7c';
 const r=inspectBitcoinMerkleObservation({rawTransaction:'0x'+raw,expectedTxid:'4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',headerHex:'0x'+header,expectedBlockHash:'000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',transactionCount:1,transactionIndex:0,siblings:[]});
 assert.equal(r.headerTimestamp,1231006505);assert.equal(r.compactTargetHex,'0x1d00ffff');assert.equal(r.transaction.runestone.artifact.kind,'none');assert.equal(r.inclusionVerified,false);
});
test('wrong hashes, path order, indexes, root, tx bytes and malformed bounds fail closed',()=>{
 for(const change of [v=>v.expectedBlockHash='00'.repeat(32),v=>v.expectedTxid='00'.repeat(32),v=>v.siblings.reverse(),v=>v.siblings[0]='ab'.repeat(32),v=>v.transactionIndex=1,v=>v.transactionCount=2,v=>v.rawTransaction+='00',v=>v.headerHex+='00',v=>v.extra=true]){const v=fixture(7,0);change(v);assert.throws(()=>inspectBitcoinMerkleObservation(v));}
 for(const count of [0,-1,1.5,1000001,'3',null])assert.throws(()=>inspectBitcoinMerkleObservation({...fixture(),transactionCount:count}));
 for(const index of [-1,1,0.5,'0'])assert.throws(()=>inspectBitcoinMerkleObservation({...fixture(),transactionIndex:index}));
 for(const siblings of [null,Array(33).fill('ab'.repeat(32)),['bad']])assert.throws(()=>inspectBitcoinMerkleObservation({...fixture(),siblings}));
});
test('odd-width self duplication is required but an actual duplicated pair is rejected on the observed path',()=>{
 const v=fixture(3,2);assert.equal(v.siblings[0],txid);assert.equal(inspectBitcoinMerkleObservation(v).merklePathMatchesSuppliedHeader,true);
 // The same root can describe a padded four-leaf tree; paired duplication must not be accepted as proof of count.
 assert.throws(()=>inspectBitcoinMerkleObservation({...v,transactionCount:4}));
 assert.throws(()=>inspectBitcoinMerkleObservation({...v,siblings:['ab'.repeat(32),v.siblings[1]]}));
 // Duplication in an opaque sibling subtree is invisible: count remains only a claim.
 const opaque=fixture(3,0);assert.equal(inspectBitcoinMerkleObservation({...opaque,transactionCount:4}).transactionCountVerified,false);
});
test('transaction-root paths do not bind SegWit witness bytes or validate a witness commitment',()=>{
 const v=fixture(3,1), witness=raw.slice(0,8)+'0001'+raw.slice(8,-8)+'0102aabb'+raw.slice(-8);
 const a=inspectBitcoinMerkleObservation({...v,rawTransaction:'0x'+witness});
 const b=inspectBitcoinMerkleObservation({...v,rawTransaction:'0x'+witness.replace('aabb','aabc')});
 assert.equal(a.transaction.txid,b.transaction.txid);assert.notEqual(a.transaction.wtxid,b.transaction.wtxid);
 assert.equal(a.merkleRoot,b.merkleRoot);assert.equal(b.merklePathMatchesSuppliedHeader,true);assert.equal(b.witnessCommitmentVerified,false);
});
test('matching arbitrary synthetic headers never establish chain, PoW, complete-tree, witness or bridge authority',()=>{
 const r=inspectBitcoinMerkleObservation(fixture(9,8));
 for(const key of ['headerTrusted','proofOfWorkVerified','canonicalChainVerified','transactionCountVerified','wholeTreeMutationChecked','witnessCommitmentVerified','transactionVerified','inclusionVerified','networkVerified','finalityVerified','custodyVerified','bridgeBackingVerified','executionAuthorized','fullBitcoinRunesReadiness'])assert.equal(r[key],false,key);
 assert.equal(r.transaction.signaturesVerified,false);assert.equal(r.transaction.feesSats,null);
});
test('actual offline CLI consumes bounded local proof JSON and stays disabled with private failures',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fortune-merkle-')),path=join(dir,'proof.json');
 const run=enabled=>spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/inspect-bitcoin-merkle.mjs',path],{env:{...process.env,FORTUNE_BITCOIN_MERKLE_READ_ENABLED:enabled},encoding:'utf8',timeout:5000});
 try{writeFileSync(path,JSON.stringify(fixture(3,2)));const r=run('true');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).merklePathMatchesSuppliedHeader,true);assert.equal(run('false').status,1);
 for(const text of ['{}',' '.repeat(262145),JSON.stringify({...fixture(),expectedBlockHash:'00'.repeat(32)})]){writeFileSync(path,text);const r=run('true');assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'Bitcoin Merkle observation unavailable.\n');}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
