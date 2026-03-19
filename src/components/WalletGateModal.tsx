import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wallet, Eye, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { login } = usePrivy();
  const { t } = useTranslation();

  const handlePrivyLogin = () => {
    onClose();
    login();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-background border-border">
        <DialogHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Wallet className="text-primary" size={32} />
          </div>
          <DialogTitle className="text-xl font-cinzel text-center">
            {title || "Sign in to continue"}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            {description || "Create an account or log in to play games and make predictions. Your secure wallet is created automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <Button 
            onClick={handlePrivyLogin}
            className="w-full"
            size="lg"
          >
            <Wallet className="mr-2" size={18} />
            Sign Up / Log In
          </Button>

          <div className="flex items-center gap-2 text-xs text-muted-foreground/80 justify-center">
            <Shield size={12} />
            <span>No extensions or seed phrases needed</span>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70 pt-2 border-t border-border/30">
            <Eye size={12} />
            <span>{t("wallet.browseWithoutWallet")}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
