import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";
import { 
  buildWalletBrowseDeepLink, 
  getWalletInstallUrl,
  getWalletDisplayName,
  type WalletType 
} from "@/lib/walletDeepLinks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wallet, Info, Eye, Copy, Check, ExternalLink } from "lucide-react";
import { HowToConnectSolModal } from "./HowToConnectSolModal";
import phantomIcon from "@/assets/wallets/phantom.svg";
import solflareIcon from "@/assets/wallets/solflare.svg";
import backpackIcon from "@/assets/wallets/backpack.svg";

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
  const { connected } = useWallet();
  const [showHelp, setShowHelp] = useState(false);
  const [attemptedWallet, setAttemptedWallet] = useState<WalletType | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Detect environment
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const inWalletBrowser = typeof window !== 'undefined' && isWalletInAppBrowser();
  const hasInjectedWallet = typeof window !== 'undefined' && 
    !!((window as any).solana || (window as any).phantom?.solana || (window as any).solflare);
  
  // Mobile regular browser (Chrome/Safari) without injected wallet = show deep link options
  const needsOpenInWallet = isMobile && !inWalletBrowser && !hasInjectedWallet;
  
  // Auto-close when wallet connects - THE FIX (never close before connect)
  useEffect(() => {
    if (connected && isOpen) {
      onClose();
    }
  }, [connected, isOpen, onClose]);

  const handleConnectWallet = () => {
    if (needsOpenInWallet) {
      // Don't try to open adapter modal - it won't work
      // Deep link buttons are already shown inline below
      return;
    }
    // Open wallet modal - DO NOT call onClose()
    // useEffect will close when connected === true
    setVisible(true);
  };
  
  const handleOpenWallet = (wallet: WalletType) => {
    setAttemptedWallet(wallet);
    const deepLink = buildWalletBrowseDeepLink(wallet, window.location.href);
    window.location.href = deepLink;
  };
  
  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const walletIcons: Record<WalletType, string> = {
    phantom: phantomIcon,
    solflare: solflareIcon,
    backpack: backpackIcon,
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
            {/* Standard Connect Wallet Button - hidden for mobile regular browser */}
            {!needsOpenInWallet && (
              <Button 
                onClick={handleConnectWallet}
                className="w-full"
                size="lg"
              >
                <Wallet className="mr-2" size={18} />
                Connect Wallet
              </Button>
            )}
            
            {/* Mobile regular browser: show deep link options INSIDE the dialog */}
            {needsOpenInWallet && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  Open this page in your wallet app to connect:
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(['phantom', 'solflare', 'backpack'] as WalletType[]).map((wallet) => (
                    <Button
                      key={wallet}
                      variant="outline"
                      onClick={() => handleOpenWallet(wallet)}
                      className="flex flex-col items-center gap-1.5 h-auto py-3 border-primary/30"
                    >
                      <img 
                        src={walletIcons[wallet]} 
                        alt={getWalletDisplayName(wallet)} 
                        className="h-6 w-6" 
                      />
                      <span className="text-xs font-medium">{getWalletDisplayName(wallet)}</span>
                    </Button>
                  ))}
                </div>
                <Button variant="ghost" onClick={handleCopyLink} className="w-full gap-2">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied!" : "Copy link"}
                </Button>
                {attemptedWallet && (
                  <div className="text-center text-xs text-muted-foreground pt-2 border-t">
                    <p>If nothing happened, install the wallet app:</p>
                    <a 
                      href={getWalletInstallUrl(attemptedWallet)} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Install {getWalletDisplayName(attemptedWallet)} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            )}

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
