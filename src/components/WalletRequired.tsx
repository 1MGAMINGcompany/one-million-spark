import { Wallet, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnectWallet } from "@/contexts/WalletConnectContext";

interface WalletRequiredProps {
  message?: string;
}

export function WalletRequired({ message }: WalletRequiredProps) {
  const { openConnectDialog } = useConnectWallet();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-6">
          <Wallet className="text-muted-foreground" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Wallet Required
        </h2>
        <p className="text-muted-foreground mb-4">
          {message || "Please connect your Solana wallet to continue."}
        </p>
        
        <Button onClick={openConnectDialog} className="mb-6">
          <Wallet className="mr-2" size={18} />
          Connect Wallet
        </Button>
        
        {/* SOL on Solana info */}
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mt-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Coins className="text-primary" size={18} />
            <span className="font-medium text-primary">Game Fees</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Entry fees are paid in SOL on the Solana network.
          </p>
        </div>
      </div>
    </div>
  );
}
