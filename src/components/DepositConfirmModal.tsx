import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DepositConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stakeAmount: number;
  onConfirm: () => void;
}

export function DepositConfirmModal({
  open,
  onOpenChange,
  stakeAmount,
  onConfirm,
}: DepositConfirmModalProps) {
  const { t } = useTranslation();

  const handleConfirm = () => {
    onOpenChange(false);
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            🔒 {t("depositModal.title", "Match Deposit Required")}
          </DialogTitle>
          <DialogDescription className="pt-2">
            {t("depositModal.description", "To start this match, you'll approve exactly")} <span className="font-semibold text-foreground">{stakeAmount} USDT</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <div className="flex items-start gap-2">
            <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
            <span className="text-sm text-muted-foreground">
              {t("depositModal.lockedFunds", "Funds are locked in the smart contract")}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
            <span className="text-sm text-muted-foreground">
              {t("depositModal.noUnlimited", "No unlimited access")}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
            <span className="text-sm text-muted-foreground">
              {t("depositModal.noWithdrawals", "No withdrawals without gameplay")}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
            <span className="text-sm text-muted-foreground">
              {t("depositModal.autoPayout", "Winner is paid automatically")}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
            <span className="text-sm text-muted-foreground">
              {t("depositModal.platformFee", "Platform fee: 5%")}
            </span>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 sm:flex-none"
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex-1 sm:flex-none"
          >
            {t("depositModal.continue", "Continue to Wallet")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
