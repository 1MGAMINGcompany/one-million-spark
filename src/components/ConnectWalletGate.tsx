import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Wallet, Info } from "lucide-react";
import { HowToConnectSolModal } from "./HowToConnectSolModal";
import { useConnectWallet } from "@/contexts/WalletConnectContext";
import { useWallet } from "@solana/wallet-adapter-react";

interface ConnectWalletGateProps {
  className?: string;
}

/**
 * A component to display when wallet connection is required.
 * Uses the unified wallet connect dialog from WalletButton.
 */
export function ConnectWalletGate({ className }: ConnectWalletGateProps) {
  const { connecting } = useWallet();
  const { openConnectDialog } = useConnectWallet();
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className={className}>
      <div className="space-y-3">
        {/* Primary Connect Button */}
        <Button 
          onClick={openConnectDialog}
          className="w-full"
          size="lg"
          disabled={connecting}
        >
          <Wallet className="mr-2" size={18} />
          {connecting ? "Connecting..." : "Connect Wallet"}
        </Button>

        {/* How to Connect Link */}
        <button
          onClick={() => setShowHelp(true)}
          className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <Info size={14} />
          How to connect & get SOL
        </button>
      </div>

      <HowToConnectSolModal 
        isOpen={showHelp} 
        onClose={() => setShowHelp(false)} 
      />
    </div>
  );
}
