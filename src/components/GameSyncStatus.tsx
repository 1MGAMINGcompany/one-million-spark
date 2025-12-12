import { cn } from "@/lib/utils";
import { Wifi, WifiOff, User, Clock, RefreshCw, Radio, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GameSyncStatusProps {
  isConnected: boolean;
  opponentConnected: boolean;
  isMyTurn: boolean;
  remainingTime: number;
  playerAddress?: string;
  opponentAddress?: string;
  connectionType?: "webrtc" | "broadcast" | "none";
  isPushEnabled?: boolean;
  onReconnect?: () => void;
}

export function GameSyncStatus({
  isConnected,
  opponentConnected,
  isMyTurn,
  remainingTime,
  playerAddress,
  opponentAddress,
  connectionType = "none",
  isPushEnabled = false,
  onReconnect,
}: GameSyncStatusProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isLowTime = remainingTime <= 10;
  const isCriticalTime = remainingTime <= 5;

  const getConnectionLabel = () => {
    if (!isConnected) return "Connecting...";
    if (connectionType === "webrtc") {
      return isPushEnabled ? "P2P (Cross-Device)" : "P2P (Local)";
    }
    return "Connected";
  };

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-3">
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              {connectionType === "webrtc" ? (
                <div className="relative">
                  <Radio className="w-4 h-4 text-green-500" />
                  {isPushEnabled && (
                    <Zap className="w-2.5 h-2.5 text-yellow-400 absolute -top-1 -right-1" />
                  )}
                </div>
              ) : (
                <Wifi className="w-4 h-4 text-green-500" />
              )}
              <span className="text-sm text-muted-foreground">
                {getConnectionLabel()}
              </span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-yellow-500 animate-pulse" />
              <span className="text-sm text-muted-foreground">Connecting...</span>
            </>
          )}
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

      {/* Reconnect button if disconnected */}
      {!isConnected && onReconnect && (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={onReconnect}
        >
          <RefreshCw className="w-4 h-4" />
          Reconnect
        </Button>
      )}

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
