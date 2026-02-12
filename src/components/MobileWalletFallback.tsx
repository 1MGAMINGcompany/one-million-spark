import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// Import local wallet icons
import phantomIcon from "@/assets/wallets/phantom.svg";
import solflareIcon from "@/assets/wallets/solflare.svg";
import backpackIcon from "@/assets/wallets/backpack.svg";

type WalletType = "phantom" | "solflare" | "backpack";

interface MobileWalletFallbackProps {
  onClose: () => void;
  isAndroid: boolean;
  isIOS: boolean;
  selectedWallet: WalletType | null;
}

export function MobileWalletFallback({ onClose, isAndroid, isIOS, selectedWallet }: MobileWalletFallbackProps) {
  const { t } = useTranslation();
  const [copiedSite, setCopiedSite] = useState(false);
  const [copiedPage, setCopiedPage] = useState(false);

  const currentUrl = window.location.href;
  const siteUrl = "https://www.1mgaming.com";

  const handleCopySite = async () => {
    try {
      await navigator.clipboard.writeText(siteUrl);
      setCopiedSite(true);
      toast.success(t("wallet.copied"));
      setTimeout(() => setCopiedSite(false), 2000);
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleCopyPage = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedPage(true);
      toast.success(t("wallet.copied"));
      setTimeout(() => setCopiedPage(false), 2000);
    } catch {
      toast.error(t("common.error"));
    }
  };

  const walletConfig: Record<WalletType, { icon: string; name: string; deepLink: string }> = {
    phantom: {
      icon: phantomIcon,
      name: "Phantom",
      deepLink: `https://phantom.app/ul/browse/${encodeURIComponent(currentUrl)}?ref=${encodeURIComponent(siteUrl)}`,
    },
    solflare: {
      icon: solflareIcon,
      name: "Solflare",
      deepLink: `https://solflare.com/ul/v1/browse/${encodeURIComponent(currentUrl)}?ref=${encodeURIComponent(siteUrl)}`,
    },
    backpack: {
      icon: backpackIcon,
      name: "Backpack",
      deepLink: `https://backpack.app/ul/browse/${encodeURIComponent(currentUrl)}`,
    },
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <button onClick={onClose} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft size={20} />
          <span>{t("wallet.back")}</span>
        </button>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={20} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-sm mx-auto space-y-4">
          {/* Primary action: Open in wallet browser */}
          <div className="bg-card rounded-xl p-5 border space-y-3">
            <p className="text-sm font-medium">{t("wallet.openPageInWalletBrowser")}</p>
            <div className="flex flex-col gap-2">
              {(Object.entries(walletConfig) as [WalletType, typeof walletConfig[WalletType]][]).map(([id, wallet]) => (
                <Button
                  key={id}
                  onClick={() => { window.location.href = wallet.deepLink; }}
                  variant={selectedWallet === id ? "default" : "outline"}
                  className="w-full gap-3 h-14 justify-start"
                >
                  <img src={wallet.icon} alt={wallet.name} className="w-8 h-8" />
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{t("wallet.openInWallet", { wallet: wallet.name })}</span>
                    <span className="text-xs opacity-70">{t("wallet.opensWalletBrowser")}</span>
                  </div>
                  <ExternalLink size={14} className="ml-auto" />
                </Button>
              ))}
            </div>
          </div>

          {/* Copy links as last resort */}
          <div className="flex flex-col gap-2">
            <Button onClick={handleCopyPage} variant="ghost" className="w-full gap-2 text-xs">
              {copiedPage ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              {copiedPage ? t("wallet.copied") : t("wallet.copyLink")}
            </Button>
            <Button onClick={handleCopySite} variant="ghost" className="w-full gap-2 text-xs">
              {copiedSite ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              {copiedSite ? t("wallet.copied") : t("wallet.copySite")}
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t">
        <Button onClick={onClose} variant="ghost" className="w-full">
          {t("wallet.cancel")}
        </Button>
      </div>
    </div>
  );
}
