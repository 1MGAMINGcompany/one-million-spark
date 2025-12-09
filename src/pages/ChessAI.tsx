import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Chess, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, RotateCcw, Bot } from "lucide-react";

const ChessAI = () => {
  const [game, setGame] = useState(new Chess());
  const [gameStatus, setGameStatus] = useState<string>("Your turn");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const checkGameOver = useCallback((currentGame: Chess) => {
    if (currentGame.isCheckmate()) {
      const winner = currentGame.turn() === "w" ? "You lose!" : "You win!";
      setGameStatus(winner);
      setGameOver(true);
      return true;
    }
    if (currentGame.isStalemate()) {
      setGameStatus("Draw - Stalemate");
      setGameOver(true);
      return true;
    }
    if (currentGame.isDraw()) {
      setGameStatus("Draw");
      setGameOver(true);
      return true;
    }
    return false;
  }, []);

  const makeAIMove = useCallback((currentGame: Chess) => {
    const moves = currentGame.moves();
    if (moves.length === 0) return;

    setIsThinking(true);
    setGameStatus("AI is thinking...");

    setTimeout(() => {
      const randomMove = moves[Math.floor(Math.random() * moves.length)];
      currentGame.move(randomMove);
      
      setGame(new Chess(currentGame.fen()));
      setMoveHistory(currentGame.history());
      setIsThinking(false);

      if (!checkGameOver(currentGame)) {
        setGameStatus("Your turn");
      }
    }, 500);
  }, [checkGameOver]);

  const onDrop = (sourceSquare: Square, targetSquare: Square): boolean => {
    if (gameOver || isThinking) return false;

    const gameCopy = new Chess(game.fen());
    
    try {
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (move === null) return false;

      setGame(new Chess(gameCopy.fen()));
      setMoveHistory(gameCopy.history());

      if (!checkGameOver(gameCopy)) {
        makeAIMove(gameCopy);
      }

      return true;
    } catch {
      return false;
    }
  };

  const restartGame = () => {
    setGame(new Chess());
    setMoveHistory([]);
    setGameStatus("Your turn");
    setGameOver(false);
    setIsThinking(false);
  };

  const formattedMoves = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    formattedMoves.push({
      number: Math.floor(i / 2) + 1,
      white: moveHistory[i],
      black: moveHistory[i + 1] || "",
    });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <Button asChild variant="ghost" size="sm" className="mb-3">
            <Link to="/play-ai">
              <ArrowLeft size={18} />
              Back to AI Lobby
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <Bot size={32} className="text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Chess vs AI (Free Practice)
              </h1>
              <p className="text-sm text-muted-foreground">
                No wallet needed · No money · Just practice
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chess Board Column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Board */}
            <div className="w-full max-w-[600px] mx-auto">
              <Chessboard
                position={game.fen()}
                onPieceDrop={onDrop}
                arePiecesDraggable={!gameOver && !isThinking}
              />
            </div>

            {/* Status */}
            <div className={`text-center p-4 rounded-lg border ${
              gameOver 
                ? gameStatus.includes("win") 
                  ? "bg-green-500/10 border-green-500/30 text-green-600" 
                  : gameStatus.includes("lose")
                  ? "bg-red-500/10 border-red-500/30 text-red-600"
                  : "bg-yellow-500/10 border-yellow-500/30 text-yellow-600"
                : isThinking
                ? "bg-muted border-border text-muted-foreground"
                : "bg-primary/10 border-primary/30 text-primary"
            }`}>
              <p className="font-medium text-lg">{gameStatus}</p>
              {game.isCheck() && !gameOver && (
                <p className="text-sm mt-1">Check!</p>
              )}
            </div>
          </div>

          {/* Side Panel */}
          <div className="space-y-4">
            {/* Game Info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Game Info</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <p>You: <span className="text-foreground font-medium">White</span></p>
                <p>AI: <span className="text-foreground font-medium">Black (Random)</span></p>
                <p>Moves: <span className="text-foreground font-medium">{moveHistory.length}</span></p>
              </CardContent>
            </Card>

            {/* Move History */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Move History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-48 overflow-y-auto">
                  {formattedMoves.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No moves yet</p>
                  ) : (
                    <div className="space-y-1 text-sm font-mono">
                      {formattedMoves.map((move) => (
                        <div key={move.number} className="flex gap-2">
                          <span className="w-6 text-muted-foreground">{move.number}.</span>
                          <span className="w-12 text-foreground">{move.white}</span>
                          <span className="w-12 text-foreground">{move.black}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Button onClick={restartGame} className="w-full" variant="outline">
              <RotateCcw size={18} />
              Restart Game
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessAI;
