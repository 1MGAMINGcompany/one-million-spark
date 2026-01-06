import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wallet, Info } from "lucide-react";
import { HowToConnectSolModal } from "./HowToConnectSolModal";
import { WalletNotDetectedModal } from "./WalletNotDetectedModal";
import { useWallet } from "@solana/wallet-adapter-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

// Import local wallet icons
import phantomIcon from "@/assets/wallets/phantom.svg";
import solflareIcon from "@/assets/wallets/solflare.svg";
import backpackIcon from "@/assets/wallets/backpack.svg";

// Environment detection
const getIsMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const getIsInWalletBrowser = () => {
  const win = window as any;
  return !!win?.phantom?.solana?.isPhantom || !!win?.solflare?.isSolflare || !!win?.solana;
};

// Explicit wallet detection helpers
const isPhantomAvailable = () => {
  const win = window as any;
  return !!win?.solana?.isPhantom;
};

const isSolflareAvailable = () => {
  const win = window as any;
  return !!win?.solflare?.isSolflare;
};

const isBackpackAvailable = () => {
  const win = window as any;
  return !!win?.backpack?.isBackpack;
};

interface ConnectWalletGateProps {
  className?: string;
}

// Wallet icons - using local assets
const WALLET_CONFIG = [
  {
    id: 'phantom',
    name: 'Phantom',
    icon: phantomIcon,
  },
  {
    id: 'solflare', 
    name: 'Solflare',
    icon: solflareIcon,
  },
  {
    id: 'backpack',
    name: 'Backpack', 
    icon: backpackIcon,
  },
];

/**
 * A component to display when wallet connection is required.
 * Shows custom wallet picker with 3 buttons + icons.
 * On mobile: shows friendly helper text (non-blocking).
 */
export function ConnectWalletGate({ className }: ConnectWalletGateProps) {
  const { t } = useTranslation();
  const { wallets, select, connecting } = useWallet();
  const [showHelp, setShowHelp] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notDetectedWallet, setNotDetectedWallet] = useState<'phantom' | 'solflare' | 'backpack' | null>(null);
  
  const isMobile = getIsMobile();
  const isInWalletBrowser = getIsInWalletBrowser();

  const handleSelectWallet = (walletId: string) => {
    // Find matching wallet from detected wallets
    const matchingWallet = wallets.find(w => 
      w.adapter.name.toLowerCase().includes(walletId)
    );
    
    if (matchingWallet) {
      select(matchingWallet.adapter.name);
      setDialogOpen(false);
    } else if (isMobile) {
      // On mobile with no wallet detected: show modal with 2 options
      setNotDetectedWallet(walletId as 'phantom' | 'solflare' | 'backpack');
      setDialogOpen(false);
    } else {
      // Desktop: just show toast
      toast.error(`${walletId} wallet not detected. Please install it first.`);
    }
  };

  const handleRetryCheck = () => {
    // Re-check if wallet is now available
    const checkFns: Record<string, () => boolean> = {
      phantom: isPhantomAvailable,
      solflare: isSolflareAvailable,
      backpack: isBackpackAvailable,
    };
    
    if (notDetectedWallet && checkFns[notDetectedWallet]?.()) {
      // Wallet now detected! Try to connect
      const walletId = notDetectedWallet;
      setNotDetectedWallet(null);
      handleSelectWallet(walletId);
    } else {
      toast.error(t("wallet.stillNotDetected"));
    }
  };

  const isWalletDetected = (walletId: string) => {
    return wallets.some(w => 
      w.adapter.name.toLowerCase().includes(walletId) && 
      w.readyState === 'Installed'
    );
  };

  return (
    <div className={className}>
      <div className="space-y-3">
        {/* Primary Connect Button */}
        <Button 
          onClick={() => setDialogOpen(true)}
          className="w-full"
          size="lg"
          disabled={connecting}
        >
          <Wallet className="mr-2" size={18} />
          {connecting ? t("wallet.connecting") : t("wallet.connect")}
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

      {/* Custom Wallet Picker Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("wallet.connectWallet")}</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-3 py-4">
            {/* Mobile friendly helper text (non-blocking) */}
            {isMobile && !isInWalletBrowser && !isPhantomAvailable() && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-2">
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  {t("wallet.mobileHelperText")}
                </p>
              </div>
            )}

            {/* Wallet buttons with icons */}
            {WALLET_CONFIG.map((wallet) => {
              const detected = isWalletDetected(wallet.id);
              return (
                <Button
                  key={wallet.id}
                  variant="outline"
                  className="w-full justify-start gap-3 h-14"
                  onClick={() => handleSelectWallet(wallet.id)}
                >
                  <img 
                    src={wallet.icon} 
                    alt={wallet.name} 
                    className="w-8 h-8"
                  />
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{wallet.name}</span>
                    {detected && (
                      <span className="text-xs text-green-500">{t("wallet.detected")}</span>
                    )}
                  </div>
                </Button>
              );
            })}

            {/* In wallet browser success */}
            {isMobile && isInWalletBrowser && (
              <p className="text-xs text-green-500 text-center mt-2 bg-green-500/10 p-2 rounded">
                ✓ {t("wallet.inWalletBrowser")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Not Detected Modal */}
      <WalletNotDetectedModal
        open={!!notDetectedWallet}
        onOpenChange={(open) => !open && setNotDetectedWallet(null)}
        walletType={notDetectedWallet || 'phantom'}
        onRetryCheck={handleRetryCheck}
      />

      <HowToConnectSolModal 
        isOpen={showHelp} 
        onClose={() => setShowHelp(false)} 
      />
    </div>
  );
}
