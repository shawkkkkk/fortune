import { getAddress, isAddress, parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CUSTOM_PAIRS, customPhase } from "@/lib/custom-pairs";
import { CUSTOM_PAIR_CURVE_ABI, CUSTOM_PAIR_FACTORY_ABI, SOCIAL_FEE_VAULT_ABI } from "@/lib/custom-pairs-artifacts";
import { customPairClient } from "@/lib/custom-pairs-read";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import {
  SOCIAL_FEE_RULES,
  toIdentity,
  walletIdentityOf,
  type IdentityTuple,
  type SocialBalance,
  type SocialCurveShare,
  type SocialIdentity,
} from "@/lib/social-fees";

// Server-only: reads the social fee vault and holds the verifier's signing key.
// FORTUNE_SOCIAL_ATTESTOR_PRIVATE_KEY is a server environment variable. It is
// never sent to the browser, logged or returned; only its address is public.

const ERC20 = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const ZERO = "0x0000000000000000000000000000000000000000";

export function attestorAccount() {
  const raw = process.env.FORTUNE_SOCIAL_ATTESTOR_PRIVATE_KEY?.trim();
  if (!raw || !/^0x[0-9a-fA-F]{64}$/.test(raw)) return null;
  try {
    return privateKeyToAccount(raw as Hex);
  } catch {
    return null;
  }
}

let vaultCache: { address: Address | null; at: number } | null = null;

/** The vault the custom-pair factory routes split launches to. */
export async function socialVaultAddress(rpc: PublicClient = customPairClient()): Promise<Address | null> {
  if (!CUSTOM_PAIRS.enabled || !CUSTOM_PAIRS.factory) return null;
  if (vaultCache && Date.now() - vaultCache.at < 60_000) return vaultCache.address;
  const value = (await rpc.readContract({ address: CUSTOM_PAIRS.factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "socialFeeVault" })) as Address;
  const address = value && value !== ZERO ? getAddress(value) : null;
  vaultCache = { address, at: Date.now() };
  return address;
}

export async function readIdentity(vault: Address, identityId: Hex, fallback?: { platform: number; account: string }, rpc = customPairClient()) {
  const raw = (await rpc.readContract({ address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "identityOf", args: [identityId] })) as IdentityTuple;
  return toIdentity(raw, fallback);
}

async function tokenMeta(rpc: PublicClient, token: Address) {
  const [symbol, decimals] = await Promise.all([
    rpc.readContract({ address: token, abi: ERC20, functionName: "symbol" }).catch(() => "TOKEN"),
    rpc.readContract({ address: token, abi: ERC20, functionName: "decimals" }).catch(() => 18),
  ]);
  return { symbol: String(symbol).slice(0, 32), decimals: Number(decimals) };
}

