import { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createWeb3Modal } from "@web3modal/wagmi/react";
import { wagmiConfig } from "@/lib/wagmi-config";

// Initialize Web3Modal
createWeb3Modal({
  wagmiConfig,
  projectId: "3a8170812b534d0ff9d794f19a901d64",
  themeMode: "light",
  themeVariables: {
    "--w3m-accent": "hsl(222.2, 47.4%, 11.2%)",
  },
});

const queryClient = new QueryClient();

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
