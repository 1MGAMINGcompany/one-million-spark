import { ConnectButton } from "thirdweb/react";
import { inAppWallet, createWallet } from "thirdweb/wallets";
import { polygon } from "thirdweb/chains";
import { thirdwebClient } from "@/lib/thirdwebClient";

// Configure wallets with Smart Account + Gas Sponsorship
const wallets = [
  // Primary: In-App Wallet with Smart Account (gasless)
  inAppWallet({
    auth: {
      options: ["email", "passkey", "google", "apple", "facebook"],
    },
    smartAccount: {
      chain: polygon,
      sponsorGas: true, // Enable gas sponsorship
    },
  }),
  // Secondary: MetaMask (will show warning about POL gas)
  createWallet("io.metamask"),
];

export function SmartWalletButton() {
  return (
    <ConnectButton
      client={thirdwebClient}
      wallets={wallets}
      chain={polygon}
      connectModal={{
        title: "Connect to 1M Gaming",
        titleIcon: "",
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
