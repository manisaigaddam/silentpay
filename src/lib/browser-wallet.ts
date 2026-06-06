import { createPublicClient, createWalletClient, custom, http, type Address } from "viem";
import { baseSepolia as baseSepoliaChain } from "viem/chains";
import { baseSepolia } from "./silentpay";

export function createBrowserPaymentClients(provider: unknown, account: Address) {
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || baseSepolia.rpcUrl;

  return {
    publicClient: createPublicClient({
      chain: baseSepoliaChain,
      transport: http(rpcUrl),
    }),
    walletClient: createWalletClient({
      account,
      chain: baseSepoliaChain,
      transport: custom(provider as Parameters<typeof custom>[0]),
    }),
  };
}
