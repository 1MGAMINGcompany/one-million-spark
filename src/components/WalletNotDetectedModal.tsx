import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

// Import local wallet icons
import phantomIcon from "@/assets/wallets/phantom.svg";
import solflareIcon from "@/assets/wallets/solflare.svg";
import backpackIcon from "@/assets/wallets/backpack.svg";

type WalletType = "phantom" | "solflare" | "backpack";

interface WalletNotDetectedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletType: WalletType;
  onRetryCheck: () => void;
}

const getIsAndroid = () => /Android/i.test(navigator.userAgent);

// Platform-specific deep links
const getDeepLink = (walletType: WalletType, url: string): string => {
  const encodedUrl = encodeURIComponent(url);
  const isAndroid = getIsAndroid();
  
  switch (walletType) {
    case "phantom":
      // Android: phantom://browse/URL, iOS: https://phantom.app/ul/browse/URL
      return isAndroid 
        ? `phantom://browse/${encodedUrl}`
        : `https://phantom.app/ul/browse/${encodedUrl}`;
    case "solflare":
      return `https://solflare.com/ul/v1/browse/${encodedUrl}`;
    case "backpack":
      return `https://backpack.app/ul/browse/${encodedUrl}`;
    default:
      return url;
  }
};

const WALLET_INFO: Record<WalletType, { name: string; icon: string }> = {
  phantom: { name: "Phantom", icon: phantomIcon },
  solflare: { name: "Solflare", icon: solflareIcon },
  backpack: { name: "Backpack", icon: backpackIcon },
};

export function WalletNotDetectedModal({
  open,
  onOpenChange,
  walletType,
  onRetryCheck,
}: WalletNotDetectedModalProps) {
  const { t } = useTranslation();
  const walletInfo = WALLET_INFO[walletType];
  const currentUrl = window.location.href;
  
  const handleOpenApp = () => {
    const deepLink = getDeepLink(walletType, currentUrl);
    window.location.href = deepLink;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <img 
              src={walletInfo.icon} 
              alt={walletInfo.name} 
              className="w-8 h-8"
            />
            {t("wallet.walletNotDetected", { wallet: walletInfo.name })}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Helper text */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-sm text-blue-600 dark:text-blue-400">
              {t("wallet.mobileHelperText")}
            </p>
          </div>
          
          {/* Two action buttons */}
          <div className="space-y-3">
            <Button 
              onClick={handleOpenApp}
              className="w-full gap-2"
              size="lg"
            >
              <ExternalLink size={18} />
              {t("wallet.openWalletApp", { wallet: walletInfo.name })}
            </Button>
            
            <Button 
              onClick={onRetryCheck}
              variant="outline"
              className="w-full gap-2"
              size="lg"
            >
              <RefreshCw size={18} />
              {t("wallet.alreadyInWallet", { wallet: walletInfo.name })}
            </Button>
          </div>
          
          {/* Subtle hint */}
          <p className="text-xs text-muted-foreground text-center">
            {t("wallet.retryHelperText")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
