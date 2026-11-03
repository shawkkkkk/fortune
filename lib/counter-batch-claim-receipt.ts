import { encodeFunctionData, keccak256, parseAbi, type Address, type Hex, type PublicClient } from 'viem';

const ABI = parseAbi([
  'function claimMany(uint256[],address)', 'function governor() view returns(address)', 'function guardian() view returns(address)',
  'function launchToken() view returns(address)', 'function assetCodeHash(address) view returns(bytes32)',
  'function rounds(uint256) view returns(address asset,uint256 funded,uint256 remaining,bytes32 allocationHash)',
  'function claimable(uint256,address) view returns(uint256)',
]);
const TRANSFER = keccak256(new TextEncoder().encode('Transfer(address,address,uint256)'));
const CLAIMED = keccak256(new TextEncoder().encode('Claimed(uint256,address,address,uint256)'));
const addr = (v: unknown): v is Address => typeof v === 'string' && /^0x[0-9a-f]{40}$/.test(v) && !/^0x0{40}$/.test(v);
const hash = (v: unknown): v is Hex => typeof v === 'string' && /^0x[0-9a-f]{64}$/.test(v) && !/^0x0{64}$/.test(v);
const same = (v: unknown, expected: string) => typeof v === 'string' && v.toLowerCase() === expected;
const uint = (v: unknown, bits = 256): v is bigint => typeof v === 'bigint' && v >= 0n && v < 1n << BigInt(bits);
const positive = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,77}$/.test(v) && BigInt(v) < 1n << 256n;
const word = (v: bigint) => '0x' + v.toString(16).padStart(64, '0');
const topicAddress = (v: string) => '0x' + '0'.repeat(24) + v.slice(2);
const json = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x);
export type CounterBatchClaimReceiptPolicy = {
  chainId:97; escrow:Address; escrowCodeHash:Hex; governor:Address; guardian:Address;
  launchToken:Address; launchTokenCodeHash:Hex; recipient:Address; caller:Address; transactionHash:Hex;
  claims:{round:string;asset:Address;assetCodeHash:Hex;amount:string}[];
};

