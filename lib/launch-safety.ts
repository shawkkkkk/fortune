import { parseUnits, type Address, type EIP1193Provider, type Hex } from "viem";

export function parseLaunchAmount(label: string, value: string, decimals = 18) {
  const clean = value.trim() || "0";
  if (!/^\d+(?:\.\d+)?$/.test(clean)) throw new Error(label + " must be a non-negative decimal number.");
  if ((clean.split(".")[1] || "").length > decimals) throw new Error(label + " has too many decimal places.");
  const amount = parseUnits(clean, decimals);
  if (amount >= 2n ** 256n) throw new Error(label + " exceeds the contract amount limit.");
  return amount;
}

export async function assertWalletIdentity(provider: EIP1193Provider, account: Address, chainId: number) {
  const activeChain = await provider.request({ method: "eth_chainId" });
  const accounts = await provider.request({ method: "eth_accounts" }) as string[];
  if (Number(activeChain) !== chainId) throw new Error("Wallet network changed. Review the launch again before signing.");
  if (!accounts[0] || accounts[0].toLowerCase() !== account.toLowerCase()) throw new Error("Wallet account changed. Review the launch again before signing.");
}

export type PendingLaunch = { hash: Hex; account: Address; chainId: number; factory: Address };

export function restorePendingLaunch(raw: string | null, chainId: number, factory: string): PendingLaunch | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value.chainId !== chainId || typeof value.factory !== "string" || value.factory.toLowerCase() !== factory.toLowerCase()) return null;
    if (!/^0x[a-fA-F0-9]{64}$/.test(value.hash) || !/^0x[a-fA-F0-9]{40}$/.test(value.account)) return null;
    return value;
  } catch { return null; }
}
