import { readFileSync,statSync,realpathSync } from 'node:fs';
import { createPublicClient,http } from 'viem';
import { StrategyNativeGasBudget } from './strategy-native-gas-budget.mjs';
import { ArbitrageFillJournal } from './arbitrage-fill-journal.mjs';
import { ReceiptObservationQueue } from './arbitrage-observer-queue.mjs';
import { reconcileBudgetedReceipt,observeNextBudgetedReceipt } from './reconcile-budgeted-receipt.mjs';
let book,journal,queue;
try{
  const [marketPath,policyPath,journalPath,budgetPath,operation,...extra]=process.argv.slice(2);
  const queued=operation==='--next',queuePath=queued?extra[0]:null;
  if(!marketPath||!policyPath||!journalPath||!budgetPath||!operation||(queued?extra.length!==1:extra.length!==0)
    ||[marketPath,policyPath].some(p=>!statSync(p).isFile()||statSync(p).size>16384))throw Error('Arguments');
  // Resolve existing stores before opening any writer; aliases must not combine roles.
  const paths=[journalPath,budgetPath,...(queued?[queuePath]:[])].map(p=>realpathSync(p));
  const files=paths.map(p=>statSync(p));
  if(files.some(s=>!s.isFile())||new Set(files.map(s=>`${s.dev}:${s.ino}`)).size!==files.length)throw Error('Distinct existing stores required');
  const market=JSON.parse(readFileSync(marketPath,'utf8')),policy=JSON.parse(readFileSync(policyPath,'utf8'));
  new StrategyNativeGasBudget(paths[1],policy,Date.now,{readOnly:true}).close();
  new ArbitrageFillJournal(paths[0],market,{readOnly:true}).close();
  if(queued)new ReceiptObservationQueue(paths[2],market,Date.now,{readOnly:true}).close();
  const urls=[process.env.FORTUNE_ARBITRAGE_READ_RPC_URL,process.env.FORTUNE_ARBITRAGE_SECONDARY_RPC_URL].map(x=>new URL(x||''));
  if(urls.some(u=>u.protocol!=='https:'||u.username||u.password||u.hash)||urls[0].origin===urls[1].origin)throw Error('Reviewed distinct HTTPS origins required');
  const readers=urls.map(u=>createPublicClient({transport:http(u.href,{timeout:8000,retryCount:0})}));
  book=new StrategyNativeGasBudget(paths[1],policy);journal=new ArbitrageFillJournal(paths[0],market);
  if(queued)queue=new ReceiptObservationQueue(paths[2],market);
  const result=queued?await observeNextBudgetedReceipt(queue,book,journal,readers,market):await reconcileBudgetedReceipt(book,journal,readers,market,operation);
  const bookBlocked=book.status().blocked;
  // Queue completion includes a hash internally; CLI output deliberately excludes it.
  console.log(JSON.stringify({state:result.state,executionAuthorized:false,profitAllocated:false,bookBlocked}));
  if(!(queued?['done','idle']:['reconciled-observation']).includes(result.state)||bookBlocked)process.exitCode=1;
}catch{console.error('Budgeted receipt reconciliation unavailable: check reviewed policies, existing durable files, read providers, pending holds and host clock. No transaction or profit allocation was submitted.');process.exitCode=1;}
finally{try{queue?.close();}finally{try{journal?.close();}finally{book?.close();}}}
