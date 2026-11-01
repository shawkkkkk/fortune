import { decodeEventLog, encodeEventTopics, encodeFunctionData, keccak256, parseAbi, type Address, type Hex, type PublicClient } from "viem";

export const PERMANENT_BURN_ABI = parseAbi([
  "function burn(uint256 amount)", "function deploymentChainId() view returns(uint256)",
  "function launchManifestHash() view returns(bytes32)", "function permanentlyBurned() view returns(uint256)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "event PermanentBurn(address indexed holder,uint256 amount)",
]);
export type PermanentBurnPolicy = { chainId: 97 | 84532 | 11155111; token: Address; runtimeHash: Hex; manifestHash: Hex; holder: Address; amount: string; transactionHash: Hex };
export const VAULT_BURN_ABI = parseAbi([
  "function burn(uint128 amount)", "function token() view returns(address)",
  "function runtimeHash() view returns(bytes32)", "function manifestHash() view returns(bytes32)",
  "function maxPerBurn() view returns(uint128)", "function paused() view returns(bool)",
  "function totalBurned() view returns(uint256)", "function burnCount() view returns(uint256)",
  "event InventoryBurned(uint256 indexed sequence,address indexed caller,uint256 amount,uint256 cumulative)",
]);
export type VaultBurnPolicy = Omit<PermanentBurnPolicy, "chainId" | "holder"> & { chainId: 97; vault: Address; vaultRuntimeHash: Hex; caller: Address };
/** Existing direct-burn semantics: exactly two token events, no outer vault call. */
export async function inspectPermanentBurn(clients: readonly [PublicClient,PublicClient], policy: PermanentBurnPolicy) {
  return inspectBurn(clients, policy);
}
/** Separate pinned chain97 inventory-vault observation; no fee-origin or buyback claim. */
export async function inspectVaultPermanentBurn(clients: readonly [PublicClient,PublicClient], policy: VaultBurnPolicy) {
  const v = structuredClone(policy);
  if (!v || v.chainId !== 97 || !address(v.vault) || !address(v.caller) || !hash(v.vaultRuntimeHash)
    || same(v.vault,v.token) || same(v.caller,v.vault) || same(v.caller,v.token)) throw Error("Reviewed vault burn policy required");
  if (typeof v.amount !== "string" || !/^[1-9][0-9]{0,38}$/.test(v.amount) || BigInt(v.amount) >= 1n << 128n) throw Error("Vault burn amount invalid");
  return inspectBurn(clients, { ...v, holder:v.vault }, v);
}
const ZERO = "0x0000000000000000000000000000000000000000";
const hash = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v) && !/^0x0{64}$/i.test(v);
const address = (v: unknown): v is Address => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) && v.toLowerCase() !== ZERO;
const same = (v: unknown, w: string) => typeof v === "string" && v.toLowerCase() === w.toLowerCase();
/** RPC observations of one direct burn; not a durable ledger, badge, finality or authority. */
async function inspectBurn(clients: readonly [PublicClient, PublicClient], policy: PermanentBurnPolicy, vault?: VaultBurnPolicy) {
  const p = structuredClone(policy);
  if (!p || ![97,84532,11155111].includes(p.chainId) || !address(p.token) || !address(p.holder) || !hash(p.runtimeHash)
    || !hash(p.manifestHash) || !hash(p.transactionHash) || typeof p.amount !== "string" || !/^[1-9][0-9]{0,77}$/.test(p.amount)
    || BigInt(p.amount) >= 1n << 256n) throw Error("Reviewed testnet burn policy required");
  if (clients.length !== 2 || clients[0] === clients[1]) throw Error("Two distinct read clients required");
  const started = Date.now(); let last = started, finished = false, timer: ReturnType<typeof setTimeout> | undefined;
  const time = () => { const now = Date.now(); if (finished || !Number.isSafeInteger(started) || started < 0 || !Number.isSafeInteger(now) || now < last || now - started > 20_000) throw Error("Burn read expired or clock moved backward"); last = now; return now; };
  const action = async <T>(call: () => Promise<T>) => { time(); const v = await call(); time(); return v; };
  const destination = vault ? vault.vault : p.token, caller = vault ? vault.caller : p.holder;
  const observe = async (c: PublicClient, head: bigint) => {
    if (await action(() => c.getChainId()) !== p.chainId) throw Error("Burn chain differs");
    const receipt = () => action(() => c.getTransactionReceipt({ hash: p.transactionHash }));
    const r = await receipt();
    if (!same(r.transactionHash,p.transactionHash) || r.status !== "success" || !hash(r.blockHash) || typeof r.blockNumber !== "bigint" || r.blockNumber < 1n
      || head < r.blockNumber + 20n || !same(r.to,destination) || !same(r.from,caller) || !Number.isSafeInteger(r.transactionIndex) || r.transactionIndex < 0
      || !Array.isArray(r.logs) || r.logs.length !== (vault ? 3 : 2)) throw Error("Confirmed direct burn receipt required");
    const block = () => action(() => c.getBlock({ blockNumber: r.blockNumber }));
    const b = await block();
    if (b.number !== r.blockNumber || !same(b.hash,r.blockHash) || typeof b.timestamp !== "bigint" || b.timestamp < 0n || b.timestamp * 1000n > BigInt(time())
      || !Array.isArray(b.transactions) || !same(b.transactions[r.transactionIndex],p.transactionHash)) throw Error("Burn block differs");
    const tx = await action(() => c.getTransaction({ hash: p.transactionHash }));
    if (!same(tx.hash,p.transactionHash) || !same(tx.blockHash,r.blockHash) || tx.blockNumber !== r.blockNumber || tx.transactionIndex !== r.transactionIndex
      || tx.chainId !== p.chainId || !same(tx.to,destination) || !same(tx.from,caller) || tx.value !== 0n
      || !same(tx.input,encodeFunctionData({ abi: vault ? VAULT_BURN_ABI : PERMANENT_BURN_ABI, functionName: "burn", args: [BigInt(p.amount)] }))) throw Error("Direct burn transaction differs");
    const code = await action(() => c.getCode({ address: p.token, blockNumber: r.blockNumber }));
    if (!code || !/^0x(?:[0-9a-fA-F]{2}){1,131072}$/.test(code) || !same(keccak256(code),p.runtimeHash)) throw Error("Burn runtime differs");
    const read = (functionName: "deploymentChainId" | "launchManifestHash" | "permanentlyBurned") => action(() => c.readContract({ address:p.token,abi:PERMANENT_BURN_ABI,functionName,blockNumber:r.blockNumber }));
    if (await read("deploymentChainId") !== BigInt(p.chainId) || !same(await read("launchManifestHash"),p.manifestHash)) throw Error("Burn identity differs");
    const cumulative = await read("permanentlyBurned");
    if (typeof cumulative !== "bigint" || cumulative < BigInt(p.amount) || cumulative >= 1n << 256n) throw Error("Burn counter invalid");
    let transferIndex = -1, burnIndex = -1;
    for (const log of r.logs.slice(0,2)) {
      if (!same(log.address,p.token) || !same(log.transactionHash,p.transactionHash) || !same(log.blockHash,r.blockHash) || log.blockNumber !== r.blockNumber
        || log.transactionIndex !== r.transactionIndex || log.removed !== false || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0
        || !Array.isArray(log.topics) || log.topics.some(t=>typeof t!=="string" || !/^0x[0-9a-fA-F]{64}$/.test(t))
        || typeof log.data!=="string" || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) throw Error("Burn log binding invalid");
      const event = decodeEventLog({ abi:PERMANENT_BURN_ABI,data:log.data,topics:log.topics,strict:true });
      const expectedTopics = event.eventName === "Transfer"
        ? encodeEventTopics({abi:PERMANENT_BURN_ABI,eventName:"Transfer",args:{from:p.holder,to:ZERO}})
        : encodeEventTopics({abi:PERMANENT_BURN_ABI,eventName:"PermanentBurn",args:{holder:p.holder}});
      if (log.topics.length !== expectedTopics.length || log.topics.some((v,i)=>!same(v,expectedTopics[i] as string))) throw Error("Noncanonical burn topics");
      if (event.eventName === "Transfer" && transferIndex === -1 && log.topics.length === 3
        && same(event.args.from,p.holder) && same(event.args.to,ZERO) && event.args.value === BigInt(p.amount)) transferIndex = log.logIndex;
      else if (event.eventName === "PermanentBurn" && burnIndex === -1 && log.topics.length === 2
        && same(event.args.holder,p.holder) && event.args.amount === BigInt(p.amount)) burnIndex = log.logIndex;
      else throw Error("Permanent burn events differ");
    }
    if (transferIndex < 0 || burnIndex !== transferIndex + 1) throw Error("Permanent burn event ordering differs");
    let vaultEvidence: { vault:string;caller:string;sequence:string;vaultCumulativeAtEvent:string;vaultTotalBurnedAtBlock:string;vaultBurnCountAtBlock:string;inventoryLogIndex:number } | undefined;
    if (vault) {
      const code = await action(() => c.getCode({address:vault.vault,blockNumber:r.blockNumber}));
      if (!code || !/^0x(?:[0-9a-fA-F]{2}){1,131072}$/.test(code) || !same(keccak256(code),vault.vaultRuntimeHash)) throw Error("Vault runtime differs");
      const readVault = (functionName: "token" | "runtimeHash" | "manifestHash" | "maxPerBurn" | "paused" | "totalBurned" | "burnCount") => action(() => c.readContract({address:vault.vault,abi:VAULT_BURN_ABI,functionName,blockNumber:r.blockNumber}));
      if (!same(await readVault("token"),p.token) || !same(await readVault("runtimeHash"),p.runtimeHash)
        || !same(await readVault("manifestHash"),p.manifestHash) || await readVault("paused") !== false
        || await action(() => c.readContract({address:p.token,abi:parseAbi(["function bridgeEnabled() view returns(bool)"]),functionName:"bridgeEnabled",blockNumber:r.blockNumber})) !== false) throw Error("Vault identity differs");
      const maximum = await readVault("maxPerBurn"), total = await readVault("totalBurned"), count = await readVault("burnCount");
      if (typeof maximum !== "bigint" || maximum < BigInt(p.amount) || maximum >= 1n<<128n
        || typeof total !== "bigint" || total < BigInt(p.amount) || total >= 1n<<256n
        || typeof count !== "bigint" || count < 1n || count >= 1n<<256n) throw Error("Vault counters invalid");
      const log = r.logs[2];
      if (!same(log.address,vault.vault) || !same(log.transactionHash,p.transactionHash) || !same(log.blockHash,r.blockHash)
        || log.blockNumber !== r.blockNumber || log.transactionIndex !== r.transactionIndex || log.removed !== false
        || !Number.isSafeInteger(log.logIndex) || log.logIndex !== burnIndex+1
        || r.logs[0].logIndex !== transferIndex || r.logs[1].logIndex !== burnIndex || !Array.isArray(log.topics) || log.topics.length !== 3
        || log.topics.some(t=>typeof t!=="string" || !/^0x[0-9a-fA-F]{64}$/.test(t))
        || typeof log.data!=="string" || !/^0x[0-9a-fA-F]{128}$/.test(log.data)) throw Error("Vault log binding invalid");
      const event = decodeEventLog({abi:VAULT_BURN_ABI,data:log.data,topics:log.topics,strict:true});
      const args = event.args;
      const topics = encodeEventTopics({abi:VAULT_BURN_ABI,eventName:"InventoryBurned",args:{sequence:args.sequence,caller:vault.caller}});
      if (args.amount !== BigInt(p.amount) || !same(args.caller,vault.caller) || args.sequence < 1n || args.sequence > count
        || args.cumulative < args.amount || args.cumulative > total
        || log.topics.some((v,i)=>!same(v,topics[i] as string))) throw Error("Vault burn event differs");
      vaultEvidence = {vault:vault.vault.toLowerCase(),caller:vault.caller.toLowerCase(),sequence:args.sequence.toString(),
        vaultCumulativeAtEvent:args.cumulative.toString(),vaultTotalBurnedAtBlock:total.toString(),vaultBurnCountAtBlock:count.toString(),inventoryLogIndex:log.logIndex};
    }
    const again = await receipt(), after = await block();
    // Recompare all receipt fields consumed above, rather than only its mined status.
    const selected = (v: typeof r) => ({ hash:v.transactionHash,status:v.status,block:v.blockNumber,blockHash:v.blockHash,to:v.to,from:v.from,index:v.transactionIndex,logs:v.logs });
    const stringify = (v: unknown) => JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x);
    if (stringify(selected(again)) !== stringify(selected(r)) || after.number !== b.number || after.hash !== b.hash || after.timestamp !== b.timestamp
      || !same(after.transactions[r.transactionIndex],p.transactionHash) || await action(() => c.getChainId()) !== p.chainId) throw Error("Burn observation changed");
    return { ...(vaultEvidence ? {vaultObservation:vaultEvidence} : {}),chainId:p.chainId,token:p.token.toLowerCase(),holder:p.holder.toLowerCase(),amount:p.amount,transactionHash:p.transactionHash.toLowerCase(),
      blockNumber:r.blockNumber.toString(),blockHash:r.blockHash.toLowerCase(),blockTimestamp:b.timestamp.toString(),burnLogIndex:burnIndex,
      cumulativePermanentBurnAtBlock:cumulative.toString(),evidenceId:`${p.chainId}:${p.token.toLowerCase()}:${p.transactionHash.toLowerCase()}:${burnIndex}` };
  };
  const work = async () => {
    const heads = await Promise.all(clients.map(c=>action(()=>c.getBlockNumber({cacheTime:0}))));
    if (heads.some(h=>typeof h!=="bigint" || h<20n) || (heads[0]>heads[1]?heads[0]-heads[1]:heads[1]-heads[0])>10n) throw Error("Burn provider heads differ");
    const head = heads[0]<heads[1]?heads[0]:heads[1], results = await Promise.all(clients.map(c=>observe(c,head)));
    if (JSON.stringify(results[0])!==JSON.stringify(results[1])) throw Error("Burn providers disagree");
    return Object.freeze({...results[0],observedAtMs:time(),source:vault ? "isolated-oft-vault-permanent-burn-rpc-observation" : "isolated-oft-direct-permanent-burn-rpc-observation",permanentBurnObserved:true,
      transportBurn:false,buybackVerified:false,feeFundingVerified:false,independentProvidersVerified:false,finalityVerified:false,globalSupplyReconciled:false,executionAuthorized:false});
  };
  try { return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{finished=true;reject(Error("Burn observation timed out"));},20_000);})]); }
  finally { finished=true;clearTimeout(timer); }
}
