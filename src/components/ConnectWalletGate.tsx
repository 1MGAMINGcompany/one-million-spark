import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
const getIsAndroid = () => /Android/i.test(navigator.userAgent);
const getIsIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
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

// Deep link helpers for opening dapp in wallet browser
const getWalletBrowseDeepLink = (walletType: 'phantom' | 'solflare', url: string): string => {
  const encodedUrl = encodeURIComponent(url);
  switch (walletType) {
    case 'phantom':
      return `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodeURIComponent(url)}`;
    case 'solflare':
      return `https://solflare.com/ul/v1/browse/${encodedUrl}?redirect_link=${encodedUrl}`;
    default:
      return url;
  }
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
  const { wallets, select, connect, connecting, connected } = useWallet();
  const [showHelp, setShowHelp] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notDetectedWallet, setNotDetectedWallet] = useState<'phantom' | 'solflare' | 'backpack' | null>(null);
  
  const isMobile = getIsMobile();
  const isAndroid = getIsAndroid();
  const isIOS = getIsIOS();
  const isInWalletBrowser = getIsInWalletBrowser();

  // Auto-connect polling for wallet browser environments
  useEffect(() => {
    if (connected || connecting) return;
    if (!isMobile) return;

    let attempts = 0;
    const maxAttempts = 15; // 15 x 200ms = 3 seconds

    const interval = setInterval(() => {
      attempts++;
      const win = window as any;
      const hasProvider = win.solana || win.phantom?.solana || win.solflare;

      if (hasProvider) {
        clearInterval(interval);
        const installed = wallets.find(w => w.readyState === 'Installed');
        if (installed && !connected) {
          console.log("[WalletAutoConnect] Gate: Provider detected, connecting via", installed.adapter.name);
          select(installed.adapter.name);
          connect().catch(err => console.warn("[WalletAutoConnect] Gate: Failed:", err));
        }
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if MWA is available (Android only)
  const hasMWA = isAndroid && wallets.some(w => 
    w.adapter.name.toLowerCase().includes('mobile wallet adapter')
  );

  // Handle MWA connect (Android)
  const handleMWAConnect = () => {
    const mwaWallet = wallets.find(w => 
      w.adapter.name.toLowerCase().includes('mobile wallet adapter')
    );
    if (mwaWallet) {
      select(mwaWallet.adapter.name);
      connect().catch(() => {}); // Explicit connect to trigger wallet handshake
      setDialogOpen(false);
    }
  };

  // Handle deep link to open dapp in wallet browser (iOS)
  const handleOpenInWallet = (walletType: 'phantom' | 'solflare') => {
    const deepLink = getWalletBrowseDeepLink(walletType, window.location.href);
    window.location.href = deepLink;
  };

  const handleSelectWallet = (walletId: string) => {
    // Find matching wallet from detected wallets
    const matchingWallet = wallets.find(w => 
      w.adapter.name.toLowerCase().includes(walletId)
    );
    
    if (matchingWallet) {
      select(matchingWallet.adapter.name);
      connect().catch(() => {});
      setDialogOpen(false);
    } else if (isMobile) {
      // Android with MWA: use MWA to open system wallet picker
      if (isAndroid && hasMWA) {
        handleMWAConnect();
      } else {
        // iOS or no MWA: show "not detected" modal with deep link fallback
        setNotDetectedWallet(walletId as 'phantom' | 'solflare' | 'backpack');
        setDialogOpen(false);
      }
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
            <DialogDescription className="text-sm text-muted-foreground">
              Select your wallet provider to connect
            </DialogDescription>
          </DialogHeader>
          
        <div className="grid gap-3 py-4">
            
            {/* ANDROID: Show MWA as top option */}
            {isAndroid && hasMWA && (
              <Button
                variant="default"
                className="w-full justify-start gap-3 h-14 bg-primary"
                onClick={handleMWAConnect}
              >
                <Wallet size={24} />
                <div className="flex flex-col items-start">
                  <span className="font-medium">Use Installed Wallet</span>
                  <span className="text-xs opacity-80">Phantom, Solflare, Backpack</span>
                </div>
              </Button>
            )}

            {/* Wallet buttons — shown on ALL platforms */}
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

            {/* iOS: Prominent instructions for wallet browser */}
            {isIOS && !isInWalletBrowser && (
              <div className="border-t border-border pt-3 mt-1">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-3">
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">
                    {t("wallet.iosInstructions")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("wallet.iosInstructionsDetail")}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleOpenInWallet('phantom')}
                  >
                    <img src={phantomIcon} alt="Phantom" className="w-5 h-5" />
                    {t("wallet.openInPhantom")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleOpenInWallet('solflare')}
                  >
                    <img src={solflareIcon} alt="Solflare" className="w-5 h-5" />
                    {t("wallet.openInSolflare")}
                  </Button>
                </div>
              </div>
            )}

            {/* Android: subtle deep link fallback */}
            {isAndroid && !isInWalletBrowser && (
              <div className="border-t border-border pt-3 mt-1">
                <p className="text-xs text-muted-foreground text-center mb-3">
                  {t("wallet.orOpenInWalletBrowser")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleOpenInWallet('phantom')}
                  >
                    <img src={phantomIcon} alt="Phantom" className="w-5 h-5" />
                    Phantom
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleOpenInWallet('solflare')}
                  >
                    <img src={solflareIcon} alt="Solflare" className="w-5 h-5" />
                    Solflare
                  </Button>
                </div>
              </div>
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
