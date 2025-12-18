import { useState } from "react";
import { useWalletModal } from "@/components/SolanaProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  Wallet, 
  Download, 
  Link, 
  Coins, 
  Shield, 
  ExternalLink,
  Copy,
  Check,
  Info
} from "lucide-react";
import { toast } from "sonner";

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

const CONNECT_STEPS = [
  "Install the wallet app or browser extension",
  "Create a new wallet or import existing one",
  'Tap "Connect Wallet" in 1M GAMING',
  "Approve the connection in your wallet",
];

const GET_SOL_STEPS = [
  "Buy SOL on a trusted exchange (Coinbase, Binance, Kraken)",
  "Withdraw SOL to your wallet address",
  "Keep a small amount (~0.01 SOL) for network fees",
];

export function HowToConnectSolModal({ isOpen, onClose }: HowToConnectSolModalProps) {
  const isMobile = useIsMobile();
  const [copiedAddress, setCopiedAddress] = useState(false);

  const handleCopyExample = () => {
    navigator.clipboard.writeText("Your wallet address appears in your wallet app");
    setCopiedAddress(true);
    toast.success("Copied!");
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const content = (
    <div className="space-y-6 pb-4">
      {/* Recommended Wallets */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
          <Wallet size={16} />
          Recommended Solana Wallets
        </h3>
        <div className="space-y-2">
          {WALLETS.map((wallet) => (
            <a
              key={wallet.name}
              href={wallet.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/30"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{wallet.icon}</span>
                <span className="font-medium">{wallet.name}</span>
                {wallet.recommended && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                )}
              </div>
              <ExternalLink size={14} className="text-muted-foreground" />
            </a>
          ))}
        </div>
      </div>

      {/* How to Connect */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
          <Link size={16} />
          How to Connect
        </h3>
        <ol className="space-y-2">
          {CONNECT_STEPS.map((step, index) => (
            <li key={index} className="flex items-start gap-3 text-sm text-muted-foreground">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* How to Get SOL */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
          <Coins size={16} />
          How to Get SOL
        </h3>
        <ol className="space-y-2">
          {GET_SOL_STEPS.map((step, index) => (
            <li key={index} className="flex items-start gap-3 text-sm text-muted-foreground">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        
        <button
          onClick={handleCopyExample}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
        >
          {copiedAddress ? <Check size={12} /> : <Copy size={12} />}
          Your wallet address is in your wallet app
        </button>
      </div>

      {/* Safety Note */}
      <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-2">
        <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
          <Shield size={16} />
          Safety First
        </h3>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• Never share your seed phrase with anyone</li>
          <li>• 1M GAMING will never ask for your seed phrase</li>
          <li>• Only connect to trusted websites</li>
        </ul>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="bg-background border-border">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2 text-lg font-cinzel">
              <Info className="text-primary" size={20} />
              How to Connect & Get SOL
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
            <Info className="text-primary" size={20} />
            How to Connect & Get SOL
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          {content}
        </div>
      </DialogContent>
    </Dialog>
  );
}
