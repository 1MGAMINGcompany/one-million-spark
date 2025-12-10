import { useState, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Chess, Square, Move } from "chess.js";
import { ChessBoard } from "@/components/ChessBoard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, RotateCcw, Bot, Crown } from "lucide-react";

type Difficulty = "easy" | "medium" | "hard";

// Material values for evaluation
const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Evaluate board position (positive = good for white, negative = good for black)
const evaluateBoard = (game: Chess): number => {
  const fen = game.fen();
  const board = fen.split(" ")[0];
  let score = 0;

  for (const char of board) {
    if (char === "/" || !isNaN(Number(char))) continue;
    const piece = char.toLowerCase();
    const value = PIECE_VALUES[piece] || 0;
    score += char === char.toUpperCase() ? value : -value;
  }

  return score;
};

// Minimax with alpha-beta pruning
const minimax = (
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean
): number => {
  if (depth === 0 || game.isGameOver()) {
    return evaluateBoard(game);
  }

  const moves = game.moves();

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      game.move(move);
      const evalScore = minimax(game, depth - 1, alpha, beta, false);
      game.undo();
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      game.move(move);
      const evalScore = minimax(game, depth - 1, alpha, beta, true);
      game.undo();
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
};

const ChessAI = () => {
  const [searchParams] = useSearchParams();
  const rawDifficulty = searchParams.get("difficulty");
  const difficulty: Difficulty = 
    rawDifficulty === "easy" || rawDifficulty === "medium" || rawDifficulty === "hard"
      ? rawDifficulty
      : "easy";

  const [game, setGame] = useState(new Chess());
  const [gameStatus, setGameStatus] = useState<string>("Your turn");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const difficultyLabel = useMemo(() => {
    switch (difficulty) {
      case "easy": return "EASY";
      case "medium": return "MEDIUM";
      case "hard": return "HARD";
    }
  }, [difficulty]);

  const difficultyDescription = useMemo(() => {
    switch (difficulty) {
      case "easy": return "Random moves";
      case "medium": return "Prefers captures";
      case "hard": return "Strategic play";
    }
  }, [difficulty]);

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

  const getAIMove = useCallback((currentGame: Chess): string | null => {
    const moves = currentGame.moves({ verbose: true }) as Move[];
    if (moves.length === 0) return null;

    switch (difficulty) {
      case "easy": {
        // Random move
        const randomIndex = Math.floor(Math.random() * moves.length);
        return moves[randomIndex].san;
      }

      case "medium": {
        // Prefer captures, otherwise random
        const captures = moves.filter(m => m.captured);
        if (captures.length > 0) {
          // Pick the highest value capture
          const sorted = captures.sort((a, b) => {
            const aValue = PIECE_VALUES[a.captured || ""] || 0;
            const bValue = PIECE_VALUES[b.captured || ""] || 0;
            return bValue - aValue;
          });
          return sorted[0].san;
        }
        const randomIndex = Math.floor(Math.random() * moves.length);
        return moves[randomIndex].san;
      }

      case "hard": {
        // Minimax at depth 3
        let bestMove: string | null = null;
        let bestValue = Infinity; // AI is black, minimizing

        for (const move of moves) {
          currentGame.move(move.san);
          const value = minimax(currentGame, 2, -Infinity, Infinity, true);
          currentGame.undo();

          if (value < bestValue) {
            bestValue = value;
            bestMove = move.san;
          }
        }

        return bestMove || moves[0].san;
      }

      default:
        return moves[0].san;
    }
  }, [difficulty]);

  const makeAIMove = useCallback((currentGame: Chess) => {
    const move = getAIMove(currentGame);
    if (!move) return;

    setIsThinking(true);
    setGameStatus("AI is thinking...");

    const thinkingTime = difficulty === "hard" ? 800 : difficulty === "medium" ? 500 : 300;

    setTimeout(() => {
      currentGame.move(move);
      
      setGame(new Chess(currentGame.fen()));
      setMoveHistory(currentGame.history());
      setIsThinking(false);

      if (!checkGameOver(currentGame)) {
        setGameStatus("Your turn");
      }
    }, thinkingTime);
  }, [getAIMove, checkGameOver, difficulty]);

  const handleMove = (from: Square, to: Square): boolean => {
    if (gameOver || isThinking) return false;

    const gameCopy = new Chess(game.fen());
    
    try {
      const move = gameCopy.move({
        from,
        to,
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
    <div className="min-h-screen bg-background pyramid-bg">
      {/* Header */}
      <div className="bg-card/80 backdrop-blur-sm border-b border-gold/20 px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <Button asChild variant="ghost" size="sm" className="mb-3 text-muted-foreground hover:text-gold">
            <Link to="/play-ai">
              <ArrowLeft size={18} />
              Back to AI Lobby
            </Link>
          </Button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Bot size={32} className="text-gold" />
              <div>
                <h1 className="text-2xl font-display font-bold text-foreground">
                  Chess vs AI <span className="text-gold">(Free Practice)</span>
                </h1>
                <p className="text-sm text-muted-foreground">
                  No wallet needed · No money · Just practice
                </p>
              </div>
            </div>
            {/* Difficulty Badge */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/10 border border-gold/30">
              <Crown size={18} className="text-gold" />
              <div className="text-sm">
                <span className="text-muted-foreground">Difficulty: </span>
                <span className="font-bold text-gold">{difficultyLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chess Board Column */}
          <div className="lg:col-span-2 space-y-4">
            <ChessBoard
              game={game}
              onMove={handleMove}
              disabled={gameOver || isThinking}
            />

            {/* Status */}
            <div className={`text-center p-4 rounded-lg border ${
              gameOver 
                ? gameStatus.includes("win") 
                  ? "bg-green-500/10 border-green-500/30 text-green-400" 
                  : gameStatus.includes("lose")
                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                  : "bg-gold/10 border-gold/30 text-gold"
                : isThinking
                ? "bg-muted/50 border-border text-muted-foreground"
                : "bg-gold/10 border-gold/30 text-gold"
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
            <Card className="border-gold/20 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-display">Game Info</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <div className="flex justify-between">
                  <span>You:</span>
                  <span className="text-foreground font-medium">White</span>
                </div>
                <div className="flex justify-between">
                  <span>AI:</span>
                  <span className="text-foreground font-medium">Black</span>
                </div>
                <div className="flex justify-between">
                  <span>Difficulty:</span>
                  <span className="text-gold font-medium">{difficultyLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span>AI Style:</span>
                  <span className="text-muted-foreground">{difficultyDescription}</span>
                </div>
                <div className="flex justify-between">
                  <span>Moves:</span>
                  <span className="text-foreground font-medium">{moveHistory.length}</span>
                </div>
              </CardContent>
            </Card>

            {/* Move History */}
            <Card className="border-gold/20 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-display">Move History</CardTitle>
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

            <Button asChild variant="ghost" className="w-full text-muted-foreground">
              <Link to="/play-ai">
                Change Difficulty
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessAI;
