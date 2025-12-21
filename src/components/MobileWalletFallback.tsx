import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, X, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface MobileWalletFallbackProps {
  onClose: () => void;
  onRetry: () => void;
}

export function MobileWalletFallback({ onClose, onRetry }: MobileWalletFallbackProps) {
  const { t } = useTranslation();
  const [copiedSite, setCopiedSite] = useState(false);
  const [copiedPage, setCopiedPage] = useState(false);
  const [phantomOpen, setPhantomOpen] = useState(false);
  const [solflareOpen, setSolflareOpen] = useState(false);
  const [backpackOpen, setBackpackOpen] = useState(false);

  const currentUrl = window.location.href;
  const siteUrl = "https://www.1mgaming.com";
  const solflareDeeplink = `https://solflare.com/ul/v1/browse/${encodeURIComponent(currentUrl)}?ref=${encodeURIComponent(siteUrl)}`;

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

  const handleOpenSolflare = () => {
    window.location.href = solflareDeeplink;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold">{t("wallet.tryInBrowserConnect")}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={20} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-sm mx-auto space-y-4">
          {/* Main message */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {t("wallet.walletDidntOpen")}
            </p>
          </div>

          {/* Retry button */}
          <Button onClick={onRetry} variant="outline" className="w-full gap-2">
            <RefreshCw size={16} />
            {t("wallet.retry")}
          </Button>

          {/* Copy links */}
          <div className="flex flex-col gap-2">
            <Button onClick={handleCopyPage} variant="default" className="w-full gap-2">
              {copiedPage ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
              {copiedPage ? t("wallet.copied") : t("wallet.copyLink")}
            </Button>
            <Button onClick={handleCopySite} variant="outline" className="w-full gap-2">
              {copiedSite ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
              {copiedSite ? t("wallet.copied") : "Copy 1mgaming.com"}
            </Button>
          </div>

          {/* Collapsible wallet instructions */}
          <div className="border rounded-lg divide-y">
            {/* Phantom */}
            <Collapsible open={phantomOpen} onOpenChange={setPhantomOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <img 
                    src="https://raw.githubusercontent.com/nickreynolds/fotomatic/main/phantom.png" 
                    alt="Phantom" 
                    className="w-6 h-6 rounded"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <span className="font-medium">{t("wallet.phantom.title")}</span>
                </div>
                {phantomOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4">
                <ol className="space-y-2 text-sm text-muted-foreground ml-9">
                  <li>1. {t("wallet.phantom.step1")}</li>
                  <li>2. {t("wallet.phantom.step2")}</li>
                  <li>3. {t("wallet.phantom.step3")}</li>
                </ol>
              </CollapsibleContent>
            </Collapsible>

            {/* Solflare */}
            <Collapsible open={solflareOpen} onOpenChange={setSolflareOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <img 
                    src="https://raw.githubusercontent.com/nickreynolds/fotomatic/main/solflare.png" 
                    alt="Solflare" 
                    className="w-6 h-6 rounded"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <span className="font-medium">{t("wallet.solflare.title")}</span>
                </div>
                {solflareOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4 space-y-3">
                <Button onClick={handleOpenSolflare} size="sm" className="w-full gap-2 ml-9">
                  {t("wallet.solflare.openButton")}
                </Button>
                <p className="text-xs text-muted-foreground ml-9">{t("wallet.solflare.note")}</p>
              </CollapsibleContent>
            </Collapsible>

            {/* Backpack */}
            <Collapsible open={backpackOpen} onOpenChange={setBackpackOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <img 
                    src="https://raw.githubusercontent.com/nickreynolds/fotomatic/main/backpack.png" 
                    alt="Backpack" 
                    className="w-6 h-6 rounded"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <span className="font-medium">{t("wallet.backpack.title")}</span>
                </div>
                {backpackOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4">
                <ol className="space-y-2 text-sm text-muted-foreground ml-9">
                  <li>1. {t("wallet.backpack.step1")}</li>
                  <li>2. {t("wallet.backpack.step2")}</li>
                </ol>
              </CollapsibleContent>
            </Collapsible>
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
