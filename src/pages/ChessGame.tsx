import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, Flag, Handshake } from "lucide-react";
import { useRoom, formatEntryFee, formatRoom } from "@/hooks/useRoomManager";
import { usePolPrice } from "@/hooks/usePolPrice";
import { ChessBoardPremium } from "@/components/ChessBoardPremium";
import { useState, useCallback } from "react";
import { Chess, Square } from "chess.js";

const ChessGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { formatUsd } = usePolPrice();
  
  const roomIdBigInt = roomId ? BigInt(roomId) : undefined;
  const { data: roomData } = useRoom(roomIdBigInt);
  const room = roomData ? formatRoom(roomData) : null;
  
  const [game] = useState(() => new Chess());
  const [, setFen] = useState(game.fen());
  const [moveHistory, setMoveHistory] = useState<Array<{ move: number; white: string; black: string }>>([]);

  const entryFeeFormatted = room ? formatEntryFee(room.entryFee) : "...";
  const prizePool = room ? (parseFloat(entryFeeFormatted) * room.maxPlayers * 0.95).toFixed(3) : "...";

  const handleMove = useCallback((from: Square, to: Square): boolean => {
    try {
      const move = game.move({
        from,
        to,
        promotion: 'q',
      });
      
      if (move) {
        setFen(game.fen());
        const history = game.history();
        const moves: Array<{ move: number; white: string; black: string }> = [];
        for (let i = 0; i < history.length; i += 2) {
          moves.push({
            move: Math.floor(i / 2) + 1,
            white: history[i] || "",
            black: history[i + 1] || "...",
          });
        }
        setMoveHistory(moves);
        return true;
      }
    } catch (e) {
      // Invalid move
    }
    return false;
  }, [game]);

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="max-w-6xl mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 bg-card border border-border rounded-lg p-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Chess – Room #{roomId}
            </h1>
            <p className="text-sm text-muted-foreground">
              Prize Pool: {prizePool} POL {room && `(~${formatUsd(parseFloat(prizePool))})`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-1 bg-primary/20 text-primary rounded">
              {game.turn() === 'w' ? 'White' : 'Black'} to move
            </span>
            <span className="text-muted-foreground">15s remaining</span>
          </div>
        </div>

        {/* Main Layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* LEFT COLUMN - Chess Board */}
          <div className="flex-1 flex justify-center">
            <div className="w-full max-w-[min(100%,calc(100vh-280px))]">
              <ChessBoardPremium
                game={game}
                onMove={handleMove}
                disabled={false}
              />
            </div>
          </div>

          {/* RIGHT COLUMN - Info Panels */}
          <div className="w-full lg:w-80 space-y-4">
            {/* Turn Info */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Game Status</h3>
              <p className="text-foreground font-medium">
                {game.isCheckmate() ? "Checkmate!" : 
                 game.isStalemate() ? "Stalemate!" :
                 game.isDraw() ? "Draw!" :
                 game.isCheck() ? "Check!" :
                 `${game.turn() === 'w' ? 'White' : 'Black'} to move`}
              </p>
            </div>

            {/* Move List */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Move List</h3>
              <div className="h-40 overflow-y-auto space-y-1 text-sm">
                {moveHistory.length === 0 ? (
                  <p className="text-muted-foreground">No moves yet</p>
                ) : (
                  moveHistory.map((m) => (
                    <div key={m.move} className="flex gap-2 text-foreground">
                      <span className="text-muted-foreground w-6">{m.move}.</span>
                      <span className="flex-1">{m.white}</span>
                      <span className="flex-1">{m.black}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 gap-2">
                <Handshake size={16} />
                Offer Draw
              </Button>
              <Button variant="outline" className="flex-1 gap-2 text-destructive hover:text-destructive">
                <Flag size={16} />
                Resign
              </Button>
            </div>
          </div>
        </div>

        {/* Back to Lobby */}
        <div className="flex justify-center mt-8">
          <Button variant="outline" size="lg" asChild>
            <Link to="/">
              <Home size={18} className="mr-2" />
              Return to Lobby
            </Link>
          </Button>
        </div>

        {/* Game Info Box */}
        <div className="mt-8 bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">How It Works</h3>
          <ul className="space-y-2 text-muted-foreground text-sm">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              Win by checkmate, opponent timeout, or resign.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              Games can be drawn by stalemate or mutual draw agreement.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              Entry fees are held in a smart contract until the result is confirmed.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              Winner receives the prize pool minus a 5% platform fee.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ChessGame;
