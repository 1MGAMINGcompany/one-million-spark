import { useState } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { Wallet, Info } from "lucide-react";
import { HowToConnectSolModal } from "./HowToConnectSolModal";

interface ConnectWalletGateProps {
  className?: string;
}

/**
 * A component to display when wallet connection is required.
 * Shows Connect Wallet button + How to connect link.
 * Use this in place of action buttons (Create Room, etc.) when wallet is not connected.
 */
export function ConnectWalletGate({ className }: ConnectWalletGateProps) {
  const { setVisible } = useWalletModal();
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className={className}>
      <div className="space-y-3">
        {/* Primary Connect Button */}
        <Button 
          onClick={() => setVisible(true)}
          className="w-full"
          size="lg"
        >
          <Wallet className="mr-2" size={18} />
          Connect Wallet
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
