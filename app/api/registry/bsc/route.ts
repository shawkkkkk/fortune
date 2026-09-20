import { NextResponse } from "next/server";

export const revalidate = 3600;

const PANCAKE_EXTENDED =
  "https://tokens.pancakeswap.finance/pancakeswap-extended.json";

type PancakeToken = {
  name: string;
  symbol: string;
  address: string;
  chainId: number;
  decimals: number;
  logoURI?: string;
};

type PancakeList = {
  name?: string;
  tokens?: PancakeToken[];
};

export async function GET() {
  try {
    const response = await fetch(PANCAKE_EXTENDED, {
      next: { revalidate: 3600 },
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error("PancakeSwap token list unavailable");
    }

    const data = (await response.json()) as PancakeList;
    const seen = new Set<string>();

    const tokens = (data.tokens || [])
      .filter((token) => token.chainId === 56)
      .filter((token) => {
        const key = token.address.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 400)
      .map((token) => ({
        ...token,
        source: "PancakeSwap extended token list",
        fortuneStatus: "candidate",
        capabilities: [],
        warning:
          "Discovery candidate only. Fortune quote/reward capabilities require registry approval, oracle coverage and compatibility checks.",
      }));

    return NextResponse.json({
      chainId: 56,
      count: tokens.length,
      source: PANCAKE_EXTENDED,
      ranked: false,
      note:
        "This is a discovery catalog, not a market-cap ranking. Production Fortune approval is a separate onchain registry decision.",
      tokens,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Registry discovery failed",
      },
      { status: 502 }
    );
  }
}
