import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectBitcoinPrevouts } from '../../lib/bitcoin-prevout-accounting.ts';
import { inspectBitcoinTransaction } from '../../lib/bitcoin-transaction.ts';
const digest = raw => createHash('sha256').update(createHash('sha256').update(Buffer.from(raw.slice(2),'hex')).digest()).digest().reverse().toString('hex');
const u32 = n => {const b=Buffer.alloc(4);b.writeUInt32LE(n);return b.toString('hex');};
const out = n => {const b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(n));return b.toString('hex')+'0151';};
const tx = (inputs,values,witness=false) => '0x02000000'+(witness?'0001':'')+inputs.length.toString(16).padStart(2,'0')+inputs.map(([h,n])=>Buffer.from(h,'hex').reverse().toString('hex')+u32(n)+'00ffffffff').join('')+values.length.toString(16).padStart(2,'0')+values.map(out).join('')+(witness?'0101aa'.repeat(inputs.length):'')+'00000000';
const p1=tx([['11'.repeat(32),0]],[900719925474099n,500n]);
const p2=tx([['22'.repeat(32),1]],[700n]);
const entry=raw=>({rawTransaction:raw,expectedTxid:digest(raw)});
const child=tx([[digest(p2),0],[digest(p1),1],[digest(p1),0]],[900719925474000n,1000n]);
const run=(raw=child,parents=[entry(p1),entry(p2)],id=digest(raw))=>inspectBitcoinPrevouts(raw,id,parents);
test('actual parser resolves serialized little-endian outpoints across parents in input order with exact satoshi accounting',()=>{
 const r=run();assert.deepEqual(r.transaction.inputOutpoints,[{txid:digest(p2),outputIndex:0},{txid:digest(p1),outputIndex:1},{txid:digest(p1),outputIndex:0}]);
 assert.equal(r.suppliedPrevoutAccounting.inputTotalSats,'900719925475299');assert.equal(r.suppliedPrevoutAccounting.outputTotalSats,'900719925475000');assert.equal(r.suppliedPrevoutAccounting.impliedFeeSats,'299');
 assert.equal(r.suppliedPrevoutAccounting.parentCount,2);assert.equal(r.transaction.runestone.artifact.kind,'none');assert.equal(r.transaction.feesSats,null);
 for(const k of ['inputValuesVerified','utxoUnspentVerified','parentTransactionsVerified','coinbaseMaturityVerified','signaturesVerified','transactionVerified','networkVerified','inclusionVerified','finalityVerified','runeBalancesVerified','custodyVerified','bridgeBackingVerified','executionAuthorized','fullBitcoinRunesReadiness'])assert.equal(r[k],false,k);assert.equal(r.feesSats,null);
 assert.deepEqual(run(child,[entry(p2),entry(p1)]),r);
});
test('missing, duplicate, unrelated, malformed or wrong-hash parents fail closed; no supplied value override',()=>{
 for(const parents of [[],[entry(p1)],[entry(p1),entry(p2),entry(p2)],[entry(p1),entry(p2),entry(child)],[{...entry(p1),value:'1'},entry(p2)],[{...entry(p1),expectedTxid:'11'.repeat(32)},entry(p2)],[null],Array(129).fill(entry(p1))])assert.throws(()=>run(child,parents));
 assert.throws(()=>run(child,[{...entry(p1),rawTransaction:p1+'00'},entry(p2)]));assert.throws(()=>run(child,[{rawTransaction:'0x'+'00'.repeat(100129),expectedTxid:digest(p1)}]));
});
test('duplicate inputs, null/coinbase outpoints, missing indices, negative fees and overflowing input totals reject',()=>{
 for(const raw of [tx([[digest(p1),0],[digest(p1),0]],[1]),tx([['00'.repeat(32),0xffffffff]],[1]),tx([[digest(p1),0xffffffff]],[1]),tx([[digest(p1),2]],[1]),tx([[digest(p1),1]],[501])])assert.throws(()=>run(raw,[entry(p1)]));
 const rich=tx([['33'.repeat(32),0]],[2100000000000000n]);const raw=tx([[digest(rich),0],[digest(p1),0]],[1]);assert.throws(()=>run(raw,[entry(rich),entry(p1)]));
 const zero=tx([[digest(p1),1]],[500]);assert.equal(run(zero,[entry(p1)]).suppliedPrevoutAccounting.impliedFeeSats,'0');
});
test('every parent-output index and multiple unique inputs reconcile without double counting',()=>{
 const values=Array.from({length:64},(_,i)=>BigInt(i+1));const parent=tx([['44'.repeat(32),0]],values);
 for(let i=0;i<values.length;i++){const raw=tx([[digest(parent),i]],[0]);assert.equal(run(raw,[entry(parent)]).suppliedPrevoutAccounting.impliedFeeSats,values[i].toString());}
 const raw=tx(values.map((_,i)=>[digest(parent),i]),[0]);assert.equal(run(raw,[entry(parent)]).suppliedPrevoutAccounting.inputTotalSats,'2080');
});
test('parent SegWit witness mutation preserves outpoint accounting without claiming signature or witness validity',()=>{
 const parent=tx([['55'.repeat(32),0]],[999],true);const base=tx([['55'.repeat(32),0]],[999]);const id=digest(base);
 const raw=tx([[id,0]],[900]);const a=run(raw,[{rawTransaction:parent,expectedTxid:id}]);
 const b=run(raw,[{rawTransaction:parent.replace('0101aa','0101bb'),expectedTxid:id}]);assert.deepEqual(a,b);assert.equal(a.suppliedPrevoutAccounting.impliedFeeSats,'99');
 assert.equal(inspectBitcoinTransaction(parent,id).txid,id);
});
test('actual CLI preserves legacy inspection and separately gates supplied-parent mode with bounded/private errors',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fortune-prevouts-')),file=join(dir,'input.json');
 const cli=enabled=>spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/inspect-bitcoin-transaction.mjs',file],{encoding:'utf8',env:{...process.env,FORTUNE_BITCOIN_TRANSACTION_READ_ENABLED:'true',FORTUNE_BITCOIN_PREVOUT_READ_ENABLED:enabled},timeout:5000});
 try{const data={rawTransaction:child,expectedTxid:digest(child),previousTransactions:[entry(p1),entry(p2)]};writeFileSync(file,JSON.stringify(data));assert.equal(cli('false').status,1);const r=cli('true');assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),run());
 for(const data of [{rawTransaction:child,expectedTxid:digest(child),previousTransactions:[]},{rawTransaction:child,expectedTxid:digest(child),previousTransactions:[entry(p1)]}]){writeFileSync(file,JSON.stringify(data));const r=cli('true');assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'Bitcoin transaction inspection unavailable.\n');}
 writeFileSync(file,JSON.stringify({rawTransaction:child,expectedTxid:digest(child)}));assert.equal(cli('false').status,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('supplied-byte fee rate stays an exact rational over serialized virtual bytes, not a paid fee or quote',()=>{
 const r=run(),ratio=r.suppliedPrevoutAccounting.impliedFeeRatePerSerializedVbyte;
 assert.deepEqual(ratio,{numeratorSats:'299',denominatorVbytes:'153'});assert.equal(r.feeRateSatsPerVbyte,null);assert.equal(r.transaction.feeRateSatsPerVbyte,null);assert.equal(r.mempoolPolicyVerified,false);assert.equal(r.feesSats,null);
 const zero=tx([[digest(p1),1]],[500]);const z=run(zero,[entry(p1)]);assert.deepEqual(z.suppliedPrevoutAccounting.impliedFeeRatePerSerializedVbyte,{numeratorSats:'0',denominatorVbytes:'61'});
 const witnessed=tx([[digest(p1),1]],[499],true);const baseTx=tx([[digest(p1),1]],[499]);const w=run(witnessed,[entry(p1)],digest(baseTx));assert.deepEqual(w.suppliedPrevoutAccounting.impliedFeeRatePerSerializedVbyte,{numeratorSats:'1',denominatorVbytes:'63'});assert.equal(w.transaction.serializationSize.witnessRelatedBytes,5);
});