/** Complete direct claimMany receipt only; all entries share one RPC/clock lifetime. */
export async function inspectCounterBatchClaimReceipt(clients: readonly [PublicClient,PublicClient], input: CounterBatchClaimReceiptPolicy) {
  const p = structuredClone(input);
  if (!p || Object.keys(p).sort().join() !== 'caller,chainId,claims,escrow,escrowCodeHash,governor,guardian,launchToken,launchTokenCodeHash,recipient,transactionHash'
    || p.chainId !== 97 || ![p.escrow,p.governor,p.guardian,p.launchToken,p.recipient,p.caller].every(addr)
    || p.governor === p.guardian || new Set([p.escrow,p.launchToken,p.recipient]).size !== 3 || p.caller === p.escrow
    || ![p.escrowCodeHash,p.launchTokenCodeHash,p.transactionHash].every(hash) || !Array.isArray(p.claims) || p.claims.length < 1 || p.claims.length > 32) throw Error('Invalid batch claim policy');
  const assets = new Map<Address,Hex>(); let previous = 0n;
  for (let i=0;i<p.claims.length;i++) {
    const q=p.claims[i];
    if (!q || Object.keys(q).sort().join() !== 'amount,asset,assetCodeHash,round' || !positive(q.round) || BigInt(q.round) <= previous || !positive(q.amount)
      || !addr(q.asset) || [p.escrow,p.launchToken,p.recipient].includes(q.asset) || !hash(q.assetCodeHash)
      || (assets.has(q.asset) && assets.get(q.asset) !== q.assetCodeHash)) throw Error('Invalid complete batch entries');
    assets.set(q.asset,q.assetCodeHash); previous=BigInt(q.round);
  }
  if (assets.size>10) throw Error('Batch asset bound');
  if (!Array.isArray(clients) || clients.length !== 2 || clients[0] === clients[1]) throw Error('Two distinct read clients required');
  const data = encodeFunctionData({abi:ABI,functionName:'claimMany',args:[p.claims.map(q=>BigInt(q.round)),p.recipient]});
  const start = Date.now(); let last = start, ended = false, timer: ReturnType<typeof setTimeout> | undefined;
  const clock = () => {
    const now = Date.now();
    if (ended || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(now) || now < last || now - start > 20_000) throw Error('Claim receipt read ended, expired or clock moved backwards');
    last = now; return now;
  };
  const action = async <T>(fn: () => Promise<T>) => { clock(); const result = await fn(); clock(); return result; };
  const observe = async (c: PublicClient, head: bigint) => {
    if (await action(() => c.getChainId()) !== 97) throw Error('Wrong claim chain');
    const receipt = () => action(() => c.getTransactionReceipt({ hash: p.transactionHash }));
    const r = await receipt();
    const validateReceipt = (v: typeof r) => {
      if (!same(v.transactionHash,p.transactionHash) || v.status !== 'success' || !hash(v.blockHash) || !uint(v.blockNumber,64) || v.blockNumber === 0n || head < v.blockNumber + 20n
        || !same(v.from,p.caller) || !same(v.to,p.escrow) || !Number.isSafeInteger(v.transactionIndex) || v.transactionIndex < 0 || !Array.isArray(v.logs) || v.logs.length !== 2 * p.claims.length) throw Error('Direct confirmed claim receipt required');
      for (const l of v.logs) if (!same(l.transactionHash,p.transactionHash) || !same(l.blockHash,v.blockHash) || l.blockNumber !== v.blockNumber || l.transactionIndex !== v.transactionIndex || l.removed !== false
        || !Number.isSafeInteger(l.logIndex) || l.logIndex < 0 || !Array.isArray(l.topics) || l.topics.some(t => typeof t !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(t))) throw Error('Claim log binding differs');
      for (const [i,q] of p.claims.entries()) {
        const [transfer,claimed] = v.logs.slice(i*2,i*2+2);
        const a=[TRANSFER,topicAddress(p.escrow),topicAddress(p.recipient)], b=[CLAIMED,word(BigInt(q.round)),topicAddress(p.recipient),topicAddress(q.asset)];
        if (!same(transfer.address,q.asset) || transfer.topics.length!==3 || transfer.topics.some((t,j)=>!same(t,a[j])) || !same(transfer.data,word(BigInt(q.amount)))
          || !same(claimed.address,p.escrow) || claimed.topics.length!==4 || claimed.topics.some((t,j)=>!same(t,b[j])) || !same(claimed.data,word(BigInt(q.amount)))
          || claimed.logIndex!==transfer.logIndex+1 || (i>0 && transfer.logIndex!==v.logs[i*2-1].logIndex+1)) throw Error('Canonical batch claim events differ');
      }
      return [v.transactionHash.toLowerCase(),v.status,v.blockNumber.toString(),v.blockHash.toLowerCase(),v.from.toLowerCase(),v.to?.toLowerCase(),v.transactionIndex,
        v.logs.map(l => [l.address.toLowerCase(),l.transactionHash?.toLowerCase(),l.blockHash?.toLowerCase(),l.blockNumber?.toString(),l.transactionIndex,l.logIndex,l.removed,l.topics.map(t => t.toLowerCase()),l.data.toLowerCase()])];
    };
    const original = validateReceipt(r), block = () => action(() => c.getBlock({ blockNumber: r.blockNumber }));
    const b = await block();
    if (b.number !== r.blockNumber || !same(b.hash,r.blockHash) || !uint(b.timestamp) || b.timestamp * 1000n > BigInt(clock()) || !Array.isArray(b.transactions) || !same(b.transactions[r.transactionIndex],p.transactionHash)) throw Error('Claim block differs');
    const tx = await action(() => c.getTransaction({ hash: p.transactionHash }));
    if (!same(tx.hash,p.transactionHash) || !same(tx.blockHash,r.blockHash) || tx.blockNumber !== r.blockNumber || tx.transactionIndex !== r.transactionIndex || tx.chainId !== 97
      || !same(tx.from,p.caller) || !same(tx.to,p.escrow) || tx.value !== 0n || !same(tx.input,data)) throw Error('Direct claim transaction differs');
    for (const [address,pin] of [[p.escrow,p.escrowCodeHash],[p.launchToken,p.launchTokenCodeHash],...assets.entries()] as const) {
      const code = await action(() => c.getCode({ address, blockNumber: r.blockNumber }));
      if (!code || !/^0x(?:[0-9a-fA-F]{2}){1,131072}$/.test(code) || keccak256(code) !== pin) throw Error('Claim runtime differs');
    }
    const read = (functionName: string, args: readonly unknown[] = []) => action(() => c.readContract({ address:p.escrow,abi:ABI,functionName,args,blockNumber:r.blockNumber } as never)) as Promise<unknown>;
    const [gov,guard,launch] = await Promise.all([read('governor'),read('guardian'),read('launchToken')]);
    if (!same(gov,p.governor) || !same(guard,p.guardian) || !same(launch,p.launchToken)) throw Error('Batch claim roles differ');
    for (const [asset,pin] of assets) if (await read('assetCodeHash',[asset]) !== pin) throw Error('Batch asset pin differs');
    const claims=[];
    for (const [i,q] of p.claims.entries()) {
      const [round,entitlement] = await Promise.all([read('rounds',[BigInt(q.round)]),read('claimable',[BigInt(q.round),p.recipient])]);
      if (entitlement!==0n || !Array.isArray(round) || round.length!==4 || !same(round[0],q.asset) || !uint(round[1]) || round[1]<BigInt(q.amount)
        || !uint(round[2]) || round[2]>round[1]-BigInt(q.amount) || !hash(round[3])) throw Error('Batch claim round differs');
      claims.push({round:q.round,asset:q.asset,amount:q.amount,roundFunded:round[1].toString(),roundRemainingAtBlock:round[2].toString(),allocationHash:round[3],claimLogIndex:r.logs[i*2+1].logIndex,
        evidenceId:`97:${p.escrow}:${p.transactionHash}:${r.logs[i*2+1].logIndex}`});
    }
    const again = validateReceipt(await receipt()), after = await block();
    if (json(again) !== json(original) || after.number !== b.number || after.hash !== b.hash || after.timestamp !== b.timestamp || !same(after.transactions[r.transactionIndex],p.transactionHash) || await action(() => c.getChainId()) !== 97) throw Error('Claim observation changed');
    return {chainId:97,escrow:p.escrow,recipient:p.recipient,caller:p.caller,transactionHash:p.transactionHash,blockNumber:r.blockNumber.toString(),blockHash:r.blockHash,
      blockTimestamp:b.timestamp.toString(),claims,receiptConsistencyDigest:keccak256(new TextEncoder().encode(json(original)))};
  };
  try {
    clock();
    return await Promise.race([(async () => {
      const heads = await Promise.all(clients.map(c => action(() => c.getBlockNumber({ cacheTime:0 }))));
      if (heads.some(h => !uint(h,64) || h < 21n) || (heads[0] > heads[1] ? heads[0] - heads[1] : heads[1] - heads[0]) > 10n) throw Error('Claim heads differ');
      const head = heads[0] < heads[1] ? heads[0] : heads[1], observations = await Promise.all(clients.map(c => observe(c,head)));
      if (json(observations[0]) !== json(observations[1])) throw Error('Claim providers disagree');
      return { ...observations[0],observedAtMs:clock(),source:'isolated-all-entry-counter-batch-claim-rpc-observation',allCallEntriesObserved:true,currentAuthorization:null,
        independentProvidersVerified:false,finalityVerified:false,holderEligibilityVerified:false,feeFundingVerified:false,capitalOriginVerified:false,
        prePostBalancesVerified:false,globalSolvencyVerified:false,executionAuthorized:false,fullCounterReadiness:false };
    })(), new Promise<never>((_,reject) => { timer = setTimeout(() => reject(Error('Claim receipt observation timed out')),20_000); })]);
  } finally { ended = true; clearTimeout(timer); }
}
