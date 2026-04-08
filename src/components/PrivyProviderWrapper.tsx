import { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { polygon } from "viem/chains";
import { isPrivyConfigured, PRIVY_APP_ID } from "@/lib/privyConfig";
import { dbg } from "@/lib/debugLog";

interface PrivyProviderWrapperProps {
  children: ReactNode;
}

console.info(`[Privy] configured=${isPrivyConfigured}, appId=${PRIVY_APP_ID ? "set" : "missing"}`);

export function PrivyProviderWrapper({ children }: PrivyProviderWrapperProps) {
  if (!isPrivyConfigured || !PRIVY_APP_ID) {
    dbg("privy:provider:missing_app_id", {
      origin: typeof window !== "undefined" ? window.location.origin : "ssr",
    });
    console.warn("[PrivyProviderWrapper] VITE_PRIVY_APP_ID is not set — Privy auth disabled.");
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          showWalletLoginFirst: false,
          logo: `${window.location.origin}/images/privy-logo.png`,
        },
        defaultChain: polygon,
        supportedChains: [polygon],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <SmartWalletsProvider>
        {children}
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}
