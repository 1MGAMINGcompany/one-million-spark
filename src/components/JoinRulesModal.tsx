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

interface JoinRulesModalProps {
  open: boolean;
  onConfirmJoin: () => void;
  onCancel: () => void;
  gameName: string;
  stakeSol: number;
  isRanked: boolean;
  isLoading?: boolean;
  /** Room mode for display text */
  mode?: 'casual' | 'ranked' | 'private';
}

export function JoinRulesModal({
  open,
  onConfirmJoin,
  onCancel,
  gameName,
  stakeSol,
  isRanked,
  isLoading = false,
  mode = isRanked ? 'ranked' : 'casual',
}: JoinRulesModalProps) {
  const feeSol = stakeSol * 2 * 0.05; // 5% of total pot
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
            Join {gameName} Match
          </DialogTitle>
          <DialogDescription>
            Review the game rules before joining this {mode === 'private' ? 'private' : mode === 'ranked' ? 'ranked' : 'casual'} match.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1">
          {/* Stake & Payout */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Coins className="h-4 w-4 text-amber-500" />
              Stakes & Payout
            </div>
            {stakeSol > 0 ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Your stake:</div>
                <div className="font-mono font-medium">{stakeSol.toFixed(4)} SOL</div>
                <div className="text-muted-foreground">Total pot:</div>
                <div className="font-mono font-medium">{potSol.toFixed(4)} SOL</div>
                <div className="text-muted-foreground">Platform fee (5%):</div>
                <div className="font-mono text-muted-foreground">-{feeSol.toFixed(4)} SOL</div>
                <div className="text-muted-foreground">Winner payout:</div>
                <div className="font-mono font-medium text-emerald-500">{payoutSol.toFixed(4)} SOL</div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This is a free casual game with no stake.
              </p>
            )}
          </div>

          {/* Game Rules */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Shield className="h-4 w-4 text-blue-500" />
              Fair Play Rules
            </div>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Starting player is determined by dice roll</li>
              <li>• Both players see the same game state</li>
              <li>• Moves are final once confirmed</li>
              <li>• Game results are settled on-chain</li>
            </ul>
          </div>

          {/* Turn Timer (for ranked and private) */}
          {(isRanked || mode === 'private') && (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-primary" />
                Turn Timer
              </div>
              <p className="text-sm text-muted-foreground">
                {mode === 'private' ? 'Private' : 'Ranked'} matches have a turn timer. Exceeding it results in automatic forfeit.
              </p>
            </div>
          )}

          {/* Forfeit Warning */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              Forfeit Policy
            </div>
            <p className="text-sm text-amber-600/80">
              {stakeSol > 0 
                ? "Leaving mid-game, disconnecting, or extended inactivity results in automatic forfeit. Your stake will be awarded to your opponent."
                : "Leaving mid-game or disconnecting will result in a loss."
              }
            </p>
          </div>

          {/* Confirmation Notice */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">
              By clicking "Join & Stake", you agree to these rules and confirm you will stake{" "}
              <span className="font-medium text-foreground">{stakeSol.toFixed(4)} SOL</span> to enter this match.
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
            Cancel
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
                Joining...
              </>
            ) : stakeSol > 0 ? (
              `Join & Stake ${stakeSol.toFixed(4)} SOL`
            ) : (
              "Join Game"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
