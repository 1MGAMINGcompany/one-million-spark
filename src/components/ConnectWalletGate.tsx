import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Wallet, Info } from "lucide-react";
import { HowToConnectSolModal } from "./HowToConnectSolModal";
import { WalletPickerDialog } from "./WalletPickerDialog";
import { useWallet } from "@solana/wallet-adapter-react";
import { useTranslation } from "react-i18next";

interface ConnectWalletGateProps {
  className?: string;
}

/**
 * A component to display when wallet connection is required.
 * Shows a button that opens the shared WalletPickerDialog.
 */
export function ConnectWalletGate({ className }: ConnectWalletGateProps) {
  const { t } = useTranslation();
  const { connecting } = useWallet();
  const [showHelp, setShowHelp] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className={className}>
      <div className="space-y-3">
        <Button 
          onClick={() => setDialogOpen(true)}
          className="w-full"
          size="lg"
          disabled={connecting}
        >
          <Wallet className="mr-2" size={18} />
          {connecting ? t("wallet.connecting") : t("wallet.connect")}
        </Button>

        <button
          onClick={() => setShowHelp(true)}
          className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <Info size={14} />
          {t("wallet.howToConnectSol")}
        </button>
      </div>

      <WalletPickerDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <HowToConnectSolModal 
        isOpen={showHelp} 
        onClose={() => setShowHelp(false)} 
      />
    </div>
  );
}
