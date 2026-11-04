import { encodeFunctionData, keccak256, parseAbi, type Address, type Hex, type PublicClient } from 'viem';

const ABI = parseAbi([
  'function claim(uint256,address)', 'function governor() view returns(address)', 'function guardian() view returns(address)',
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
export type CounterClaimReceiptPolicy = {
  chainId: 97; escrow: Address; escrowCodeHash: Hex; governor: Address; guardian: Address;
  launchToken: Address; launchTokenCodeHash: Hex; asset: Address; assetCodeHash: Hex;
  recipient: Address; caller: Address; round: string; amount: string; transactionHash: Hex;
};

/** Direct single-round claim only. Historical RPC agreement, never financial authority. */
export async function inspectCounterClaimReceipt(clients: readonly [PublicClient, PublicClient], input: CounterClaimReceiptPolicy) {
  const p = structuredClone(input);
  if (!p || Object.keys(p).sort().join() !== 'amount,asset,assetCodeHash,caller,chainId,escrow,escrowCodeHash,governor,guardian,launchToken,launchTokenCodeHash,recipient,round,transactionHash'
    || p.chainId !== 97 || ![p.escrow,p.governor,p.guardian,p.launchToken,p.asset,p.recipient,p.caller].every(addr)
    || p.governor === p.guardian || new Set([p.escrow,p.launchToken,p.asset,p.recipient]).size !== 4 || p.caller === p.escrow
    || ![p.escrowCodeHash,p.launchTokenCodeHash,p.assetCodeHash,p.transactionHash].every(hash) || !positive(p.round) || !positive(p.amount)) throw Error('Invalid direct claim receipt policy');
  if (!Array.isArray(clients) || clients.length !== 2 || clients[0] === clients[1]) throw Error('Two distinct read clients required');
  const data = encodeFunctionData({ abi: ABI, functionName: 'claim', args: [BigInt(p.round), p.recipient] });
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
        || !same(v.from,p.caller) || !same(v.to,p.escrow) || !Number.isSafeInteger(v.transactionIndex) || v.transactionIndex < 0 || !Array.isArray(v.logs) || v.logs.length !== 2) throw Error('Direct confirmed claim receipt required');
      for (const l of v.logs) if (!same(l.transactionHash,p.transactionHash) || !same(l.blockHash,v.blockHash) || l.blockNumber !== v.blockNumber || l.transactionIndex !== v.transactionIndex || l.removed !== false
        || !Number.isSafeInteger(l.logIndex) || l.logIndex < 0 || !Array.isArray(l.topics) || l.topics.some(t => typeof t !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(t))) throw Error('Claim log binding differs');
      const [transfer,claimed] = v.logs;
      const a = [TRANSFER,topicAddress(p.escrow),topicAddress(p.recipient)], b = [CLAIMED,word(BigInt(p.round)),topicAddress(p.recipient),topicAddress(p.asset)];
      if (!same(transfer.address,p.asset) || transfer.topics.length !== 3 || a.some((t,i) => !Object.hasOwn(transfer.topics,i) || !same(transfer.topics[i],t)) || !same(transfer.data,word(BigInt(p.amount)))
        || !same(claimed.address,p.escrow) || claimed.topics.length !== 4 || b.some((t,i) => !Object.hasOwn(claimed.topics,i) || !same(claimed.topics[i],t)) || !same(claimed.data,word(BigInt(p.amount))) || claimed.logIndex !== transfer.logIndex + 1) throw Error('Canonical claim events differ');
      return [v.transactionHash.toLowerCase(),v.status,v.blockNumber.toString(),v.blockHash.toLowerCase(),v.from.toLowerCase(),v.to?.toLowerCase(),v.transactionIndex,
        v.logs.map(l => [l.address.toLowerCase(),l.transactionHash?.toLowerCase(),l.blockHash?.toLowerCase(),l.blockNumber?.toString(),l.transactionIndex,l.logIndex,l.removed,l.topics.map(t => t.toLowerCase()),l.data.toLowerCase()])];
    };
    const original = validateReceipt(r), block = () => action(() => c.getBlock({ blockNumber: r.blockNumber }));
    const b = await block();
    if (b.number !== r.blockNumber || !same(b.hash,r.blockHash) || !uint(b.timestamp) || b.timestamp * 1000n > BigInt(clock()) || !Array.isArray(b.transactions) || !same(b.transactions[r.transactionIndex],p.transactionHash)) throw Error('Claim block differs');
    const tx = await action(() => c.getTransaction({ hash: p.transactionHash }));
    if (!same(tx.hash,p.transactionHash) || !same(tx.blockHash,r.blockHash) || tx.blockNumber !== r.blockNumber || tx.transactionIndex !== r.transactionIndex || tx.chainId !== 97
      || !same(tx.from,p.caller) || !same(tx.to,p.escrow) || tx.value !== 0n || !same(tx.input,data)) throw Error('Direct claim transaction differs');
    for (const [address,pin] of [[p.escrow,p.escrowCodeHash],[p.launchToken,p.launchTokenCodeHash],[p.asset,p.assetCodeHash]] as const) {
      const code = await action(() => c.getCode({ address, blockNumber: r.blockNumber }));
      if (!code || !/^0x(?:[0-9a-fA-F]{2}){1,131072}$/.test(code) || keccak256(code) !== pin) throw Error('Claim runtime differs');
    }
    const read = (functionName: string, args: readonly unknown[] = []) => action(() => c.readContract({ address:p.escrow,abi:ABI,functionName,args,blockNumber:r.blockNumber } as never)) as Promise<unknown>;
    const [gov,guard,launch,pin,round,entitlement] = await Promise.all([read('governor'),read('guardian'),read('launchToken'),read('assetCodeHash',[p.asset]),read('rounds',[BigInt(p.round)]),read('claimable',[BigInt(p.round),p.recipient])]);
    if (!same(gov,p.governor) || !same(guard,p.guardian) || !same(launch,p.launchToken) || pin !== p.assetCodeHash || entitlement !== 0n
      || !Array.isArray(round) || round.length !== 4 || !same(round[0],p.asset) || !uint(round[1]) || round[1] < BigInt(p.amount) || !uint(round[2]) || round[2] > round[1] - BigInt(p.amount) || !hash(round[3])) throw Error('Claim round or policy differs');
    const again = validateReceipt(await receipt()), after = await block();
    if (json(again) !== json(original) || after.number !== b.number || after.hash !== b.hash || after.timestamp !== b.timestamp || !same(after.transactions[r.transactionIndex],p.transactionHash) || await action(() => c.getChainId()) !== 97) throw Error('Claim observation changed');
    return { chainId:97,escrow:p.escrow,asset:p.asset,recipient:p.recipient,caller:p.caller,round:p.round,amount:p.amount,roundFunded:round[1].toString(),roundRemainingAtBlock:round[2].toString(),allocationHash:round[3],
      transactionHash:p.transactionHash,blockNumber:r.blockNumber.toString(),blockHash:r.blockHash,blockTimestamp:b.timestamp.toString(),claimLogIndex:r.logs[1].logIndex,
      evidenceId:`97:${p.escrow}:${p.transactionHash}:${r.logs[1].logIndex}` };
  };
  try {
    clock();
    return await Promise.race([(async () => {
      const heads = await Promise.all(clients.map(c => action(() => c.getBlockNumber({ cacheTime:0 }))));
      if (heads.some(h => !uint(h,64) || h < 21n) || (heads[0] > heads[1] ? heads[0] - heads[1] : heads[1] - heads[0]) > 10n) throw Error('Claim heads differ');
      const head = heads[0] < heads[1] ? heads[0] : heads[1], observations = await Promise.all(clients.map(c => observe(c,head)));
      if (json(observations[0]) !== json(observations[1])) throw Error('Claim providers disagree');
      return { ...observations[0],observedAtMs:clock(),source:'isolated-direct-counter-claim-rpc-observation',directClaimObserved:true,currentAuthorization:null,
        independentProvidersVerified:false,finalityVerified:false,holderEligibilityVerified:false,feeFundingVerified:false,capitalOriginVerified:false,
        prePostBalancesVerified:false,globalSolvencyVerified:false,executionAuthorized:false,fullCounterReadiness:false };
    })(), new Promise<never>((_,reject) => { timer = setTimeout(() => reject(Error('Claim receipt observation timed out')),20_000); })]);
  } finally { ended = true; clearTimeout(timer); }
}
