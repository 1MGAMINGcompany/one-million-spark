/**
 * Modal shown to Player 2 before joining a room
 * Explains game rules, forfeit policies, and fees
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, Clock, AlertTriangle, Coins, Users, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface JoinRulesModalProps {
  open: boolean;
  onConfirmJoin: () => void;
  onCancel: () => void;
  gameName: string;
  stakeSol: number;
  isRanked: boolean;
  isLoading?: boolean;
}

export function JoinRulesModal({
  open,
  onConfirmJoin,
  onCancel,
  gameName,
  stakeSol,
  isRanked,
  isLoading = false,
}: JoinRulesModalProps) {
  const { t } = useTranslation();
  const feeSol = stakeSol * 2 * 0.05;
  const potSol = stakeSol * 2;
  const payoutSol = potSol - feeSol;

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent 
        className="sm:max-w-md max-h-[85vh] flex flex-col" 
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Users className="h-5 w-5 text-primary" />
            {t('joinRules.joinMatch', { game: gameName })}
          </DialogTitle>
          <DialogDescription>
            {t('joinRules.reviewRules', { mode: isRanked ? t('createRoom.gameModeRanked') : t('createRoom.gameModeCasual') })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1">
          {/* Stake & Payout */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Coins className="h-4 w-4 text-amber-500" />
              {t('joinRules.stakesPayout')}
            </div>
            {stakeSol > 0 ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">{t('joinRules.yourStake')}</div>
                <div className="font-mono font-medium">{stakeSol.toFixed(4)} SOL</div>
                <div className="text-muted-foreground">{t('joinRules.totalPot')}</div>
                <div className="font-mono font-medium">{potSol.toFixed(4)} SOL</div>
                <div className="text-muted-foreground">{t('joinRules.platformFee')}</div>
                <div className="font-mono text-muted-foreground">-{feeSol.toFixed(4)} SOL</div>
                <div className="text-muted-foreground">{t('joinRules.winnerPayout')}</div>
                <div className="font-mono font-medium text-emerald-500">{payoutSol.toFixed(4)} SOL</div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('joinRules.freeGame')}
              </p>
            )}
          </div>

          {/* Game Rules */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Shield className="h-4 w-4 text-blue-500" />
              {t('joinRules.fairPlay')}
            </div>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• {t('joinRules.diceStart')}</li>
              <li>• {t('joinRules.sameState')}</li>
              <li>• {t('joinRules.movesFinal')}</li>
              <li>• {t('joinRules.onChain')}</li>
            </ul>
          </div>

          {/* Turn Timer (for ranked) */}
          {isRanked && (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-primary" />
                {t('joinRules.turnTimer')}
              </div>
              <p className="text-sm text-muted-foreground">
                {t('joinRules.turnTimerDesc')}
              </p>
            </div>
          )}

          {/* Forfeit Warning */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              {t('joinRules.forfeitPolicy')}
            </div>
            <p className="text-sm text-amber-600/80">
              {stakeSol > 0 
                ? t('joinRules.forfeitStaked')
                : t('joinRules.forfeitFree')
              }
            </p>
          </div>

          {/* Confirmation Notice */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">
              {t('joinRules.confirmNotice', { stake: stakeSol.toFixed(4) })}
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-2 pb-safe shrink-0">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1"
          >
            {t('joinRules.cancel')}
          </Button>
          <Button
            variant="gold"
            onClick={onConfirmJoin}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('joinRules.joining')}
              </>
            ) : stakeSol > 0 ? (
              t('joinRules.joinAndStake', { stake: stakeSol.toFixed(4) })
            ) : (
              t('joinRules.joinGame')
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}