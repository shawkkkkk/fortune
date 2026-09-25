export const STANDARD_MAINNET_QUOTE = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
export type PairPolicyInput = {
  address: string; active: boolean; healthy: boolean; quoteEnabled: boolean; graduationEnabled: boolean;
};
export function pairEligibility(asset: PairPolicyInput | undefined, chainId: number) {
  const reasons: string[] = [];
  if (chainId !== 56 && chainId !== 97) reasons.push("UNSUPPORTED_CHAIN");
  if (!asset) reasons.push("NOT_IN_ACTIVE_REGISTRY");
  else {
    if (!asset.active) reasons.push("ASSET_INACTIVE");
    if (!asset.healthy) reasons.push("ORACLE_UNHEALTHY");
    if (!asset.quoteEnabled) reasons.push("QUOTE_DISABLED");
    if (!asset.graduationEnabled) reasons.push("GRADUATION_DISABLED");
    if (chainId === 56 && asset.address.toLowerCase() !== STANDARD_MAINNET_QUOTE) reasons.push("STANDARD_MAINNET_WBNB_ONLY");
  }
  return { eligible: reasons.length === 0, reasons };
}
