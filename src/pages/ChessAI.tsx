import { useState, useCallback, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Chess, Square, Move, PieceSymbol } from "chess.js";
import { ChessBoardPremium } from "@/components/ChessBoardPremium";
import { useCaptureAnimations } from "@/components/CaptureAnimationLayer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Gem, Star } from "lucide-react";
import { useSound } from "@/contexts/SoundContext";

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

// Animation Toggle Component
const AnimationToggle = ({ 
  enabled, 
  onToggle 
}: { 
  enabled: boolean; 
  onToggle: () => void;
}) => {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-3 group"
    >
      <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
        Board Animations
      </span>
      <div 
        className={`relative w-14 h-7 rounded-full transition-all duration-300 ${
          enabled 
            ? "bg-gradient-to-r from-primary/80 to-primary shadow-[0_0_12px_-2px_hsl(45_93%_54%_/_0.6)]" 
            : "bg-muted/30 border border-muted-foreground/20"
        }`}
      >
        {/* Track labels */}
        <span className={`absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold transition-opacity ${
          enabled ? "opacity-0" : "opacity-50"
        }`}>
          OFF
        </span>
        <span className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold transition-opacity ${
          enabled ? "opacity-0" : "opacity-0"
        }`}>
          ON
        </span>
        
        {/* Thumb with pyramid */}
        <div 
          className={`absolute top-0.5 w-6 h-6 rounded-full transition-all duration-300 flex items-center justify-center ${
            enabled 
              ? "left-[calc(100%-26px)] bg-gradient-to-br from-gold-light to-primary shadow-[0_0_8px_hsl(45_93%_54%_/_0.5)]" 
              : "left-0.5 bg-muted-foreground/30"
          }`}
        >
          {/* Pyramid icon */}
          <div 
            className={`w-3 h-3 transition-opacity ${enabled ? "opacity-100" : "opacity-30"}`}
            style={{
              background: enabled 
                ? "linear-gradient(to top, hsl(35 80% 30%) 0%, hsl(45 93% 70%) 100%)" 
                : "linear-gradient(to top, hsl(0 0% 30%) 0%, hsl(0 0% 50%) 100%)",
              clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
            }}
          />
        </div>
      </div>
    </button>
  );
};

const ChessAI = () => {
  const [searchParams] = useSearchParams();
  const { play } = useSound();
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
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  
  // Use ref to track game state for AI moves (to capture pieces before they're taken)
  const pendingCaptureRef = useRef<{
    attackerPiece: PieceSymbol;
    capturedPiece: PieceSymbol;
    targetSquare: Square;
  } | null>(null);

  // Capture animations hook
  const { animations, triggerAnimation, handleAnimationComplete } = useCaptureAnimations(animationsEnabled);

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
      const isPlayerWin = currentGame.turn() !== "w";
      const winner = isPlayerWin ? "You win!" : "You lose!";
      setGameStatus(winner);
      setGameOver(true);
      play(isPlayerWin ? 'chess_win' : 'chess_lose');
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
    // Check for check (not checkmate)
    if (currentGame.isCheck()) {
      play('chess_check');
    }
    return false;
  }, [play]);

  const getAIMove = useCallback((currentGame: Chess): Move | null => {
    const moves = currentGame.moves({ verbose: true }) as Move[];
    if (moves.length === 0) return null;

    switch (difficulty) {
      case "easy": {
        const randomIndex = Math.floor(Math.random() * moves.length);
        return moves[randomIndex];
      }

      case "medium": {
        const captures = moves.filter(m => m.captured);
        if (captures.length > 0) {
          const sorted = captures.sort((a, b) => {
            const aValue = PIECE_VALUES[a.captured || ""] || 0;
            const bValue = PIECE_VALUES[b.captured || ""] || 0;
            return bValue - aValue;
          });
          return sorted[0];
        }
        const randomIndex = Math.floor(Math.random() * moves.length);
        return moves[randomIndex];
      }

      case "hard": {
        let bestMove: Move | null = null;
        let bestValue = Infinity;

        for (const move of moves) {
          currentGame.move(move.san);
          const value = minimax(currentGame, 2, -Infinity, Infinity, true);
          currentGame.undo();

          if (value < bestValue) {
            bestValue = value;
            bestMove = move;
          }
        }

        return bestMove || moves[0];
      }

      default:
        return moves[0];
    }
  }, [difficulty]);

  const makeAIMove = useCallback((currentGame: Chess, currentAnimationsEnabled: boolean) => {
    const moveObj = getAIMove(currentGame);
    if (!moveObj) return;

    setIsThinking(true);
    setGameStatus("AI is thinking...");

    const thinkingTime = difficulty === "hard" ? 800 : difficulty === "medium" ? 500 : 300;

    // Store capture info BEFORE the move happens
    const targetPiece = currentGame.get(moveObj.to as Square);
    const wasCapture = !!targetPiece;
    const attackerPieceType = moveObj.piece as PieceSymbol;
    const capturedPieceType = targetPiece?.type;
    const targetSquare = moveObj.to as Square;
    
    setTimeout(() => {
      // Execute the move
      currentGame.move(moveObj.san);
      
      // Play sound based on move type
      if (wasCapture) {
        play('chess_capture');
      } else {
        play('chess_move');
      }
      
      // Check for promotion
      if (moveObj.promotion) {
        play('chess_promotion');
      }
      
      // Trigger capture animation if there was a capture
      if (wasCapture && currentAnimationsEnabled && capturedPieceType) {
        triggerAnimation(attackerPieceType, capturedPieceType, targetSquare);
      }
      
      setGame(new Chess(currentGame.fen()));
      setMoveHistory(currentGame.history());
      setIsThinking(false);

      if (!checkGameOver(currentGame)) {
        setGameStatus("Your turn");
      }
    }, thinkingTime);
  }, [getAIMove, checkGameOver, difficulty, triggerAnimation, play]);

  const handleMove = useCallback((from: Square, to: Square): boolean => {
    if (gameOver || isThinking) return false;

    const gameCopy = new Chess(game.fen());
    
    // Get piece info BEFORE the move
    const attackingPiece = gameCopy.get(from);
    const targetPiece = gameCopy.get(to);
    
    try {
      const move = gameCopy.move({
        from,
        to,
        promotion: "q",
      });

      if (move === null) return false;

      // Play sound based on move type
      if (targetPiece) {
        play('chess_capture');
      } else {
        play('chess_move');
      }
      
      // Check for promotion
      if (move.promotion) {
        play('chess_promotion');
      }

      // Trigger capture animation for player's move
      if (targetPiece && attackingPiece && animationsEnabled) {
        triggerAnimation(attackingPiece.type, targetPiece.type, to);
      }

      setGame(new Chess(gameCopy.fen()));
      setMoveHistory(gameCopy.history());

      if (!checkGameOver(gameCopy)) {
        makeAIMove(gameCopy, animationsEnabled);
      }

      return true;
    } catch {
      return false;
    }
  }, [game, gameOver, isThinking, checkGameOver, makeAIMove, animationsEnabled, triggerAnimation, play]);

  const restartGame = useCallback(() => {
    setGame(new Chess());
    setMoveHistory([]);
    setGameStatus("Your turn");
    setGameOver(false);
    setIsThinking(false);
  }, []);

  const formattedMoves = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    formattedMoves.push({
      number: Math.floor(i / 2) + 1,
      white: moveHistory[i],
      black: moveHistory[i + 1] || "",
    });
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background with pyramid pattern */}
      <div className="absolute inset-0 bg-gradient-to-b from-midnight-light via-background to-background" />
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `repeating-linear-gradient(
            60deg,
            transparent,
            transparent 100px,
            hsl(45 93% 54% / 0.1) 100px,
            hsl(45 93% 54% / 0.1) 102px
          ),
          repeating-linear-gradient(
            -60deg,
            transparent,
            transparent 100px,
            hsl(45 93% 54% / 0.1) 100px,
            hsl(45 93% 54% / 0.1) 102px
          )`
        }}
      />
      {/* Subtle pyramid silhouette */}
      <div className="absolute inset-0 flex items-end justify-center pointer-events-none overflow-hidden">
        <div 
          className="w-[600px] h-[400px] opacity-[0.03] translate-y-1/2"
          style={{
            background: "linear-gradient(to top, hsl(45 93% 54%) 0%, transparent 80%)",
            clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="border-b border-primary/20 px-4 py-4">
          <div className="max-w-6xl mx-auto">
            <Button asChild variant="ghost" size="sm" className="mb-4 text-muted-foreground hover:text-primary group">
              <Link to="/play-ai" className="flex items-center gap-2">
                <ArrowLeft size={18} className="group-hover:text-primary transition-colors" />
                Back to Temple
              </Link>
            </Button>
            
            {/* Title with decorative elements */}
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="h-px w-8 bg-gradient-to-r from-transparent to-primary/50 hidden sm:block" />
              <Gem className="w-4 h-4 text-primary" />
              <h1 
                className="text-xl md:text-2xl font-display font-bold tracking-wide text-center"
                style={{
                  background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Chess Training – Temple of Strategy
              </h1>
              <Gem className="w-4 h-4 text-primary" />
              <div className="h-px w-8 bg-gradient-to-l from-transparent to-primary/50 hidden sm:block" />
            </div>
            
            <p className="text-center text-sm text-muted-foreground/60">
              <Star className="w-3 h-3 inline-block mr-1 text-primary/40" />
              Free mode – no wallet required
              <Star className="w-3 h-3 inline-block ml-1 text-primary/40" />
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chess Board Column */}
            <div className="lg:col-span-2 space-y-4">
              {/* Board Container with gold frame */}
              <div className="relative">
                {/* Outer glow */}
                <div className="absolute -inset-2 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-xl opacity-50" />
                
                {/* Gold frame */}
                <div className="relative p-1 rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-primary/40 shadow-[0_0_40px_-10px_hsl(45_93%_54%_/_0.4)]">
                  <div className="bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-lg overflow-hidden p-4">
                    <ChessBoardPremium
                      game={game}
                      onMove={handleMove}
                      disabled={gameOver || isThinking}
                      captureAnimations={animations}
                      onAnimationComplete={handleAnimationComplete}
                      animationsEnabled={animationsEnabled}
                    />
                  </div>
                </div>
              </div>

              {/* Animation Toggle - below board */}
              <div className="flex justify-center">
                <AnimationToggle 
                  enabled={animationsEnabled} 
                  onToggle={() => setAnimationsEnabled(prev => !prev)} 
                />
              </div>

              {/* Premium Status Bar with Egyptian iconography */}
              <div 
                className={`relative overflow-hidden rounded-lg border transition-all duration-300 ${
                  gameOver 
                    ? gameStatus.includes("win") 
                      ? "bg-green-500/10 border-green-500/30" 
                      : gameStatus.includes("lose")
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-primary/10 border-primary/30"
                    : "bg-gradient-to-r from-primary/10 via-primary/20 to-primary/10 border-primary/40"
                }`}
              >
                {/* Gold decorative pattern */}
                <div className="absolute inset-0 opacity-10">
                  <div 
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6"
                    style={{
                      background: "linear-gradient(to top, hsl(45 93% 54%) 0%, hsl(45 90% 65%) 100%)",
                      clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                    }}
                  />
                  <div 
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6"
                    style={{
                      background: "linear-gradient(to top, hsl(45 93% 54%) 0%, hsl(45 90% 65%) 100%)",
                      clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                    }}
                  />
                </div>

                {/* Ankh symbols */}
                <div className="absolute left-8 top-1/2 -translate-y-1/2 text-primary/30 text-xl">☥</div>
                <div className="absolute right-8 top-1/2 -translate-y-1/2 text-primary/30 text-xl">☥</div>

                {/* Decorative corner accents */}
                <div className="absolute top-1 left-1 w-4 h-4 border-l-2 border-t-2 border-primary/50 rounded-tl" />
                <div className="absolute top-1 right-1 w-4 h-4 border-r-2 border-t-2 border-primary/50 rounded-tr" />
                <div className="absolute bottom-1 left-1 w-4 h-4 border-l-2 border-b-2 border-primary/50 rounded-bl" />
                <div className="absolute bottom-1 right-1 w-4 h-4 border-r-2 border-b-2 border-primary/50 rounded-br" />
                
                <div className="px-8 py-5 text-center relative z-10">
                  <p 
                    className={`font-display font-bold text-xl ${
                      gameOver 
                        ? gameStatus.includes("win") 
                          ? "text-green-400" 
                          : gameStatus.includes("lose")
                          ? "text-red-400"
                          : "text-primary"
                        : isThinking
                        ? "text-muted-foreground"
                        : "text-primary"
                    }`}
                    style={!gameOver && !isThinking ? {
                      background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                      textShadow: "0 0 30px hsl(45 93% 54% / 0.3)"
                    } : undefined}
                  >
                    {gameStatus}
                  </p>
                  {game.isCheck() && !gameOver && (
                    <p className="text-sm text-red-400/80 mt-1 font-medium animate-pulse">⚠ Check!</p>
                  )}
                </div>
              </div>
            </div>

            {/* Side Panel */}
            <div className="space-y-4">
              {/* Difficulty Display */}
              <div className="relative p-4 rounded-xl bg-gradient-to-br from-midnight-light via-card to-background border border-primary/20">
                <div className="absolute top-2 right-2">
                  <div 
                    className="w-3 h-3 opacity-40"
                    style={{
                      background: "linear-gradient(to top, hsl(45 93% 54%) 0%, hsl(45 90% 65%) 100%)",
                      clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                    }}
                  />
                </div>
                
                <p className="text-xs text-primary/60 uppercase tracking-wider mb-3 font-medium">Difficulty</p>
                <div className="flex gap-1 p-1 bg-background/50 rounded-lg border border-primary/20">
                  {(["easy", "medium", "hard"] as const).map((level) => (
                    <div
                      key={level}
                      className={`flex-1 py-2 px-2 text-xs font-bold rounded-md text-center transition-all ${
                        difficulty === level
                          ? "bg-gradient-to-r from-primary to-gold text-primary-foreground shadow-[0_0_12px_-2px_hsl(45_93%_54%_/_0.5)]"
                          : "text-muted-foreground/50"
                      }`}
                    >
                      {level.toUpperCase()}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3 text-center">{difficultyDescription}</p>
              </div>

              {/* Game Info */}
              <div className="relative p-4 rounded-xl bg-gradient-to-br from-midnight-light via-card to-background border border-primary/20">
                <div className="absolute top-2 right-2">
                  <div 
                    className="w-3 h-3 opacity-40"
                    style={{
                      background: "linear-gradient(to top, hsl(45 93% 54%) 0%, hsl(45 90% 65%) 100%)",
                      clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                    }}
                  />
                </div>
                
                <p className="text-xs text-primary/60 uppercase tracking-wider mb-3 font-medium">Game Info</p>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">You</span>
                    <span className="text-foreground font-medium">White ♔</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">AI</span>
                    <span className="text-foreground font-medium">Black ♚</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Moves</span>
                    <span className="text-primary font-medium">{moveHistory.length}</span>
                  </div>
                </div>
              </div>

              {/* Move History */}
              <div className="relative p-4 rounded-xl bg-gradient-to-br from-midnight-light via-card to-background border border-primary/20">
                <div className="absolute top-2 right-2">
                  <div 
                    className="w-3 h-3 opacity-40"
                    style={{
                      background: "linear-gradient(to top, hsl(45 93% 54%) 0%, hsl(45 90% 65%) 100%)",
                      clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                    }}
                  />
                </div>
                
                <p className="text-xs text-primary/60 uppercase tracking-wider mb-3 font-medium">Move History</p>
                <div className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
                  {formattedMoves.length === 0 ? (
                    <p className="text-sm text-muted-foreground/50 text-center py-4">No moves yet</p>
                  ) : (
                    <div className="space-y-1 text-sm font-mono">
                      {formattedMoves.map((move) => (
                        <div key={move.number} className="flex gap-2 py-1 px-2 rounded hover:bg-primary/5 transition-colors">
                          <span className="w-6 text-primary/50">{move.number}.</span>
                          <span className="w-14 text-foreground">{move.white}</span>
                          <span className="w-14 text-foreground/70">{move.black}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <Button 
                onClick={restartGame} 
                className="w-full group border border-primary/30 hover:border-primary/60 transition-all" 
                variant="outline"
              >
                <RotateCcw size={18} className="text-primary group-hover:drop-shadow-[0_0_6px_hsl(45_93%_54%_/_0.6)] transition-all" />
                Restart Game
              </Button>

              <Button asChild variant="ghost" className="w-full text-muted-foreground hover:text-primary">
                <Link to="/play-ai">
                  Change Difficulty
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessAI;
