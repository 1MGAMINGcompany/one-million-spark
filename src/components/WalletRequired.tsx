import { Wallet, Coins } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SolanaWalletButton } from "./SolanaWalletButton";

export function WalletRequired() {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-6">
          <Wallet className="text-muted-foreground" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {t('walletRequired.title')}
        </h2>
        <p className="text-muted-foreground mb-4">
          {t('walletRequired.descriptionSol')}
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          {t('walletRequired.hintSol')}
        </p>
        
        <div className="flex justify-center mb-6">
          <SolanaWalletButton />
        </div>
        
        {/* SOL on Solana info */}
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mt-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Coins className="text-primary" size={18} />
            <span className="font-medium text-primary">{t('walletRequired.solanaInfo')}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('walletRequired.solanaDescription')}
          </p>
        </div>
      </div>
    </div>
  );
}
