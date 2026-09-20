export const PUBLIC_TESTNET = {
  chainId: 97,
  chainHex: "0x61",
  chainName: "BNB Smart Chain Testnet",
  nativeSymbol: "tBNB",
  rpcUrl: "https://bsc-testnet-dataseed.bnbchain.org",
  fallbackRpcUrl: "https://bsc-testnet.bnbchain.org",
  explorerUrl: "https://testnet.bscscan.com",
  faucetUrl: "https://www.bnbchain.org/en/testnet-faucet",
  contracts: {
    factory: "0x9Eac6c6CdA0A19cbb0f8Abc51Ee968545E6EB415",
    registry: "0x943176d26A332F4687d52695fe9625866c2c3A67",
    graduationAdapter: "0xF666487e58dEFB8584C7eAa2378DEe1BbAbe012C",
    liquidityLocker: "0x861Deb497eA845dda8727B11462d11Abe34E2AE8",
    mockQuote: "0x871356a53Dd988EFDAa82261c9d212Ac08988fd0",
    referenceCurve: "0x5E7967bde6286aE030bFd45FbB8650df221F22e9",
    referenceToken: "0xC27aF82E8A228a0167FbE1673CaD13cD35Ee16Fe",
    referencePool: "0x5c9fAB9ee5286fE5c071Bd547f9B308a550FA50f",
    pancakeV3Factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
    pancakeV3PositionManager: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
  },
  referenceLpTokenId: 37496,
} as const;

export function publicTestnetAddress(
  configured: string | undefined,
  fallback: string
) {
  return configured?.trim() || fallback;
}
