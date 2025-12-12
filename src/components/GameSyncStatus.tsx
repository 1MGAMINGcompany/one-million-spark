import { cn } from "@/lib/utils";
import { Wifi, WifiOff, User, Clock } from "lucide-react";

interface GameSyncStatusProps {
  isConnected: boolean;
  opponentConnected: boolean;
  isMyTurn: boolean;
  remainingTime: number;
  playerAddress?: string;
  opponentAddress?: string;
}

export function GameSyncStatus({
  isConnected,
  opponentConnected,
  isMyTurn,
  remainingTime,
  playerAddress,
  opponentAddress,
}: GameSyncStatusProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isLowTime = remainingTime <= 10;
  const isCriticalTime = remainingTime <= 5;

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-3">
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi className="w-4 h-4 text-green-500" />
          ) : (
            <WifiOff className="w-4 h-4 text-destructive" />
          )}
          <span className="text-sm text-muted-foreground">
            {isConnected ? "Connected" : "Connecting..."}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              opponentConnected ? "bg-green-500" : "bg-yellow-500 animate-pulse"
            )}
          />
          <span className="text-sm text-muted-foreground">
            {opponentConnected ? "Opponent online" : "Waiting..."}
          </span>
        </div>
      </div>

      {/* Turn Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <span
            className={cn(
              "text-sm font-medium",
              isMyTurn ? "text-primary" : "text-muted-foreground"
            )}
          >
            {isMyTurn ? "Your turn" : "Opponent's turn"}
          </span>
        </div>
        
        {/* Timer */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded",
            isMyTurn && isCriticalTime
              ? "bg-destructive/20 text-destructive animate-pulse"
              : isMyTurn && isLowTime
              ? "bg-yellow-500/20 text-yellow-500"
              : isMyTurn
              ? "bg-primary/20 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Clock className="w-4 h-4" />
          <span className="text-sm font-mono font-medium">
            {formatTime(remainingTime)}
          </span>
        </div>
      </div>

      {/* Player Addresses */}
      {(playerAddress || opponentAddress) && (
        <div className="pt-2 border-t border-border space-y-1">
          {playerAddress && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">You:</span>
              <span className="text-foreground font-mono">
                {playerAddress.slice(0, 6)}...{playerAddress.slice(-4)}
              </span>
            </div>
          )}
          {opponentAddress && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Opponent:</span>
              <span className="text-foreground font-mono">
                {opponentAddress.slice(0, 6)}...{opponentAddress.slice(-4)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
