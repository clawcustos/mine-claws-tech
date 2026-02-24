"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// Public-client only config — no wallet connectors, no RainbowKit
// This site is an agent-protocol observer dashboard, not a user wallet dApp
export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(
      process.env.NEXT_PUBLIC_ALCHEMY_URL ||
      "https://base-mainnet.g.alchemy.com/v2/yl0eEel9mhO_P_ozpzdtZ"
    )
  },
  connectors: [],
  ssr: false,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
