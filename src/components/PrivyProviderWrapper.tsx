import { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { polygon } from "viem/chains";
import { toast } from "sonner";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "cmlq6g2dn00760cl2djbh9dfy";

interface PrivyProviderWrapperProps {
  children: ReactNode;
}

function handlePrivyError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error("[Privy] Auth error:", msg, error);

  if (msg.includes("origin") || msg.includes("domain") || msg.includes("cookie")) {
    toast.error("Login failed: this domain is not configured. Please contact support.");
  } else if (msg.includes("popup") || msg.includes("blocked")) {
    toast.error("Login popup was blocked. Please allow popups and try again.");
  } else {
    toast.error("Login failed. Please try again or use a different browser.");
  }
}

export function PrivyProviderWrapper({ children }: PrivyProviderWrapperProps) {
  if (!PRIVY_APP_ID) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      onError={handlePrivyError}
      config={{
        appearance: {
          showWalletLoginFirst: false,
          logo: `${window.location.origin}/images/privy-logo.png`,
        },
        loginMethods: ["email", "google", "twitter"],
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
