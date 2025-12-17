import { ConnectButton } from "thirdweb/react";
import { createWallet } from "thirdweb/wallets";
import { polygon } from "thirdweb/chains";
import { thirdwebClient } from "@/lib/thirdwebClient";

// ONLY MetaMask + WalletConnect - converted to Smart Account with sponsored gas
const wallets = [
  createWallet("io.metamask"),
  createWallet("walletConnect"),
];

export function SmartWalletButton() {
  return (
    <ConnectButton
      client={thirdwebClient}
      wallets={wallets}
      chain={polygon}
      accountAbstraction={{
        chain: polygon,
        sponsorGas: true,
      }}
      connectModal={{
        title: "Connect to 1M Gaming",
        size: "compact",
        showThirdwebBranding: false,
      }}
      appMetadata={{
        name: "1M Gaming",
        url: "https://1mgaming.com",
        description: "Premium Skill Gaming Platform",
      }}
      theme="dark"
      connectButton={{
        label: "Connect Wallet",
        style: {
          backgroundColor: "hsl(var(--primary))",
          color: "hsl(var(--primary-foreground))",
          borderRadius: "0.375rem",
          padding: "0.5rem 1rem",
          fontSize: "0.875rem",
          fontWeight: "500",
        },
      }}
      detailsButton={{
        style: {
          backgroundColor: "transparent",
          border: "1px solid hsl(var(--primary) / 0.3)",
          borderRadius: "0.375rem",
          padding: "0.5rem 1rem",
          fontSize: "0.875rem",
        },
      }}
    />
  );
}
