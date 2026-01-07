import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  Wallet, 
  CreditCard,
  Shield, 
  ExternalLink,
  Sparkles,
  ArrowRight
} from "lucide-react";

interface HowToConnectSolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WALLETS = [
  {
    name: "Phantom",
    icon: "👻",
    url: "https://phantom.app/",
    recommended: true,
  },
  {
    name: "Solflare",
    icon: "🔆",
    url: "https://solflare.com/",
    recommended: false,
  },
  {
    name: "Backpack",
    icon: "🎒",
    url: "https://backpack.app/",
    recommended: false,
  },
];

export function HowToConnectSolModal({ isOpen, onClose }: HowToConnectSolModalProps) {
  const isMobile = useIsMobile();

  const content = (
    <div className="space-y-5 pb-4">
      {/* How Easy It Is - Visual Flow */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 rounded-xl p-4 border border-primary/20">
        <p className="text-center text-sm text-muted-foreground mb-3">It's this easy:</p>
        <div className="flex items-center justify-center gap-2 text-lg">
          <div className="flex flex-col items-center">
            <span className="text-2xl">🔗</span>
            <span className="text-xs text-muted-foreground mt-1">Connect</span>
          </div>
          <ArrowRight className="text-primary" size={16} />
          <div className="flex flex-col items-center">
            <span className="text-2xl">💳</span>
            <span className="text-xs text-muted-foreground mt-1">Buy</span>
          </div>
          <ArrowRight className="text-primary" size={16} />
          <div className="flex flex-col items-center">
            <span className="text-2xl">🎮</span>
            <span className="text-xs text-muted-foreground mt-1">Play!</span>
          </div>
        </div>
      </div>

      {/* Step 1: Get a Wallet */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">1</div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Wallet size={16} className="text-primary" />
            Get a Wallet
          </h3>
        </div>
        <p className="text-xs text-muted-foreground pl-8">Free to install, takes 30 seconds! 🚀</p>
        <div className="space-y-2 pl-8">
          {WALLETS.map((wallet) => (
            <a
              key={wallet.name}
              href={wallet.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/30"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{wallet.icon}</span>
                <span className="font-medium text-sm">{wallet.name}</span>
                {wallet.recommended && (
                  <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                    Popular
                  </span>
                )}
              </div>
              <ExternalLink size={12} className="text-muted-foreground" />
            </a>
          ))}
        </div>
      </div>

      {/* Step 2: Buy SOL */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">2</div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <CreditCard size={16} className="text-primary" />
            Buy SOL in Your Wallet
          </h3>
        </div>
        
        <div className="pl-8 space-y-3">
          {/* No Exchanges Badge */}
          <div className="inline-flex items-center gap-1.5 bg-green-500/20 text-green-400 px-2.5 py-1 rounded-full text-xs font-medium">
            <Sparkles size={12} />
            No exchanges needed!
          </div>

          <p className="text-xs text-muted-foreground">
            Buy SOL with card or Apple Pay directly in Phantom, Solflare, or Backpack.
          </p>

          {/* Payment Methods */}
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="text-lg">💳</span>
            <span className="text-lg">🍎</span>
            <span className="text-lg">🅿️</span>
            <span className="text-xs">Credit Card • Apple Pay • Google Pay</span>
          </div>

          <p className="text-[11px] text-muted-foreground/70">
            Or transfer from another wallet if you already have SOL
          </p>
        </div>
      </div>

      {/* Safety Note - Simplified */}
      <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-destructive flex items-center gap-2 mb-1.5">
          <Shield size={14} />
          Stay Safe
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Never share your seed phrase. 1M GAMING will never ask for it.
        </p>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="bg-background border-border">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2 text-lg font-cinzel">
              <Sparkles className="text-primary" size={20} />
              Getting Started
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 max-h-[70vh] overflow-y-auto">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-cinzel">
            <Sparkles className="text-primary" size={20} />
            Getting Started
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Step-by-step guide to set up your Solana wallet and add funds
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          {content}
        </div>
      </DialogContent>
    </Dialog>
  );
}
