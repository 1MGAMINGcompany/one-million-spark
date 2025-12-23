import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, ExternalLink, Globe, Lightbulb, MonitorSmartphone } from "lucide-react";

interface MobileWalletRedirectProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Deep links for opening the current URL inside wallet in-app browsers
 */
function getWalletDeepLinks() {
  const currentPath = window.location.pathname + window.location.search;
  const productionUrl = `https://1mgaming.com${currentPath}`;
  const encodedUrl = encodeURIComponent(productionUrl);
  
  return {
    phantom: `https://phantom.app/ul/browse/${encodedUrl}?ref=1mgaming`,
    solflare: `https://solflare.com/ul/v1/browse/${encodedUrl}`,
    backpack: `https://backpack.app/ul/browse/${encodedUrl}`,
  };
}

/**
 * Animated 2-step visual guide for wallet browser
 */
function WalletStepsAnimation() {
  return (
    <div className="bg-muted/30 border border-border/50 rounded-xl p-4 mb-4">
      <h4 className="text-sm font-semibold text-foreground text-center mb-4">
        Almost there — one quick step
      </h4>
      
      <div className="flex items-center justify-center gap-2 sm:gap-4">
        {/* Step 1: Phone with wallet + globe highlight */}
        <div className="flex flex-col items-center gap-2 flex-1 max-w-[140px]">
          <div className="relative w-16 h-20 bg-background border-2 border-border rounded-xl flex flex-col items-center justify-center overflow-hidden shadow-sm">
            {/* Phone screen content */}
            <div className="w-full h-3 bg-primary/20 flex items-center justify-center">
              <span className="text-[6px] text-muted-foreground font-medium">Wallet App</span>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-muted-foreground/50" />
            </div>
            {/* Bottom nav with globe */}
            <div className="w-full h-5 bg-muted/50 flex items-center justify-around px-1">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
              <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
              <div className="relative animate-pulse">
                <Globe className="w-3 h-3 text-primary" />
                <div className="absolute -inset-1 rounded-full border-2 border-primary animate-ping opacity-75" />
              </div>
              <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center leading-tight">
            Tap the <span className="text-primary font-medium">🌐 globe</span> icon in your wallet
          </p>
        </div>
        
        {/* Arrow */}
        <div className="text-primary text-xl animate-pulse">→</div>
        
        {/* Step 2: Website loading in wallet browser */}
        <div className="flex flex-col items-center gap-2 flex-1 max-w-[140px]">
          <div className="relative w-16 h-20 bg-background border-2 border-primary/50 rounded-xl flex flex-col items-center overflow-hidden shadow-md shadow-primary/10">
            {/* URL bar */}
            <div className="w-full h-4 bg-muted/80 flex items-center justify-center gap-1 px-1">
              <Globe className="w-2 h-2 text-primary" />
              <span className="text-[5px] text-foreground font-medium truncate">1mgaming.com</span>
            </div>
            {/* Page content loading */}
            <div className="flex-1 w-full p-1 flex flex-col gap-1">
              <div className="h-2 bg-primary/30 rounded animate-pulse" style={{ animationDelay: "0s" }} />
              <div className="h-2 bg-primary/20 rounded animate-pulse w-3/4" style={{ animationDelay: "0.2s" }} />
              <div className="h-2 bg-primary/20 rounded animate-pulse w-1/2" style={{ animationDelay: "0.4s" }} />
              <div className="flex-1 flex items-center justify-center">
                <MonitorSmartphone className="w-4 h-4 text-primary/50" />
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center leading-tight">
            <span className="text-primary font-medium">1mgaming.com</span> opens in wallet browser
          </p>
        </div>
      </div>
    </div>
  );
}

export function MobileWalletRedirect({ isOpen, onClose }: MobileWalletRedirectProps) {
  const deepLinks = getWalletDeepLinks();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Open in a Wallet to Sign
          </DialogTitle>
          <DialogDescription className="text-left">
            On mobile, you must open 1mgaming.com inside your wallet's built-in browser to sign transactions.
          </DialogDescription>
        </DialogHeader>
        
        {/* 2-Step Visual Guide */}
        <WalletStepsAnimation />
        
        <div className="space-y-2">
          {/* Phantom */}
          <Button 
            variant="outline" 
            className="w-full justify-between h-11"
            onClick={() => window.open(deepLinks.phantom, "_blank")}
          >
            <span className="flex items-center gap-2">
              <img 
                src="https://phantom.app/favicon.ico" 
                alt="Phantom" 
                className="w-5 h-5 rounded"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              Open in Phantom
            </span>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </Button>
          
          {/* Solflare */}
          <Button 
            variant="outline" 
            className="w-full justify-between h-11"
            onClick={() => window.open(deepLinks.solflare, "_blank")}
          >
            <span className="flex items-center gap-2">
              <img 
                src="https://solflare.com/favicon.ico" 
                alt="Solflare" 
                className="w-5 h-5 rounded"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <span className="text-left">
                <span className="block text-sm">Open in Solflare</span>
                <span className="block text-[10px] text-muted-foreground">(tap 🌐 browser icon)</span>
              </span>
            </span>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </Button>
          
          {/* Backpack */}
          <Button 
            variant="outline" 
            className="w-full justify-between h-11"
            onClick={() => window.open(deepLinks.backpack, "_blank")}
          >
            <span className="flex items-center gap-2">
              <img 
                src="https://backpack.app/favicon.ico" 
                alt="Backpack" 
                className="w-5 h-5 rounded"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              Open in Backpack
            </span>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
        
        {/* Tip banner */}
        <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg mt-2">
          <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Tip:</strong> Best experience on mobile is opening 1mgaming.com inside your wallet's browser.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
