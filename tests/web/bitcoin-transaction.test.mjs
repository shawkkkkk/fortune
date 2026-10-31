import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectBitcoinTransaction } from '../../lib/bitcoin-transaction.ts';
const digest = s => createHash('sha256').update(createHash('sha256').update(Buffer.from(s,'hex')).digest()).digest().reverse().toString('hex');
const input = '01'+'00'.repeat(32)+'ffffffff00ffffffff';
const outputs = '02'+'0000000000000000'+'07'+'6a5d0414011402'+'0100000000000000'+'01'+'51';
const base = '02000000'+input+outputs+'00000000';
const witness = '020000000001'+input+outputs+'0102aabb'+'00000000';
const read = raw => inspectBitcoinTransaction('0x'+raw,digest(raw));
test('serialized transaction binds actual ordered outputs and expected txid to the Runestone engine',()=>{
 const r=read(base);assert.equal(r.serializedTxidMatches,true);assert.equal(r.outputScriptsBoundToSuppliedBytes,true);
 assert.equal(r.txid,digest(base));assert.equal(r.wtxid,r.txid);assert.deepEqual(r.outputValuesSats,['0','1']);
 assert.deepEqual(r.runestone.artifact.mint,{block:'1',tx:'2'});assert.equal(r.runestone.outputCount,2);
 assert.equal(r.transactionVerified,false);assert.equal(r.runestone.outputListCompletenessVerified,false);
 assert.throws(()=>inspectBitcoinTransaction('0x'+base,'00'.repeat(32)));
});
test('SegWit txid strips marker/flag/witness while wtxid commits to witness bytes',()=>{
 const r=inspectBitcoinTransaction('0x'+witness,digest(base));assert.equal(r.txid,digest(base));assert.equal(r.wtxid,digest(witness));
 const changed=witness.replace('aabb','aabc');const c=inspectBitcoinTransaction('0x'+changed,digest(base));assert.equal(c.txid,r.txid);assert.notEqual(c.wtxid,r.wtxid);
 assert.deepEqual(c.runestone,r.runestone);assert.throws(()=>inspectBitcoinTransaction('0x'+witness,digest(witness)));
});
test('Bitcoin genesis transaction independent published txid vector parses without network or signing',()=>{
 const raw='0100000001'+'00'.repeat(32)+'ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000';
 const r=inspectBitcoinTransaction('0x'+raw,'4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b');assert.equal(r.declaredOutputTotalSats,'5000000000');assert.equal(r.runestone.artifact.kind,'none');assert.equal(r.inclusionVerified,false);
});
test('serialized parser rejects every truncation, trailing bytes, witness flags/empty stacks and noncanonical CompactSize',()=>{
 for(let i=0;i<base.length;i+=2)assert.throws(()=>read(base.slice(0,i)));
 for(const raw of [base+'00',base.slice(0,8)+'fd0100'+base.slice(10),base.slice(0,8)+'fe01000000'+base.slice(10),base.slice(0,8)+'ff0100000000000000'+base.slice(10),'020000000002'+input+outputs+'00000000','020000000001'+input+outputs+'00'+'00000000']) assert.throws(()=>read(raw));
 for(const raw of [null,'', '0x0','0xgg','0x'+'00'.repeat(100001)])assert.throws(()=>inspectBitcoinTransaction(raw,'00'.repeat(32)));
});
test('output values and all counts remain bounded; no fees, Bitcoin validity or Rune acceptance inferred',()=>{
 for(const value of ['ffffffffffffffff','0140075af0750700'])assert.throws(()=>read('02000000'+input+'01'+value+'00'+'00000000'));
 assert.throws(()=>read('0200000081'));assert.throws(()=>read('02000000'+input+'81'));
 const r=read(base);for(const k of ['transactionVerified','networkVerified','inclusionVerified','finalityVerified','inputValuesVerified','signaturesVerified','runeBalancesVerified','etchingAccepted','mintAccepted','custodyVerified','bridgeBackingVerified','executionAuthorized','fullBitcoinRunesReadiness'])assert.equal(r[k],false,k);
 assert.equal(r.feesSats,null);
});
test('actual disabled local CLI uses the transaction parser and expected txid, with private failures',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fortune-btc-')),path=join(dir,'transaction.json');
 const run=enabled=>spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/inspect-bitcoin-transaction.mjs',path],{encoding:'utf8',env:{...process.env,FORTUNE_BITCOIN_TRANSACTION_READ_ENABLED:enabled},timeout:5000});
 try{writeFileSync(path,JSON.stringify({rawTransaction:'0x'+base,expectedTxid:digest(base)}));const r=run('true');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).runestone.artifact.kind,'runestone');assert.equal(run('false').status,1);
 for(const text of ['{}',JSON.stringify({rawTransaction:'0x'+base,expectedTxid:'00'.repeat(32)}),' '.repeat(262145)]){writeFileSync(path,text);const r=run('true');assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'Bitcoin transaction inspection unavailable.\n');}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
