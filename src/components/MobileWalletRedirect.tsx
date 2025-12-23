import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, ExternalLink } from "lucide-react";

interface MobileWalletRedirectProps {
  isOpen: boolean;
  onClose: () => void;
  action: "create" | "join";
}

/**
 * Deep links for opening the current URL inside wallet in-app browsers
 */
function getWalletDeepLinks() {
  const currentUrl = encodeURIComponent(window.location.href);
  
  return {
    phantom: `https://phantom.app/ul/browse/${currentUrl}?ref=1mgaming`,
    solflare: `https://solflare.com/ul/v1/browse/${currentUrl}`,
    backpack: `https://backpack.app/ul/browse/${currentUrl}`,
  };
}

export function MobileWalletRedirect({ isOpen, onClose, action }: MobileWalletRedirectProps) {
  const deepLinks = getWalletDeepLinks();
  
  const actionText = action === "create" ? "create a room" : "join this room";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Open in Wallet App
          </DialogTitle>
          <DialogDescription>
            To {actionText}, open this page in your wallet's browser for secure signing.
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
          
          {/* Solflare */}
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
              Open in Solflare
            </span>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </Button>
          
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
        
        <p className="text-xs text-muted-foreground text-center pt-2">
          Don't have a wallet? Download one of the apps above to get started.
        </p>
      </DialogContent>
    </Dialog>
  );
}