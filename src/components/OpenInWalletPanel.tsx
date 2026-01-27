import { useState } from "react";
import { Copy, Check, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  buildWalletBrowseDeepLink, 
  getWalletInstallUrl,
  getWalletDisplayName,
  type WalletType 
} from "@/lib/walletDeepLinks";

// Import wallet icons
import phantomIcon from "@/assets/wallets/phantom.svg";
import solflareIcon from "@/assets/wallets/solflare.svg";
import backpackIcon from "@/assets/wallets/backpack.svg";

const WALLET_ICONS: Record<WalletType, string> = {
  phantom: phantomIcon,
  solflare: solflareIcon,
  backpack: backpackIcon,
};

interface OpenInWalletPanelProps {
  currentUrl: string;
  onDismiss: () => void;
}

/**
 * Bottom panel shown when user is in a regular mobile browser (Chrome/Safari)
 * and needs to open the link in a wallet's built-in browser to sign transactions.
 */
export function OpenInWalletPanel({ currentUrl, onDismiss }: OpenInWalletPanelProps) {
  const [attemptedWallet, setAttemptedWallet] = useState<WalletType | null>(null);
  const [copied, setCopied] = useState(false);
  
  /**
   * Handle wallet button tap - triggers deep link navigation.
   * IMPORTANT: This only runs on explicit user tap, no auto-redirect.
   */
  const handleOpenWallet = (wallet: WalletType) => {
    setAttemptedWallet(wallet);
    const deepLink = buildWalletBrowseDeepLink(wallet, currentUrl);
    
    console.log(`[OpenInWallet] Opening ${wallet} with deep link:`, deepLink.slice(0, 60));
    
    // Navigate to deep link - will open wallet app if installed
    window.location.href = deepLink;
  };
  
  /**
   * Copy link fallback
   */
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      toast.success("Link copied! Paste it in your wallet's browser.");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[OpenInWallet] Copy failed:", err);
      toast.error("Failed to copy link");
    }
  };
  
  return (
    <div className="fixed bottom-0 inset-x-0 p-4 bg-card border-t border-border z-50 animate-in slide-in-from-bottom duration-300">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg text-foreground">Join this game</h3>
          <button 
            onClick={onDismiss}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground"
            aria-label="Dismiss"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Instruction */}
        <p className="text-sm text-muted-foreground">
          To play, open this link inside your wallet app.
        </p>
        
        {/* Wallet buttons */}
        <div className="grid grid-cols-3 gap-2">
          {(['phantom', 'solflare', 'backpack'] as WalletType[]).map((wallet) => (
            <Button
              key={wallet}
              variant="outline"
              onClick={() => handleOpenWallet(wallet)}
              className="flex flex-col items-center gap-1.5 h-auto py-3 border-primary/30 hover:bg-primary/10 hover:border-primary/50"
            >
              <img 
                src={WALLET_ICONS[wallet]} 
                alt={getWalletDisplayName(wallet)} 
                className="h-6 w-6" 
              />
              <span className="text-xs font-medium">{getWalletDisplayName(wallet)}</span>
            </Button>
          ))}
        </div>
        
        {/* Copy link fallback */}
        <Button 
          variant="ghost" 
          onClick={handleCopyLink} 
          className="w-full gap-2 text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-green-500" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy link
            </>
          )}
        </Button>
        
        {/* Install hint after deep link attempt */}
        {attemptedWallet && (
          <div className="text-center text-xs text-muted-foreground space-y-1 pt-1 border-t border-border">
            <p>If nothing happened, you may need to install the wallet app.</p>
            <a 
              href={getWalletInstallUrl(attemptedWallet)} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Install {getWalletDisplayName(attemptedWallet)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
