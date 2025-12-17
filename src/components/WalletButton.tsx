import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  return (
    <WalletMultiButton 
      style={{
        backgroundColor: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
        borderRadius: "0.5rem",
        fontSize: "0.875rem",
        height: "2.25rem",
        padding: "0 1rem",
      }}
    />
  );
}
