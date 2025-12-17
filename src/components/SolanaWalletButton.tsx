import { FC } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export const SolanaWalletButton: FC = () => {
  return (
    <WalletMultiButton 
      style={{
        backgroundColor: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
        borderRadius: "0.375rem",
        padding: "0.5rem 1rem",
        fontSize: "0.875rem",
        fontWeight: "500",
        height: "auto",
      }}
    />
  );
};

// Hook to use Solana wallet state
export const useSolanaWallet = () => {
  const wallet = useWallet();
  
  return {
    isConnected: wallet.connected,
    address: wallet.publicKey?.toBase58() || null,
    publicKey: wallet.publicKey,
    disconnect: wallet.disconnect,
    connecting: wallet.connecting,
    wallet: wallet.wallet,
    signTransaction: wallet.signTransaction,
    signAllTransactions: wallet.signAllTransactions,
  };
};

export default SolanaWalletButton;
