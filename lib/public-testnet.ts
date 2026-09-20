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
    factory: "0x70641975E43c5807621146874022fd9d1b735AA1",
    taxFactory: "0xB4510F1F134B0582298934fdFbCc77bECED8d0f5",
    registry: "0x49eb59EB418b4552F56791ECe81338769e90fa19",
    poolRegistry: "0x7ac440219A1475Bdd0F1C88e1d4f8E1CA80Ecf35",
    graduationAdapter: "0x474f13dF3179cE7f26b3b3344b3E74643f6ebe2F",
    liquidityLocker: "0xa502027AC3e7BF732ecce3108837837aC3559304",
    taxGraduationAdapter: "0xAA1B2d5ebB6A5f212E1b7bDCd975cf866b2739Fb",
    taxLiquidityLocker: "0xB03ff39306449ab42bb8Af2CFF25B28B4E6E76e2",
    mockQuote: "0x1bDcF1500866E273Cb11E99cC1832Aa2436Db17d",
    referenceCurve: "0xE768cc50dC03Bf9CF838953a4b76057D63D8995D",
    referenceToken: "0xF2A934B924C50566eCAB90ea8D5644378237D9fE",
    referencePool: "0xB2B28583bE3A47D1E147d2C5E8624594Edf7FaA1",
    pancakeV2Factory: "0xB7926C0430Afb07AA7DEfDE6DA862aE0Bde767bc",
    pancakeV2Router: "0x9ac64cc6e4415144c455bd8e4837fea55603e5c3",
    pancakeV3Factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
    pancakeV3PositionManager: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
    referenceTaxToken: "0x586C005C7D82d2255Ee82Cbf3047743290e67Ffe",
    referenceTaxCurve: "0x16912134E11db9EbEE26E1259F3e67722c4Fbb18",
    referenceTaxPool: "0xd5810cA5042154A756bd08E7702AE9945f977925",
  },
  referenceLpTokenId: 37523 [3.752e4],
} as const;

export function publicTestnetAddress(
  configured: string | undefined,
  fallback: string
) {
  return configured?.trim() || fallback;
}
