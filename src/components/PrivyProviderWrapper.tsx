import { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { polygon } from "viem/chains";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "cmlq6g2dn00760cl2djbh9dfy";

interface PrivyProviderWrapperProps {
  children: ReactNode;
}

export function PrivyProviderWrapper({ children }: PrivyProviderWrapperProps) {
  if (!PRIVY_APP_ID) {
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
        loginMethods: ["email", "google", "twitter"],
        // Default chain is Polygon for predictions
        defaultChain: polygon,
        supportedChains: [polygon],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
          // NOTE: Gas sponsorship is configured in the Privy dashboard
          // and enforced server-side via edge functions. Do NOT add
          // client-side gas policies here.
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
