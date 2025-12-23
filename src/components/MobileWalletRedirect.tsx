import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, ExternalLink, Globe, Lightbulb } from "lucide-react";

interface MobileWalletRedirectProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Deep links for opening the current URL inside wallet in-app browsers
 */
function getWalletDeepLinks() {
  // Use production domain for deep links, not preview domains
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
 * Animated 2-step guide for Solflare users
 */
function SolflareStepAnimation() {
  return (
    <div className="flex items-center justify-center gap-3 py-2 px-3 bg-muted/50 rounded-lg mt-2">
      {/* Step 1 */}
      <div className="flex flex-col items-center gap-1 animate-pulse" style={{ animationDelay: "0s", animationDuration: "2s" }}>
        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-primary" />
        </div>
        <span className="text-[10px] text-muted-foreground font-medium">1. Solflare opens</span>
      </div>
      
      {/* Arrow */}
      <div className="text-muted-foreground text-lg">→</div>
      
      {/* Step 2 */}
      <div className="flex flex-col items-center gap-1 animate-pulse" style={{ animationDelay: "1s", animationDuration: "2s" }}>
        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
          <Globe className="w-5 h-5 text-primary" />
        </div>
        <span className="text-[10px] text-muted-foreground font-medium">2. Tap 🌐 Browser</span>
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
          <DialogDescription className="text-left space-y-2">
            <span>On mobile, you must open 1mgaming.com inside your wallet's built-in browser to sign transactions.</span>
            <span className="block text-xs pt-1 space-y-0.5">
              <span className="block"><strong>Phantom:</strong> opens automatically</span>
              <span className="block"><strong>Solflare:</strong> after opening the app, tap the 🌐 browser icon</span>
              <span className="block"><strong>Backpack:</strong> opens automatically</span>
            </span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 pt-2">
          {/* Phantom */}
          <Button 
            variant="outline" 
            className="w-full justify-between h-12"
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
          
          {/* Solflare with animation */}
          <div className="space-y-0">
            <Button 
              variant="outline" 
              className="w-full justify-between h-12"
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
            <SolflareStepAnimation />
          </div>
          
          {/* Backpack */}
          <Button 
            variant="outline" 
            className="w-full justify-between h-12"
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
