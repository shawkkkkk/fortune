"use client";

import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  type Address,
  type EIP1193Provider,
} from "viem";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

// Browser-wallet helpers for pages that sign transactions. Mirrors the checks
// the Standard launch page makes: right account, right chain, then sign.

export const walletChain = defineChain({
  id: FORTUNE_NETWORK.chainId,
  name: FORTUNE_NETWORK.chainName,
  nativeCurrency: { name: FORTUNE_NETWORK.nativeSymbol, symbol: FORTUNE_NETWORK.nativeSymbol, decimals: 18 },
  rpcUrls: { default: { http: [FORTUNE_NETWORK.publicRpcUrl] } },
  blockExplorers: { default: { name: "BscScan", url: FORTUNE_NETWORK.explorerUrl } },
  testnet: !FORTUNE_NETWORK.isMainnet,
});

export function injectedProvider() {
  const injected = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!injected) throw new Error("No EVM wallet found. Install MetaMask or another BNB Chain wallet.");
  return injected;
}

/** Asks for an account and switches to the active Fortune network. */
export async function connectWallet(): Promise<Address> {
  const ethereum = injectedProvider();
  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as Address[];
  if (!accounts?.[0]) throw new Error("The wallet did not return an account.");
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: FORTUNE_NETWORK.chainHex }] });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? Number((error as { code?: number }).code) : 0;
    if (code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: FORTUNE_NETWORK.chainHex,
          chainName: FORTUNE_NETWORK.chainName,
          nativeCurrency: { name: FORTUNE_NETWORK.nativeSymbol, symbol: FORTUNE_NETWORK.nativeSymbol, decimals: 18 },
          rpcUrls: [FORTUNE_NETWORK.publicRpcUrl],
          blockExplorerUrls: [FORTUNE_NETWORK.explorerUrl],
        },
      ],
    });
  }
  const active = await ethereum.request({ method: "eth_chainId" });
  if (String(active).toLowerCase() !== FORTUNE_NETWORK.chainHex.toLowerCase()) {
    throw new Error("The wallet did not switch to " + FORTUNE_NETWORK.chainName + ". Nothing was submitted.");
  }
  return accounts[0];
}

/** Account already connected to this site, without prompting. */
export async function connectedAccount(): Promise<Address | null> {
  const injected = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!injected) return null;
  const accounts = (await injected.request({ method: "eth_accounts" }).catch(() => [])) as Address[];
  return accounts?.[0] ?? null;
}

export function walletClients(account: Address) {
  const transport = custom(injectedProvider());
  return {
    publicClient: createPublicClient({ chain: walletChain, transport }),
    walletClient: createWalletClient({ account, chain: walletChain, transport }),
  };
}

/** The most useful line from a viem error: a contract's revert reason when there is one. */
export function walletErrorMessage(error: unknown, fallback = "The transaction did not go through.") {
  if (error instanceof BaseError) {
    const revert = error.walk((item) => item instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const reason = revert.data?.errorName && revert.data.errorName !== "Error" ? revert.data.errorName : revert.reason;
      if (reason) return reason;
    }
    if (/user rejected|denied/i.test(error.message)) return "You rejected the request in your wallet.";
    return error.shortMessage || fallback;
  }
  if (error instanceof Error) return /user rejected|denied/i.test(error.message) ? "You rejected the request in your wallet." : error.message;
  return fallback;
}
