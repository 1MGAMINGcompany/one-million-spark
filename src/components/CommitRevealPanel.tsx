import { useAccount } from "wagmi";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Clock, AlertTriangle, Shield, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { 
  useSeedState, 
  useCommitSeed, 
  useRevealSeed, 
  useRefundSeed,
  parseSeedState,
  useCountdown,
  formatCountdown,
} from "@/hooks/useCommitReveal";
import { SeedPhase } from "@/contracts/seedManager";
import { getStoredSecret, clearStoredSecret, shortenBytes32, storeFinalSeedHash, seedIntFromFinalSeedHash } from "@/lib/seedUtils";

interface CommitRevealPanelProps {
  roomId: bigint;
  players: `0x${string}`[];
  onSeedFinalized?: (seedInt: number, finalSeedHash: `0x${string}`) => void;
  onRefunded?: () => void;
}

export function CommitRevealPanel({ roomId, players, onSeedFinalized, onRefunded }: CommitRevealPanelProps) {
  const { address } = useAccount();
  const { toast } = useToast();
  const { play } = useSound();
  
  const [hasCalledFinalized, setHasCalledFinalized] = useState(false);
  
  // Contract reads
  const { data: seedStateRaw, refetch: refetchSeedState } = useSeedState(roomId);
  const seedState = parseSeedState(seedStateRaw);
  
  // Contract writes
  const { 
    commitSeed, 
    isPending: isCommitPending, 
    isConfirming: isCommitConfirming, 
    isSuccess: isCommitSuccess,
    error: commitError,
    reset: resetCommit 
  } = useCommitSeed();
  
  const { 
    revealSeed, 
    isPending: isRevealPending, 
    isConfirming: isRevealConfirming, 
    isSuccess: isRevealSuccess,
    error: revealError,
    reset: resetReveal 
  } = useRevealSeed();
  
  const { 
    refundSeed, 
    isPending: isRefundPending, 
    isConfirming: isRefundConfirming, 
    isSuccess: isRefundSuccess,
    error: refundError,
    reset: resetRefund 
  } = useRefundSeed();
  
  // Countdown timers
  const commitSecondsLeft = useCountdown(seedState?.commitDeadline);
  const revealSecondsLeft = useCountdown(seedState?.revealDeadline);
  
  // Check if current user has committed/revealed
  const hasCommitted = seedState?.committedPlayers.some(
    p => p.toLowerCase() === address?.toLowerCase()
  ) ?? false;
  
  const hasRevealed = seedState?.revealedPlayers.some(
    p => p.toLowerCase() === address?.toLowerCase()
  ) ?? false;
  
  // Has stored secret (can reveal)
  const hasStoredSecret = address ? !!getStoredSecret(roomId.toString(), address) : false;
  
  // Handle commit success
  useEffect(() => {
    if (isCommitSuccess) {
      play("ui_click");
      toast({ title: "Seed Committed", description: "Your secret has been committed. Wait for others." });
      resetCommit();
      refetchSeedState();
    }
  }, [isCommitSuccess, play, toast, resetCommit, refetchSeedState]);
  
  // Handle reveal success
  useEffect(() => {
    if (isRevealSuccess && address) {
      play("ui_click");
      toast({ title: "Seed Revealed", description: "Your secret has been revealed." });
      clearStoredSecret(roomId.toString(), address);
      resetReveal();
      refetchSeedState();
    }
  }, [isRevealSuccess, address, roomId, play, toast, resetReveal, refetchSeedState]);
  
  // Handle refund success
  useEffect(() => {
    if (isRefundSuccess) {
      play("system_error");
      toast({ 
        title: "Room Refunded", 
        description: "Entry fees have been refunded (no platform fee).",
        variant: "destructive"
      });
      resetRefund();
      onRefunded?.();
    }
  }, [isRefundSuccess, play, toast, resetRefund, onRefunded]);
  
  // Handle seed finalized
  useEffect(() => {
    if (seedState?.phase === SeedPhase.Finalized && !hasCalledFinalized) {
      const finalHash = seedState.finalSeedHash;
      if (finalHash && finalHash !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        const seedInt = seedIntFromFinalSeedHash(finalHash);
        storeFinalSeedHash(roomId.toString(), finalHash);
        setHasCalledFinalized(true);
        play("rooms_match-start");
        toast({ title: "Seed Finalized!", description: "Fair randomness established. Game can begin." });
        onSeedFinalized?.(seedInt, finalHash);
      }
    }
  }, [seedState, roomId, hasCalledFinalized, play, toast, onSeedFinalized]);
  
  // Error handling
  useEffect(() => {
    if (commitError) {
      toast({ title: "Commit Failed", description: String(commitError), variant: "destructive" });
    }
    if (revealError) {
      toast({ title: "Reveal Failed", description: String(revealError), variant: "destructive" });
    }
    if (refundError) {
      toast({ title: "Refund Failed", description: String(refundError), variant: "destructive" });
    }
  }, [commitError, revealError, refundError, toast]);
  
  // Handle actions
  const handleCommit = () => {
    play("ui_click");
    commitSeed(roomId);
  };
  
  const handleReveal = () => {
    play("ui_click");
    const success = revealSeed(roomId);
    if (!success) {
      toast({ 
        title: "Cannot Reveal", 
        description: "No stored secret found. You may have already revealed or cleared browser data.",
        variant: "destructive"
      });
    }
  };
  
  const handleRefund = () => {
    play("ui_click");
    refundSeed(roomId);
  };
  
  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    toast({ title: "Copied", description: "Hash copied to clipboard." });
  };
  
  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  
  // Render player status
  const renderPlayerStatus = (player: `0x${string}`) => {
    const isMe = player.toLowerCase() === address?.toLowerCase();
    const committed = seedState?.committedPlayers.some(p => p.toLowerCase() === player.toLowerCase()) ?? false;
    const revealed = seedState?.revealedPlayers.some(p => p.toLowerCase() === player.toLowerCase()) ?? false;
    
    let status = "⏳ Waiting";
    let statusColor = "text-muted-foreground";
    
    if (seedState?.phase === SeedPhase.Committing || seedState?.phase === SeedPhase.None) {
      if (committed) {
        status = "✅ Committed";
        statusColor = "text-green-500";
      }
    } else if (seedState?.phase === SeedPhase.Revealing) {
      if (revealed) {
        status = "✅ Revealed";
        statusColor = "text-green-500";
      } else if (committed) {
        status = "⏳ Awaiting Reveal";
        statusColor = "text-amber-500";
      }
    }
    
    return (
      <div key={player} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{shortenAddress(player)}</span>
          {isMe && <Badge variant="outline" className="text-xs">You</Badge>}
        </div>
        <span className={`text-sm ${statusColor}`}>{status}</span>
      </div>
    );
  };
  
  // Phase-specific content
  const renderPhaseContent = () => {
    // Phase: None or Committing
    if (seedState?.phase === SeedPhase.None || seedState?.phase === SeedPhase.Committing) {
      const canCommit = !hasCommitted && address;
      const allCommitted = players.every(p => 
        seedState?.committedPlayers.some(cp => cp.toLowerCase() === p.toLowerCase())
      );
      
      return (
        <>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">Commit Phase</span>
            {commitSecondsLeft > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                {formatCountdown(commitSecondsLeft)}
              </Badge>
            )}
          </div>
          
          <div className="space-y-1 mb-4">
            {players.map(renderPlayerStatus)}
          </div>
          
          {canCommit && (
            <Button 
              onClick={handleCommit} 
              disabled={isCommitPending || isCommitConfirming}
              className="w-full"
            >
              {isCommitPending || isCommitConfirming ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Committing...</>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" /> Commit Seed
                </>
              )}
            </Button>
          )}
          
          {hasCommitted && !allCommitted && (
            <p className="text-sm text-center text-muted-foreground">
              Waiting for all players to commit...
            </p>
          )}
        </>
      );
    }
    
    // Phase: Revealing
    if (seedState?.phase === SeedPhase.Revealing) {
      const canReveal = hasCommitted && !hasRevealed && hasStoredSecret && address;
      const allRevealed = players.every(p => 
        seedState?.revealedPlayers.some(rp => rp.toLowerCase() === p.toLowerCase())
      );
      const timeoutExpired = revealSecondsLeft === 0;
      
      return (
        <>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">Reveal Phase</span>
            {revealSecondsLeft > 0 ? (
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                {formatCountdown(revealSecondsLeft)}
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Timeout!
              </Badge>
            )}
          </div>
          
          <div className="space-y-1 mb-4">
            {players.map(renderPlayerStatus)}
          </div>
          
          {canReveal && (
            <Button 
              onClick={handleReveal} 
              disabled={isRevealPending || isRevealConfirming}
              className="w-full"
            >
              {isRevealPending || isRevealConfirming ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Revealing...</>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" /> Reveal Seed
                </>
              )}
            </Button>
          )}
          
          {hasRevealed && !allRevealed && (
            <p className="text-sm text-center text-muted-foreground">
              Waiting for all players to reveal...
            </p>
          )}
          
          {timeoutExpired && !allRevealed && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive mb-2">
                Reveal timeout expired. A player did not reveal their secret.
              </p>
              <Button 
                onClick={handleRefund} 
                disabled={isRefundPending || isRefundConfirming}
                variant="destructive"
                className="w-full"
              >
                {isRefundPending || isRefundConfirming ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing Refund...</>
                ) : (
                  "Claim Refund (No Fee)"
                )}
              </Button>
            </div>
          )}
        </>
      );
    }
    
    // Phase: Finalized
    if (seedState?.phase === SeedPhase.Finalized) {
      return (
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-green-500">
            <CheckCircle2 className="h-6 w-6" />
            <span className="font-semibold">Seed Finalized</span>
          </div>
          
          {seedState.finalSeedHash && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Final Seed Hash</p>
              <div className="flex items-center justify-center gap-2">
                <code className="text-xs font-mono">
                  {shortenBytes32(seedState.finalSeedHash)}
                </code>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={() => copyHash(seedState.finalSeedHash)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
          
          <p className="text-sm text-muted-foreground">
            Fair randomness established. The game can now begin!
          </p>
        </div>
      );
    }
    
    // Phase: Refunded
    if (seedState?.phase === SeedPhase.Refunded) {
      return (
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-destructive">
            <AlertTriangle className="h-6 w-6" />
            <span className="font-semibold">Room Cancelled / Refunded</span>
          </div>
          <p className="text-sm text-muted-foreground">
            A player failed to reveal their secret. All entry fees have been refunded (no platform fee).
          </p>
        </div>
      );
    }
    
    return null;
  };
  
  return (
    <Card className="border-primary/30 bg-card/90 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-cinzel flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Fair Randomness (Commit–Reveal)
        </CardTitle>
        <CardDescription className="text-xs">
          Each player commits a secret, then reveals it. The final seed is computed from all secrets.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {renderPhaseContent()}
      </CardContent>
    </Card>
  );
}
