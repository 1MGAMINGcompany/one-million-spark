import { ReactNode, useEffect, useState } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { polygon } from "viem/chains";
import { fetchPrivyAppId } from "@/lib/privyConfig";

interface PrivyProviderWrapperProps {
  children: ReactNode;
}

export function PrivyProviderWrapper({ children }: PrivyProviderWrapperProps) {
  const [appId, setAppId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPrivyAppId().then((id) => {
      setAppId(id);
      setLoading(false);
    });
  }, []);

  if (loading || !appId) {
    if (!loading && !appId) {
      console.warn("[PrivyProviderWrapper] No Privy App ID available — auth disabled.");
    }
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          showWalletLoginFirst: false,
          logo: `${window.location.origin}/images/privy-logo.webp`,
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
