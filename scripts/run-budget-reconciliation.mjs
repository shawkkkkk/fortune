import { readFileSync,statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPublicClient,http } from 'viem';
import { StrategyNativeGasBudget } from './strategy-native-gas-budget.mjs';
import { ArbitrageFillJournal } from './arbitrage-fill-journal.mjs';
import { reconcileBudgetedReceipt } from './reconcile-budgeted-receipt.mjs';
let book,journal;
try{
  const [marketPath,policyPath,journalPath,budgetPath,tx,...extra]=process.argv.slice(2);
  if(!marketPath||!policyPath||!journalPath||!budgetPath||!tx||extra.length||resolve(journalPath)===resolve(budgetPath)
    ||[marketPath,policyPath].some(p=>statSync(p).size>16384)||[journalPath,budgetPath].some(p=>!statSync(p).isFile()))throw Error('Arguments');
  const market=JSON.parse(readFileSync(marketPath,'utf8')),policy=JSON.parse(readFileSync(policyPath,'utf8'));
  new StrategyNativeGasBudget(budgetPath,policy,Date.now,{readOnly:true}).close();
  new ArbitrageFillJournal(journalPath,market,{readOnly:true}).close();
  const urls=[process.env.FORTUNE_ARBITRAGE_READ_RPC_URL,process.env.FORTUNE_ARBITRAGE_SECONDARY_RPC_URL].map(x=>new URL(x||''));
  if(urls.some(u=>u.protocol!=='https:'||u.username||u.password||u.hash)||urls[0].origin===urls[1].origin)throw Error('Reviewed distinct HTTPS origins required');
  const readers=urls.map(u=>createPublicClient({transport:http(u.href,{timeout:8000,retryCount:0})}));
  book=new StrategyNativeGasBudget(budgetPath,policy);journal=new ArbitrageFillJournal(journalPath,market);
  const result=await reconcileBudgetedReceipt(book,journal,readers,market,tx),bookBlocked=book.status().blocked;console.log(JSON.stringify({...result,bookBlocked}));
  if(result.state!=='reconciled-observation'||bookBlocked)process.exitCode=1;
}catch{console.error('Budgeted receipt reconciliation unavailable: check reviewed policies, existing durable files, read providers, pending holds and host clock. No transaction or profit allocation was submitted.');process.exitCode=1;}
finally{try{journal?.close();}finally{book?.close();}}
