import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, Clock, AlertTriangle, Coins, Pen } from "lucide-react";

interface AcceptRulesModalProps {
  open: boolean;
  onAccept: () => void;
  onLeave: () => void;
  stakeSol: number;
  turnTimeSeconds?: number;
  isLoading?: boolean;
  opponentReady?: boolean;
  /** Whether this is a signature-based acceptance (shows different UI) - deprecated, now always false */
  requiresSignature?: boolean;
}

export function AcceptRulesModal({
  open,
  onAccept,
  onLeave,
  stakeSol,
  turnTimeSeconds = 60,
  isLoading = false,
  opponentReady = false,
  requiresSignature = false, // On-chain stake is the acceptance, no separate signature needed
}: AcceptRulesModalProps) {
  const feeSol = stakeSol * 2 * 0.05; // 5% of total pot
  const potSol = stakeSol * 2;
  const payoutSol = potSol - feeSol;
  
  // Format turn time for display
  const formatTurnTime = (seconds: number): string => {
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}m ${secs}s` : `${mins} minute${mins > 1 ? 's' : ''}`;
    }
    return `${seconds} seconds`;
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md max-h-[85vh] flex flex-col" 
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-5 w-5 text-primary" />
            Accept Ranked Match Rules
          </DialogTitle>
          <DialogDescription>
            {requiresSignature 
              ? "Sign with your wallet to confirm you accept these terms."
              : "Review and accept the match conditions to start playing."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1">
          {/* Stake & Pot */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Coins className="h-4 w-4 text-amber-500" />
              Stakes & Payout
            </div>
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
          </div>

          {/* Turn Time */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-blue-500" />
              Turn Rules
            </div>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <span className="font-medium text-foreground">{formatTurnTime(turnTimeSeconds)}</span> per turn</li>
              <li>• Timer expires = automatic forfeit</li>
              <li>• No take-backs after confirming a move</li>
            </ul>
          </div>

          {/* Forfeit Warning */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              Forfeit Policy
            </div>
            <p className="text-sm text-amber-600/80">
              Leaving mid-game or extended inactivity will result in automatic forfeit. 
              Your stake will be awarded to your opponent.
            </p>
          </div>

          {/* Signature Notice */}
          {requiresSignature && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-sm text-primary">
                <Pen className="h-4 w-4" />
                <span className="font-medium">Wallet signature required</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Your wallet will ask you to sign a message confirming these rules. 
                This creates a cryptographic proof of your agreement.
              </p>
            </div>
          )}

          {/* Opponent Status */}
          {opponentReady && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-sm text-emerald-600 text-center">
                ✓ Your opponent has accepted the rules
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2 pb-safe shrink-0">
          <Button
            variant="outline"
            onClick={onLeave}
            disabled={isLoading}
            className="flex-1"
          >
            Leave Match
          </Button>
          <Button
            variant="gold"
            onClick={onAccept}
            disabled={isLoading}
            className="flex-1 gap-2"
          >
            {requiresSignature && <Pen className="h-4 w-4" />}
            {isLoading 
              ? "Signing..." 
              : requiresSignature 
                ? "Sign & Accept" 
                : "Accept & Start"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
