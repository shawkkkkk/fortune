import { encodeFunctionData, keccak256, parseAbi, type Address, type Hex, type PublicClient } from "viem";

export const COUNTER_CLAIM_ABI = parseAbi([
 "function governor() view returns(address)","function guardian() view returns(address)","function launchToken() view returns(address)","function paused() view returns(bool)",
 "function assetCodeHash(address) view returns(bytes32)","function reserved(address) view returns(uint256)",
 "function rounds(uint256) view returns(address asset,uint256 funded,uint256 remaining,bytes32 allocationHash)",
 "function claimable(uint256,address) view returns(uint256)","function claimMany(uint256[],address)"
]);
const TOKEN=parseAbi(["function balanceOf(address) view returns(uint256)"]);
const UINT=(1n<<256n)-1n;
const address=(v:unknown):v is Address=>typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v)&&!/^0x0{40}$/.test(v);
const hash=(v:unknown):v is Hex=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v)&&!/^0x0{64}$/.test(v);
const uint=(v:unknown):v is bigint=>typeof v==='bigint'&&v>=0n&&v<=UINT;
export type CounterClaimPolicy={chainId:97;escrow:Address;escrowCodeHash:Hex;governor:Address;guardian:Address;launchToken:Address;launchTokenCodeHash:Hex;recipient:Address;rounds:string[];assets:{token:Address;codeHash:Hex}[]};
/** Selected entitlements and unsigned bytes, not signing consent or proof of global solvency. */
export async function buildCounterClaimBatch(clients:readonly [PublicClient,PublicClient],input:CounterClaimPolicy){
 const p=structuredClone(input);
 if(!p||Object.keys(p).sort().join()!=='assets,chainId,escrow,escrowCodeHash,governor,guardian,launchToken,launchTokenCodeHash,recipient,rounds'||p.chainId!==97
 ||![p.escrow,p.governor,p.guardian,p.launchToken,p.recipient].every(address)||p.governor===p.guardian||new Set([p.escrow,p.launchToken,p.recipient]).size!==3
 ||![p.escrowCodeHash,p.launchTokenCodeHash].every(hash)||!Array.isArray(p.rounds)||p.rounds.length<1||p.rounds.length>32
 ||p.rounds.some((id,i)=>typeof id!=='string'||! /^[1-9][0-9]{0,77}$/.test(id)||BigInt(id)>UINT||(i>0&&BigInt(id)<=BigInt(p.rounds[i-1])))
 ||!Array.isArray(p.assets)||p.assets.length<1||p.assets.length>10||p.assets.some((a,i)=>!a||Object.keys(a).sort().join()!=='codeHash,token'||!address(a.token)||!hash(a.codeHash)||a.token===p.escrow||a.token===p.launchToken||(i>0&&a.token<=p.assets[i-1].token)))throw Error('Invalid bounded claim policy');
 if(!Array.isArray(clients)||clients.length!==2||clients[0]===clients[1])throw Error('Two distinct read clients required');
  const start = Date.now(); let previous = start, finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clock = () => {
    const now = Date.now();
    if (finished || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(now) || now < previous || now - start > 20_000) throw Error("Claim observation ended, expired or clock moved backwards");
    previous = now; return now;
  };
  const methods = new Set(["getChainId", "getBlockNumber", "getBlock", "getCode", "readContract"]);
  const readers = clients.map(c => new Proxy(c, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (typeof key !== "string" || !methods.has(key) || typeof value !== "function") return value;
    return async (...args: unknown[]) => { clock(); const result = await value.apply(target, args); clock(); return result; };
  } }));
  try {
    clock();
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Claim observation timed out")), 20_000); });
    return await Promise.race([(async () => {
      const heads = await Promise.all(readers.map(async c => {
        if (await c.getChainId() !== 97) throw Error("Wrong chain");
        const n = await c.getBlockNumber({ cacheTime: 0 });
        if (!uint(n) || n < 21n || n >= 1n << 64n) throw Error("Invalid head");
        return n;
      }));
      if ((heads[0] > heads[1] ? heads[0] - heads[1] : heads[1] - heads[0]) > 10n) throw Error("Head disagreement");
      const blockNumber = (heads[0] < heads[1] ? heads[0] : heads[1]) - 20n;
      const observe = async (c: PublicClient) => {
        const block = await c.getBlock({ blockNumber });
        if (block.number !== blockNumber || !hash(block.hash) || !uint(block.timestamp)) throw Error("Invalid snapshot block");
        const fresh = () => { const age = BigInt(clock()) - block.timestamp * 1000n; if (age < 0n || age > 120_000n) throw Error("Stale claim snapshot"); };
        fresh();
        for(const [token,expected] of [[p.escrow,p.escrowCodeHash],[p.launchToken,p.launchTokenCodeHash],...p.assets.map(a=>[a.token,a.codeHash])] as [Address,Hex][]){
          const code=await c.getCode({address:token,blockNumber});
          if(!code||code.length>262146||!/^0x(?:[0-9a-fA-F]{2})+$/.test(code)||keccak256(code)!==expected)throw Error('Untrusted claim runtime');
        }
        const read=(functionName:'governor'|'guardian'|'launchToken'|'paused')=>c.readContract({address:p.escrow,abi:COUNTER_CLAIM_ABI,functionName,blockNumber});
        if((await read('governor') as string)?.toLowerCase()!==p.governor||(await read('guardian') as string)?.toLowerCase()!==p.guardian||(await read('launchToken') as string)?.toLowerCase()!==p.launchToken||await read('paused')!==false)throw Error('Claim escrow policy or pause mismatch');
        const rows=[],totals=new Map<string,bigint>(),remainingTotals=new Map<string,bigint>();
        for(const id of p.rounds){
          const round=await c.readContract({address:p.escrow,abi:COUNTER_CLAIM_ABI,functionName:'rounds',args:[BigInt(id)],blockNumber});
          const amount=await c.readContract({address:p.escrow,abi:COUNTER_CLAIM_ABI,functionName:'claimable',args:[BigInt(id),p.recipient],blockNumber});
          const [rawAsset,funded,remaining,allocationHash]=round,asset=typeof rawAsset==='string'?rawAsset.toLowerCase():'';
          if(!address(asset)||!p.assets.some(a=>a.token===asset)||!uint(funded)||funded===0n||!uint(remaining)||remaining>funded||!uint(amount)||amount===0n||amount>remaining||!hash(allocationHash))throw Error('Invalid claim entitlement');
          const sum=(totals.get(asset)??0n)+amount;if(sum>UINT)throw Error('Claim sum overflow');totals.set(asset,sum);const left=(remainingTotals.get(asset)??0n)+remaining;if(left>UINT)throw Error('Remaining sum overflow');remainingTotals.set(asset,left);
          rows.push({round:id,asset,amount:amount.toString(),funded:funded.toString(),remaining:remaining.toString(),allocationHash});
        }
        if(totals.size!==p.assets.length)throw Error('Unused claim asset policy');
        const backing=[];
        for(const a of p.assets){
          const pin=await c.readContract({address:p.escrow,abi:COUNTER_CLAIM_ABI,functionName:'assetCodeHash',args:[a.token],blockNumber});
          const reserved=await c.readContract({address:p.escrow,abi:COUNTER_CLAIM_ABI,functionName:'reserved',args:[a.token],blockNumber});
          const balance=await c.readContract({address:a.token,abi:TOKEN,functionName:'balanceOf',args:[p.escrow],blockNumber});
          if(pin!==a.codeHash||!uint(reserved)||reserved<remainingTotals.get(a.token)!||!uint(balance)||balance<reserved)throw Error('Claim backing or asset pin mismatch');
          backing.push({asset:a.token,selectedAmount:totals.get(a.token)!.toString(),selectedRemaining:remainingTotals.get(a.token)!.toString(),reserved:reserved.toString(),balance:balance.toString()});
        }
        const after = await c.getBlock({ blockNumber });
        if (await c.getChainId() !== 97 || after.number !== block.number || after.hash !== block.hash || after.timestamp !== block.timestamp) throw Error("Snapshot changed");
        fresh(); return { blockHash: block.hash, timestamp: block.timestamp.toString(), rows,backing };
      };
      const observations = await Promise.all(readers.map(observe));
      if (JSON.stringify(observations[0]) !== JSON.stringify(observations[1])) throw Error("Claim providers disagree");
      const observedAtMs = clock(), observation = observations[0];
      if (BigInt(observedAtMs) - BigInt(observation.timestamp) * 1000n > 120_000n) throw Error("Stale completed claim snapshot");
      return {schemaVersion:1,chainId:97,escrow:p.escrow,recipient:p.recipient,blockNumber:blockNumber.toString(),blockHash:observation.blockHash,blockTimestamp:observation.timestamp,observedAtMs,
        claims:observation.rows,backing:observation.backing,data:encodeFunctionData({abi:COUNTER_CLAIM_ABI,functionName:'claimMany',args:[p.rounds.map(BigInt),p.recipient]}),
        source:'bounded-two-client-counter-claim-observation',currentAuthorization:null,snapshotBoundCalldata:false,independentProvidersVerified:false,globalSolvencyVerified:false,holderEligibilityVerified:false,feeFundingVerified:false,executionAuthorized:false,fullCounterReadiness:false};
    })(), timeout]);
  } finally { finished = true; clearTimeout(timer); }
}