/** Everything the claims page shows for one identity. */
export async function readIdentityDetail(vault: Address, identity: SocialIdentity, rpc = customPairClient()) {
  const limit = 50n;
  const [tokens, curves] = await Promise.all([
    identity.tokenCount
      ? (rpc.readContract({ address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "tokensOf", args: [identity.identityId, 0n, limit] }) as Promise<Address[]>)
      : Promise.resolve([] as Address[]),
    identity.curveCount
      ? (rpc.readContract({ address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "curvesOf", args: [identity.identityId, 0n, limit] }) as Promise<Address[]>)
      : Promise.resolve([] as Address[]),
  ]);

  const balances: SocialBalance[] = await Promise.all(
    tokens.map(async (token) => {
      const [owed, claimable, meta] = await Promise.all([
        rpc.readContract({ address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "owed", args: [identity.identityId, token] }) as Promise<bigint>,
        rpc.readContract({ address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "claimable", args: [identity.identityId, token] }) as Promise<bigint>,
        tokenMeta(rpc, token),
      ]);
      return { token, ...meta, owed: owed.toString(), claimable: claimable.toString() };
    })
  );

  const curveShares: SocialCurveShare[] = await Promise.all(
    curves.map(async (curve) => {
      const [shares, state, launchToken, rescueCreatorClaims] = await Promise.all([
        rpc.readContract({ address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "curveSharesOf", args: [curve] }) as Promise<readonly [Address, readonly Hex[], readonly number[]]>,
        rpc.readContract({ address: curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "state" }) as Promise<{ phase: number; creatorFeesOwed: bigint }>,
        rpc.readContract({ address: curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "launchToken" }) as Promise<Address>,
        rpc.readContract({ address: curve, abi: CUSTOM_PAIR_CURVE_ABI, functionName: "rescueCreatorClaims" }) as Promise<bigint>,
      ]);
      const [pairToken, ids, bps] = shares;
      const index = ids.findIndex((id) => id.toLowerCase() === identity.identityId.toLowerCase());
      const shareBps = index >= 0 ? Number(bps[index]) : 0;
      const phase = customPhase(state.phase);
      const pending = phase === "Rescued" ? rescueCreatorClaims : state.creatorFeesOwed;
      const [name, symbol, pairMeta] = await Promise.all([
        rpc.readContract({ address: launchToken, abi: ERC20, functionName: "name" }).catch(() => ""),
        rpc.readContract({ address: launchToken, abi: ERC20, functionName: "symbol" }).catch(() => ""),
        tokenMeta(rpc, pairToken),
      ]);
      return {
        curve,
        launchToken,
        name: String(name).slice(0, 64),
        symbol: String(symbol).slice(0, 16),
        pairToken,
        pairSymbol: pairMeta.symbol,
        pairDecimals: pairMeta.decimals,
        shareBps,
        phase,
        uncollected: ((pending * BigInt(shareBps)) / BigInt(SOCIAL_FEE_RULES.bps)).toString(),
      };
    })
  );

  return { balances, curves: curveShares, curvesTruncated: identity.curveCount > curves.length };
}

/** Identities a wallet is bound to now, or has a binding waiting for. */
export async function readWalletIdentities(vault: Address, wallet: Address, rpc = customPairClient()) {
  const ids = (await rpc.readContract({
    address: vault,
    abi: SOCIAL_FEE_VAULT_ABI,
    functionName: "identitiesOfWallet",
    args: [wallet, 0n, 50n],
  })) as Hex[];
  const walletId = walletIdentityOf(wallet);
  const unique = [...new Set([walletId, ...ids].map((id) => id.toLowerCase() as Hex))];
  const identities = await Promise.all(unique.map((id) => readIdentity(vault, id, undefined, rpc)));
  const lower = wallet.toLowerCase();
  return identities.filter(
    (identity) => identity.exists && (identity.wallet?.toLowerCase() === lower || identity.pendingWallet?.toLowerCase() === lower)
  );
}

export async function readSocialStatus(rpc = customPairClient()) {
  const signer = attestorAccount();
  const base = {
    chainId: FORTUNE_NETWORK.chainId,
    beta: true as const,
    audited: false as const,
    factory: CUSTOM_PAIRS.factory,
    serverAttestor: signer?.address ?? null,
    rules: SOCIAL_FEE_RULES,
  };
  if (!CUSTOM_PAIRS.enabled) return { ...base, enabled: false, vault: null, vaultAttestor: null, bindingsPaused: null, ready: false };
  const vault = await socialVaultAddress(rpc);
  if (!vault) return { ...base, enabled: false, vault: null, vaultAttestor: null, bindingsPaused: null, ready: false };
  const [vaultAttestor, bindingsPaused] = await Promise.all([
    rpc.readContract({ address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "attestor" }) as Promise<Address>,
    rpc.readContract({ address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "bindingsPaused" }) as Promise<boolean>,
  ]);
  const ready = Boolean(signer && vaultAttestor.toLowerCase() === signer.address.toLowerCase() && !bindingsPaused);
  return { ...base, enabled: true, vault, vaultAttestor: vaultAttestor === ZERO ? null : vaultAttestor, bindingsPaused, ready };
}

export function parseWallet(value: string | null | undefined): Address | null {
  const trimmed = (value || "").trim();
  return isAddress(trimmed) && !/^0x0{40}$/i.test(trimmed) ? getAddress(trimmed) : null;
}
