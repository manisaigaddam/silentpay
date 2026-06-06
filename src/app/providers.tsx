"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { baseSepolia } from "@/lib/silentpay";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || baseSepolia.rpcUrl;

const chain = {
  id: baseSepolia.id,
  name: baseSepolia.name,
  network: "base-sepolia",
  nativeCurrency: {
    name: baseSepolia.currency,
    symbol: baseSepolia.currency,
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [rpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "BaseScan",
      url: baseSepolia.explorer,
    },
  },
  testnet: true,
} as const;

export function Providers({ children }: { children: React.ReactNode }) {
  if (!appId) {
    return children;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "sms", "wallet", "google"],
        appearance: {
          theme: "dark",
          accentColor: "#ff6a3d",
        },
        defaultChain: chain,
        supportedChains: [chain],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
