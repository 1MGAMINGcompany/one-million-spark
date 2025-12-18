import { useState, useMemo, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Construction, Users } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useTurnNotifications, TurnPlayer } from "@/hooks/useTurnNotifications";
import TurnStatusHeader from "@/components/TurnStatusHeader";
import TurnHistoryDrawer from "@/components/TurnHistoryDrawer";
import NotificationToggle from "@/components/NotificationToggle";
import TurnBanner from "@/components/TurnBanner";

interface MultiplayerGamePlaceholderProps {
  roomId: string;
  gameName: string;
  gameType: string;
  maxPlayers: number;
  aiPath: string;
}

/**
 * Placeholder component for multiplayer games with turn notification system.
 * Used while actual game logic is being implemented.
 */
export function MultiplayerGamePlaceholder({
  roomId,
  gameName,
  gameType,
  maxPlayers,
  aiPath,
}: MultiplayerGamePlaceholderProps) {
  const navigate = useNavigate();
  const { isConnected: walletConnected, address } = useWallet();
  
  // Simulated turn state for demo purposes
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [roomPlayers, setRoomPlayers] = useState<string[]>([]);
  
  // Generate simulated players when wallet connects
  useEffect(() => {
    if (address) {
      const players = [address];
      for (let i = 1; i < maxPlayers; i++) {
        players.push(`opponent-${i}-${roomId}`);
      }
      setRoomPlayers(players);
    }
  }, [address, roomId, maxPlayers]);

  // Find which player index the current wallet is
  const myPlayerIndex = useMemo(() => {
    if (!address || roomPlayers.length === 0) return -1;
    return roomPlayers.findIndex(p => p.toLowerCase() === address.toLowerCase());
  }, [address, roomPlayers]);

  // Convert to TurnPlayer format
  const turnPlayers: TurnPlayer[] = useMemo(() => {
    const colors = ["gold", "ruby", "emerald", "sapphire"];
    return roomPlayers.map((playerAddress, index) => {
      const isHuman = playerAddress.toLowerCase() === address?.toLowerCase();
      return {
        address: playerAddress,
        name: isHuman ? "You" : `Player ${index + 1}`,
        color: colors[index % colors.length],
        status: "active" as const,
        seatIndex: index,
      };
    });
  }, [roomPlayers, address]);

  const activeTurnAddress = turnPlayers[currentPlayerIndex]?.address || null;

  // Turn notification system
  const {
    isMyTurn,
    notificationsEnabled,
    hasPermission,
    turnHistory,
    toggleNotifications,
    recordPlayerMove,
  } = useTurnNotifications({
    gameName,
    roomId,
    players: turnPlayers,
    activeTurnAddress,
    myAddress: address,
    enabled: true,
  });

  // Demo: Simulate turn rotation
  const simulateTurn = useCallback(() => {
    const currentPlayer = turnPlayers[currentPlayerIndex];
    if (currentPlayer) {
      recordPlayerMove(currentPlayer.address, `Made a move`);
    }
    setCurrentPlayerIndex(prev => (prev + 1) % maxPlayers);
  }, [currentPlayerIndex, maxPlayers, turnPlayers, recordPlayerMove]);

  // Require wallet connection
  if (!walletConnected || !address) {
    return (
      <div className="container max-w-4xl py-8 px-4">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/room-list")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Rooms
        </Button>
        <div className="text-center py-12">
          <Users className="h-16 w-16 text-primary mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Connect Wallet to Play</h3>
          <p className="text-muted-foreground">Please connect your wallet to join this game.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Turn Banner (fallback for no permission) */}
      <TurnBanner
        gameName={gameName}
        roomId={roomId}
        isVisible={!hasPermission && isMyTurn}
      />

      {/* Header */}
      <div className="relative py-3 px-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
              <Link to="/room-list" className="flex items-center gap-2">
                <ArrowLeft size={18} />
                <span className="hidden sm:inline">Rooms</span>
              </Link>
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-display font-bold text-primary">
                {gameName} - Room #{roomId}
              </h1>
              <p className="text-xs text-muted-foreground">
                {maxPlayers}-Player Multiplayer
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Turn History Drawer */}
            <TurnHistoryDrawer events={turnHistory} />
            
            {/* Notification Toggle */}
            <NotificationToggle
              enabled={notificationsEnabled}
              hasPermission={hasPermission}
              onToggle={toggleNotifications}
            />
          </div>
        </div>
      </div>

      {/* Turn Status Header */}
      <div className="px-4 pb-2">
        <div className="max-w-4xl mx-auto">
          <TurnStatusHeader
            isMyTurn={isMyTurn}
            activePlayer={turnPlayers[currentPlayerIndex]}
            players={turnPlayers}
            myAddress={address}
          />
        </div>
      </div>

      {/* Placeholder Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <Construction className="h-20 w-20 text-primary mx-auto mb-6 animate-pulse" />
          <h2 className="text-2xl font-display font-bold mb-3">Solana Integration Coming Soon</h2>
          <p className="text-muted-foreground mb-6">
            Multiplayer {gameName} with SOL entry fees will be available soon.
            Turn notifications are already active!
          </p>
          
          <div className="space-y-3">
            {/* Demo button to test turn rotation */}
            <Button onClick={simulateTurn} variant="outline" className="w-full">
              <RotateCcw className="mr-2 h-4 w-4" />
              Simulate Turn (Demo)
            </Button>
            
            <Button variant="default" className="w-full" onClick={() => navigate(aiPath)}>
              Play vs AI (Free)
            </Button>
            
            <Button variant="ghost" className="w-full" onClick={() => navigate("/room-list")}>
              Back to Rooms
            </Button>
          </div>
        </div>
      </div>

      {/* Player Status Footer */}
      <div className="flex-shrink-0 py-3 px-4 border-t border-border/30">
        <div className="max-w-4xl mx-auto flex justify-center gap-4 text-xs text-muted-foreground">
          {turnPlayers.map((player, idx) => (
            <div key={player.address} className="flex items-center gap-1.5">
              <div 
                className={`w-2 h-2 rounded-full ${
                  idx === currentPlayerIndex ? 'bg-primary animate-pulse' : 'bg-muted-foreground/50'
                }`}
              />
              <span className={idx === myPlayerIndex ? "text-primary font-medium" : ""}>
                {idx === myPlayerIndex ? "You" : `Player ${idx + 1}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MultiplayerGamePlaceholder;