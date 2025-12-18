import { useState } from "react";
import { useWalletModal } from "@/components/SolanaProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wallet, Info, Eye } from "lucide-react";
import { HowToConnectSolModal } from "./HowToConnectSolModal";

interface WalletGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export function WalletGateModal({ 
  isOpen, 
  onClose,
  title = "Connect a Solana Wallet to Play",
  description = "A Solana wallet is required to join games and compete for prizes."
}: WalletGateModalProps) {
  const { setVisible } = useWalletModal();
  const [showHelp, setShowHelp] = useState(false);

  const handleConnectWallet = () => {
    onClose();
    setVisible(true);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Wallet className="text-primary" size={32} />
            </div>
            <DialogTitle className="text-xl font-cinzel text-center">
              {title}
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              {description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Connect Wallet Button */}
            <Button 
              onClick={handleConnectWallet}
              className="w-full"
              size="lg"
            >
              <Wallet className="mr-2" size={18} />
              Connect Wallet
            </Button>

            {/* How to Connect Link */}
            <button
              onClick={() => setShowHelp(true)}
              className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors py-2"
            >
              <Info size={14} />
              How to connect & get SOL
            </button>

            {/* Browse Note */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70 pt-2 border-t border-border/30">
              <Eye size={12} />
              <span>You can browse rooms without a wallet. You only need a wallet to play.</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <HowToConnectSolModal 
        isOpen={showHelp} 
        onClose={() => setShowHelp(false)} 
      />
    </>
  );
}
