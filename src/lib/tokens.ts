import { formatUnits, type Address } from "viem";

export type TokenSymbol = "eUSDC" | "eUSDT" | "ePYUSD";

export interface Fherc20Token {
  symbol: TokenSymbol;
  name: string;
  address: Address;
  underlying: string;
  decimals: number;
  faucetNote: string;
}

export const supportedTokens = [
  {
    symbol: "eUSDC",
    name: "FHERC20 Wrapped mockUSDC",
    address: "0x0f3521fFe4246fA4285ea989155A7e4607C55f17",
    underlying: "mockUSDC",
    decimals: 6,
    faucetNote: "Get or mint mockUSDC through Redact/zOrbital resources, then shield it into eUSDC.",
  },
  {
    symbol: "eUSDT",
    name: "FHERC20 Wrapped mockUSDT",
    address: "0x7943Eee6ABaD45A583E2aBEeA6Eb9CB18b4b6987",
    underlying: "mockUSDT",
    decimals: 6,
    faucetNote: "Get or mint mockUSDT through Redact/zOrbital resources, then shield it into eUSDT.",
  },
  {
    symbol: "ePYUSD",
    name: "FHERC20 Wrapped mockPYUSD",
    address: "0x79Ba1D402d4B6f6334A084A2637B38a89F74a7Bc",
    underlying: "mockPYUSD",
    decimals: 6,
    faucetNote: "Get or mint mockPYUSD through Redact/zOrbital resources, then shield it into ePYUSD.",
  },
] as const satisfies readonly Fherc20Token[];

export const defaultToken = supportedTokens[0];

export function getToken(symbol: string) {
  return supportedTokens.find(token => token.symbol === symbol) || defaultToken;
}

export function tokenLabel(symbol: string) {
  const token = getToken(symbol);
  return `${token.symbol} confidential token`;
}

export function tokenDecimals(symbol: string) {
  return getToken(symbol).decimals;
}

export function tokenAddress(symbol: string) {
  return getToken(symbol).address;
}

export function formatTokenAmount(value: bigint, symbol: string) {
  const token = getToken(symbol);
  return `${formatUnits(value, token.decimals)} ${token.symbol}`;
}
