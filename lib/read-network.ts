import { isAddress, zeroAddress } from "viem";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

// Read-only proofs must work while production launch creation is paused.
// Never use this condition to enable wallet signing or construct transactions.
export function readNetworkConfigured(chainId: number, factory: string, registry: string) {
  return (chainId === 56 || chainId === 97) &&
    isAddress(factory) && isAddress(registry) &&
    factory.toLowerCase() !== zeroAddress && registry.toLowerCase() !== zeroAddress;
}

export const FORTUNE_READ_NETWORK_CONFIGURED = readNetworkConfigured(
  FORTUNE_NETWORK.chainId, FORTUNE_NETWORK.contracts.factory, FORTUNE_NETWORK.contracts.registry
);
