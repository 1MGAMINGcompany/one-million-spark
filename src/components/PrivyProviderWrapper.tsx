import { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "cmlq6g2dn00760cl2djbh9dfy";

interface PrivyProviderWrapperProps {
  children: ReactNode;
}

export function PrivyProviderWrapper({ children }: PrivyProviderWrapperProps) {
  // If no Privy app ID configured, just render children without the provider
  if (!PRIVY_APP_ID) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          walletChainType: "solana-only",
          showWalletLoginFirst: false,
        },
        loginMethods: ["email", "google", "apple"],
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
        externalWallets: {
          solana: {
            connectors: [] as any,
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
