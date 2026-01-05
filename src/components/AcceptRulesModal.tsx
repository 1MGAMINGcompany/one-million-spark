import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, Clock, AlertTriangle, Coins, Loader2, Wallet } from "lucide-react";

interface AcceptRulesModalProps {
  open: boolean;
  onAccept: () => void;
  onLeave: () => void;
  stakeSol: number;
  turnTimeSeconds: number;
  isLoading?: boolean;
  opponentReady?: boolean;
  /** Whether authoritative room data has loaded - blocks modal if false */
  isDataLoaded: boolean;
  /** Connected wallet address for verification display */
  connectedWallet?: string;
  /** Room PDA for debugging */
  roomPda?: string;
  /** Room players for wallet validation */
  roomPlayers?: string[];
}

export function AcceptRulesModal({
  open,
  onAccept,
  onLeave,
  stakeSol,
  turnTimeSeconds,
  isLoading = false,
  opponentReady = false,
  isDataLoaded,
  connectedWallet,
  roomPda,
  roomPlayers = [],
}: AcceptRulesModalProps) {
  // Validate wallet is in room (prevent accepting with wrong wallet)
  const walletInRoom = connectedWallet && roomPlayers.length > 0
    ? roomPlayers.some(p => p.toLowerCase() === connectedWallet.toLowerCase())
    : true; // Allow if roomPlayers not passed

  // Disable accept if data not loaded OR wallet not in room
  const canAccept = isDataLoaded && walletInRoom && stakeSol > 0;
  // Debug logging when modal opens with loaded data
  useEffect(() => {
    if (open && isDataLoaded) {
      console.log("[RulesModalData]", {
        roomPda: roomPda?.slice(0, 8),
        stakeLamports: Math.round(stakeSol * 1_000_000_000),
        turnTimeSeconds,
        source: "onchain-room",
        connectedWallet: connectedWallet?.slice(0, 8),
      });
    }
  }, [open, isDataLoaded, roomPda, stakeSol, turnTimeSeconds, connectedWallet]);
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

  // Format wallet address for display
  const formatWallet = (wallet: string): string => {
    if (wallet.length <= 12) return wallet;
    return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
  };

  // Show loading state if data not loaded yet
  if (!isDataLoaded) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent 
          className="sm:max-w-md" 
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">Loading match details...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md max-h-[85vh] flex flex-col" 
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-5 w-5 text-primary" />
            Ranked Match Rules
          </DialogTitle>
          <DialogDescription>
            Review the match conditions before starting.
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

          {/* Acceptance Notice */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">
              By paying the stake, you agreed to these rules. Click "Ready" to confirm you've reviewed them.
            </p>
          </div>

          {/* Opponent Status */}
          {opponentReady && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-sm text-emerald-600 text-center">
                ✓ Your opponent is ready
              </p>
            </div>
          )}

          {/* Connected Wallet Verification */}
          {connectedWallet && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Wallet className="h-3 w-3" />
                <span>Connected wallet:</span>
                <span className="font-mono font-medium text-foreground">
                  {formatWallet(connectedWallet)}
                </span>
              </div>
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
            disabled={isLoading || !canAccept}
            className="flex-1"
          >
            {isLoading 
              ? "Please wait..." 
              : !walletInRoom 
                ? "Wrong wallet connected" 
                : !isDataLoaded 
                  ? "Loading..." 
                  : "I'm Ready"
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
