import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wallet, Info, Eye, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HowToConnectSolModal } from "./HowToConnectSolModal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface WalletGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export function WalletGateModal({ 
  isOpen, 
  onClose,
  title,
  description,
}: WalletGateModalProps) {
  const { setVisible } = useWalletModal();
  const { login } = usePrivy();
  const { t } = useTranslation();
  const [showHelp, setShowHelp] = useState(false);

  const handlePrivyLogin = () => {
    onClose();
    login();
  };

  const handleExternalWallet = () => {
    onClose();
    setVisible(true);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Wallet className="text-primary" size={32} />
            </div>
            <DialogTitle className="text-xl font-cinzel text-center">
              {title || t("wallet.loginToPlay")}
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              {description || t("wallet.loginToPlayDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Primary: Privy Login */}
            <Button 
              onClick={handlePrivyLogin}
              className="w-full"
              size="lg"
            >
              <Wallet className="mr-2" size={18} />
              {t("wallet.continue")}
            </Button>

            {/* Secondary: External wallet */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center justify-center gap-1 w-full text-xs text-muted-foreground hover:text-primary transition-colors">
                <ChevronDown size={14} />
                {t("wallet.orUseExternal")}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <Button 
                  onClick={handleExternalWallet}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  <Wallet className="mr-2" size={18} />
                  {t("wallet.connect")}
                </Button>
              </CollapsibleContent>
            </Collapsible>

            {/* How to Connect Link */}
            <button
              onClick={() => setShowHelp(true)}
              className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors py-2"
            >
              <Info size={14} />
              {t("wallet.howToConnectSol")}
            </button>

            {/* Browse Note */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70 pt-2 border-t border-border/30">
              <Eye size={12} />
              <span>{t("wallet.browseWithoutWallet")}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <HowToConnectSolModal 
        isOpen={showHelp} 
        onClose={() => setShowHelp(false)} 
      />
    </>
  );
}
