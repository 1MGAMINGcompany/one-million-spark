import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, Flag, Handshake } from "lucide-react";
import { useRoom, formatEntryFee, formatRoom } from "@/hooks/useRoomManager";
import { usePolPrice } from "@/hooks/usePolPrice";
import { GameSyncStatus } from "@/components/GameSyncStatus";
import { useGameSync, useTurnTimer, DominoMove } from "@/hooks/useGameSync";
import { useWallet } from "@/hooks/useWallet";
import DominoTile3D from "@/components/DominoTile3D";
import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

const initialPlayerHand = [
  [6, 6], [5, 4], [3, 2], [1, 0], [4, 4], [2, 1], [6, 3]
];

const initialBoardTiles = [
  { tile: [5, 5] as [number, number] },
  { tile: [5, 3] as [number, number] },
  { tile: [3, 1] as [number, number] },
];

const DominosGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { formatUsd } = usePolPrice();
  const { address } = useWallet();
  const { toast } = useToast();
  
  const roomIdBigInt = roomId ? BigInt(roomId) : undefined;
  const { data: roomData } = useRoom(roomIdBigInt);
  const room = roomData ? formatRoom(roomData) : null;
  
  const [playerHand, setPlayerHand] = useState(initialPlayerHand);
  const [boardTiles, setBoardTiles] = useState(initialBoardTiles);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [gameEnded, setGameEnded] = useState(false);

  const entryFeeFormatted = room ? formatEntryFee(room.entryFee) : "...";
  const prizePool = room ? (parseFloat(entryFeeFormatted) * room.maxPlayers * 0.95).toFixed(3) : "...";

  const handleOpponentMove = useCallback((move: DominoMove) => {
    setBoardTiles(prev => [...prev, { tile: move.tile }]);
  }, []);

  const {
    gameState,
    isConnected,
    opponentConnected,
    isMyTurn,
    sendMove,
    sendResign,
    sendDrawOffer,
  } = useGameSync({
    roomId: roomId || "",
    gameType: "dominos",
    onOpponentMove: handleOpponentMove as any,
    onGameEnd: () => setGameEnded(true),
    onOpponentResign: () => setGameEnded(true),
  });

  const opponentAddress = gameState?.players.find(
    (p) => p.toLowerCase() !== address?.toLowerCase()
  );

  const remainingTime = useTurnTimer(
    isMyTurn,
    gameState?.turnTimeSeconds || 300,
    gameState?.turnStartedAt || Date.now(),
    () => toast({ title: "Time's up!", variant: "destructive" })
  );

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 bg-card border border-border rounded-lg p-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Dominos – Room #{roomId}</h1>
            <p className="text-sm text-muted-foreground">Prize Pool: {prizePool} POL {room && `(~${formatUsd(parseFloat(prizePool))})`}</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-1 bg-primary/20 text-primary rounded">Your Turn</span>
            <span className="text-muted-foreground">15s remaining</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1">
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">Opponent's Hand</p>
              <div className="flex gap-1 justify-center">
                {[1,2,3,4,5,6,7].map((i) => (
                  <div key={i} className="w-8 h-16 bg-gradient-to-br from-zinc-800 to-zinc-900 border border-primary/30 rounded" />
                ))}
              </div>
            </div>

            <div className="aspect-[2/1] bg-gradient-to-br from-emerald-900/50 to-emerald-950/70 border border-primary/20 rounded-lg flex items-center justify-center p-4 overflow-hidden">
              <div className="flex gap-1">
                {boardTiles.map((t, i) => (
                  <DominoTile3D key={i} left={t.tile[0]} right={t.tile[1]} />
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-2">Your Hand</p>
              <div className="flex gap-2 justify-center flex-wrap">
                {playerHand.map((tile, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedTile(selectedTile === i ? null : i)}
                    className={`cursor-pointer transition-transform ${selectedTile === i ? 'scale-110 -translate-y-2' : 'hover:scale-105'}`}
                  >
                    <DominoTile3D left={tile[0]} right={tile[1]} isSelected={selectedTile === i} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-72 space-y-4">
            {/* Connection Status */}
            <GameSyncStatus
              isConnected={isConnected}
              opponentConnected={opponentConnected}
              isMyTurn={isMyTurn}
              remainingTime={remainingTime}
              playerAddress={address}
              opponentAddress={opponentAddress}
            />

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Game Status</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Your tiles:</span><span className="text-foreground font-medium">{playerHand.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Opponent tiles:</span><span className="text-foreground font-medium">7</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Draw pile:</span><span className="text-foreground font-medium">14</span></div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Move History</h3>
              <div className="h-32 overflow-y-auto space-y-1 text-sm">
                <div className="text-muted-foreground">1. You played [5|5]</div>
                <div className="text-muted-foreground">2. Opponent played [5|3]</div>
                <div className="text-muted-foreground">3. You played [3|1]</div>
              </div>
            </div>

            <div className="space-y-2">
              <Button variant="outline" className="w-full" disabled>Draw from Pile</Button>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2"><Handshake size={16} />Offer Draw</Button>
                <Button variant="outline" className="flex-1 gap-2 text-destructive hover:text-destructive"><Flag size={16} />Resign</Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-8">
          <Button variant="outline" size="lg" asChild>
            <Link to="/"><Home size={18} className="mr-2" />Return to Lobby</Link>
          </Button>
        </div>

        <div className="mt-8 bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">How It Works</h3>
          <ul className="space-y-2 text-muted-foreground text-sm">
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Win by playing all your tiles first, or having the lowest pip count when blocked.</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Match tile ends to play – if you can't play, draw from the pile.</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Entry fees are held in a smart contract until the result is confirmed.</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Winner receives the prize pool minus a 5% platform fee.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DominosGame;
