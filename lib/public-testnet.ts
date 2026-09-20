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
    referenceCurve: "0x48A7353F28e5A237bdA85E73217cc670fCf58e17",
    referenceToken: "0xDCb92C2B3062F246D93a0BF1712c17a2Be4d39FE",
    referencePool: "0xFBDC7FF79687F4F3866Ed586E52F98c7C992608f",
    pancakeV2Factory: "0xB7926C0430Afb07AA7DEfDE6DA862aE0Bde767bc",
    pancakeV2Router: "0x9ac64cc6e4415144c455bd8e4837fea55603e5c3",
    pancakeV3Factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
    pancakeV3PositionManager: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
    referenceTaxToken: "0x99801f077Ecca030898664c7708Ba9857b8E5EFe",
    referenceTaxCurve: "0xb7f86e7E71Fc08E1c3cC4306DC33684D88e4019d",
    referenceTaxPool: "0xB13F241D37Ea74854a8D45bF195cFcd6342535d6",
  },
  referenceLpTokenId: 37520,
} as const;

export function publicTestnetAddress(
  configured: string | undefined,
  fallback: string
) {
  return configured?.trim() || fallback;
}
