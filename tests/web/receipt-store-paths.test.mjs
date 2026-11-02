import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const loader=resolve('scripts/register-ts.mjs');
const source=`import assert from 'node:assert/strict';import{existsSync}from'node:fs';
import{ArbitrageFillJournal as Journal}from${JSON.stringify(resolve('scripts/arbitrage-fill-journal.mjs'))};
import{ReceiptObservationQueue as Queue}from${JSON.stringify(resolve('scripts/arbitrage-observer-queue.mjs'))};
import{StrategyNativeGasBudget as Budget}from${JSON.stringify(resolve('scripts/strategy-native-gas-budget.mjs'))};
import{fillMarketHash}from${JSON.stringify(resolve('lib/arbitrage-receipts.ts'))};
import{market,a,TX}from${JSON.stringify(resolve('tests/fixtures/arbitrage-receipts.mjs'))};
const kind=process.argv[1],make=path=>kind==='journal'?new Journal(path,market()):kind==='queue'?new Queue(path,market(),()=>100000):new Budget(path,{chainId:97,fundingScope:'strategy-native-gas',payer:a(1),marketHashes:[fillMarketHash(market())],perTransactionWei:'100000',rollingDayWei:'150000'},()=>100000);
for(const path of ['file:lost?mode=memory','file:lost?mode=memory&cache=shared','file:disk.sqlite',':memory:']){let b;try{b=make(path);assert.fail('URI or memory store accepted');}catch(e){if(e.code==='ERR_ASSERTION')throw e;assert.match(e.message,/Durable/);}finally{b?.close();}assert.equal(existsSync(path),false);}
// Ordinary relative filenames retain existing disk semantics.
let b=make('./plain.sqlite');if(kind==='queue')b.enqueue(TX);if(kind==='budget')b.reserve(TX,'100000');b.close();assert.equal(existsSync('plain.sqlite'),true);
b=make('./plain.sqlite');if(kind==='queue')assert.equal(b.stats().pending,1);if(kind==='budget')assert.equal(b.status().reservedWei,'100000');if(kind==='journal')assert.deepEqual(b.list(),[]);b.close();`;
for(const kind of ['journal','queue','budget'])test(`${kind} rejects SQLite URI/memory stores before opening and preserves literal relative disk paths`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'fortune-store-path-'));try{const r=spawnSync(process.execPath,['--import',loader,'--input-type=module','-e',source,kind],{cwd:dir,encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);assert.equal(r.error,undefined);}finally{rmSync(dir,{recursive:true,force:true});}
});
