import { cn } from "@/lib/utils";
import { Wifi, WifiOff, User, Clock, RefreshCw, Radio, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TurnPlayer } from "@/hooks/useTurnNotifications";

interface GameSyncStatusProps {
  isConnected: boolean;
  opponentConnected?: boolean;
  isMyTurn: boolean;
  remainingTime: number;
  playerAddress?: string;
  opponentAddress?: string;
  connectionType?: "webrtc" | "broadcast" | "none";
  isPushEnabled?: boolean;
  onReconnect?: () => void;
  // Multi-player support
  players?: TurnPlayer[];
  activePlayer?: TurnPlayer;
  myAddress?: string;
}

const PLAYER_COLORS: Record<string, string> = {
  gold: "text-yellow-400",
  ruby: "text-red-400",
  emerald: "text-emerald-400",
  sapphire: "text-blue-400",
  red: "text-red-400",
  green: "text-emerald-400",
  blue: "text-blue-400",
  yellow: "text-yellow-400",
};

function getPlayerDisplayName(player: TurnPlayer): string {
  if (player.name) return player.name;
  if (player.color) return `${player.color.charAt(0).toUpperCase() + player.color.slice(1)} Player`;
  return `Player ${player.seatIndex + 1}`;
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
  players,
  activePlayer,
  myAddress,
}: GameSyncStatusProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isLowTime = remainingTime <= 10;
  const isCriticalTime = remainingTime <= 5;
  const isMultiPlayer = players && players.length > 2;

  const getConnectionLabel = () => {
    if (!isConnected) return "Connecting...";
    if (connectionType === "webrtc") {
      return isPushEnabled ? "P2P (Cross-Device)" : "P2P (Local)";
    }
    return "Connected";
  };

  const getWaitingLabel = () => {
    if (isMultiPlayer && activePlayer) {
      return `Waiting for ${getPlayerDisplayName(activePlayer)}`;
    }
    return "Opponent's turn";
  };

  const activeColor = activePlayer?.color?.toLowerCase();
  const turnColorClass = activeColor ? PLAYER_COLORS[activeColor] : "text-primary";

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
        
        {/* Player count for multi-player or opponent status for 2-player */}
        <div className="flex items-center gap-2">
          {isMultiPlayer && players ? (
            <span className="text-sm text-muted-foreground">
              {players.filter(p => p.status === "active").length}/{players.length} players
            </span>
          ) : (
            <>
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  opponentConnected ? "bg-green-500" : "bg-yellow-500 animate-pulse"
                )}
              />
              <span className="text-sm text-muted-foreground">
                {opponentConnected ? "Opponent online" : "Waiting..."}
              </span>
            </>
          )}
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
          {isMyTurn ? (
            <>
              <Crown className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-sm font-semibold text-primary">
                Your turn
              </span>
            </>
          ) : (
            <>
              <User className={cn("w-4 h-4", turnColorClass)} />
              <span className={cn("text-sm font-medium", turnColorClass)}>
                {getWaitingLabel()}
              </span>
            </>
          )}
        </div>
        
        {/* Timer */}
        {remainingTime > 0 && (
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
        )}
      </div>

      {/* Multi-player status row */}
      {isMultiPlayer && players && (
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
          {players.map((player) => {
            const isActive = player.address === activePlayer?.address;
            const isMe = player.address === myAddress;
            const color = player.color?.toLowerCase();
            const dotColor = color ? PLAYER_COLORS[color] : "text-muted-foreground";

            return (
              <div
                key={player.address}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded text-xs",
                  isActive && "bg-primary/10 ring-1 ring-primary/30",
                  player.status === "finished" && "opacity-50",
                  player.status === "disconnected" && "opacity-30"
                )}
              >
                <div
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    player.status === "active"
                      ? isActive
                        ? "bg-primary"
                        : `bg-current ${dotColor}`
                      : player.status === "finished"
                      ? "bg-green-500"
                      : "bg-red-500"
                  )}
                />
                <span className={cn(isMe && "text-primary font-medium")}>
                  {isMe ? "You" : player.color || `P${player.seatIndex + 1}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Player Addresses (2-player games) */}
      {!isMultiPlayer && (playerAddress || opponentAddress) && (
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
