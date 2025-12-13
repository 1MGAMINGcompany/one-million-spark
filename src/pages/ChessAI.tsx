import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Chess, Square, Move, PieceSymbol } from "chess.js";
import { ChessBoardPremium } from "@/components/ChessBoardPremium";
import { useCaptureAnimations } from "@/components/CaptureAnimationLayer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Gem, Star } from "lucide-react";
import { useSound } from "@/contexts/SoundContext";
import { useTranslation } from "react-i18next";
import { createChessAI, type ChessAI as ChessAIType, type Difficulty } from "@/lib/chessEngine/stockfishEngine";

// Helper to convert UCI move (e.g., "e2e4") to from/to squares
const parseUCIMove = (uciMove: string): { from: Square; to: Square; promotion?: string } | null => {
  if (uciMove.length < 4) return null;
  const from = uciMove.slice(0, 2) as Square;
  const to = uciMove.slice(2, 4) as Square;
  const promotion = uciMove.length > 4 ? uciMove[4] : undefined;
  return { from, to, promotion };
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
        {useTranslation().t('gameAI.boardAnimations')}
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
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { play } = useSound();
  const rawDifficulty = searchParams.get("difficulty");
  const difficulty: Difficulty = 
    rawDifficulty === "easy" || rawDifficulty === "medium" || rawDifficulty === "hard"
      ? rawDifficulty
      : "easy";

  const [game, setGame] = useState(new Chess());
  const [gameStatus, setGameStatus] = useState<string>("");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  
  // Stockfish AI instance
  const aiRef = useRef<ChessAIType | null>(null);
  
  // Initialize Stockfish AI on mount
  useEffect(() => {
    aiRef.current = createChessAI(difficulty);
    
    return () => {
      if (aiRef.current) {
        aiRef.current.terminate();
        aiRef.current = null;
      }
    };
  }, []); // Only create once on mount
  
  // Update difficulty when it changes
  useEffect(() => {
    if (aiRef.current) {
      aiRef.current.setDifficulty(difficulty);
    }
  }, [difficulty]);
  
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
      case "easy": return t('gameAI.stockfishBeginner');
      case "medium": return t('gameAI.stockfishIntermediate');
      case "hard": return t('gameAI.stockfishAdvanced');
    }
  }, [difficulty, t]);

  const checkGameOver = useCallback((currentGame: Chess) => {
    if (currentGame.isCheckmate()) {
      const isPlayerWin = currentGame.turn() !== "w";
      const winner = isPlayerWin ? t('gameAI.youWin') : t('gameAI.youLose');
      setGameStatus(winner);
      setGameOver(true);
      play(isPlayerWin ? 'chess_win' : 'chess_lose');
      return true;
    }
    if (currentGame.isStalemate()) {
      setGameStatus(t('gameAI.drawStalemate'));
      setGameOver(true);
      return true;
    }
    if (currentGame.isDraw()) {
      setGameStatus(t('gameAI.draw'));
      setGameOver(true);
      return true;
    }
    // Check for check (not checkmate)
    if (currentGame.isCheck()) {
      play('chess_check');
    }
    return false;
  }, [play]);

  // Fallback to random move if Stockfish fails
  const getRandomMove = useCallback((currentGame: Chess): Move | null => {
    const moves = currentGame.moves({ verbose: true }) as Move[];
    if (moves.length === 0) return null;
    return moves[Math.floor(Math.random() * moves.length)];
  }, []);

  const makeAIMove = useCallback(async (currentGame: Chess, currentAnimationsEnabled: boolean) => {
    if (currentGame.isGameOver()) return;
    
    setIsThinking(true);
    setGameStatus("AI is thinking...");

    try {
      let uciMove: string;
      
      if (aiRef.current) {
        // Use Stockfish to get the best move
        uciMove = await aiRef.current.getBestMove(currentGame.fen());
      } else {
        // Fallback: get a random move
        console.warn('Stockfish not ready, using random move');
        const randomMove = getRandomMove(currentGame);
        if (!randomMove) {
          setIsThinking(false);
          return;
        }
        uciMove = randomMove.from + randomMove.to + (randomMove.promotion || '');
      }
      
      const parsed = parseUCIMove(uciMove);
      if (!parsed) {
        console.warn('Failed to parse UCI move:', uciMove);
        // Fallback to random
        const randomMove = getRandomMove(currentGame);
        if (randomMove) {
          parsed && Object.assign(parsed, { from: randomMove.from, to: randomMove.to, promotion: randomMove.promotion });
        }
        setIsThinking(false);
        if (!checkGameOver(currentGame)) {
          setGameStatus("Your turn");
        }
        return;
      }
      
      // Get piece info BEFORE the move
      const attackingPiece = currentGame.get(parsed.from);
      const targetPiece = currentGame.get(parsed.to);
      const wasCapture = !!targetPiece;
      const attackerPieceType = attackingPiece?.type;
      const capturedPieceType = targetPiece?.type;
      const targetSquare = parsed.to;
      
      // Try to make the move
      const move = currentGame.move({
        from: parsed.from,
        to: parsed.to,
        promotion: (parsed.promotion || 'q') as 'q' | 'r' | 'b' | 'n',
      });
      
      if (!move) {
        console.warn('Invalid move from Stockfish:', uciMove);
        // Fallback to random move
        const randomMove = getRandomMove(currentGame);
        if (randomMove) {
          currentGame.move(randomMove.san);
          setGame(new Chess(currentGame.fen()));
          setMoveHistory(currentGame.history());
          play('chess_move');
        }
        setIsThinking(false);
        if (!checkGameOver(currentGame)) {
          setGameStatus("Your turn");
        }
        return;
      }
      
      // Play sound based on move type
      if (wasCapture) {
        play('chess_capture');
      } else {
        play('chess_move');
      }
      
      // Check for promotion
      if (move.promotion) {
        play('chess_promotion');
      }
      
      // Trigger capture animation if there was a capture
      if (wasCapture && currentAnimationsEnabled && capturedPieceType && attackerPieceType) {
        triggerAnimation(attackerPieceType, capturedPieceType, targetSquare);
      }
      
      setGame(new Chess(currentGame.fen()));
      setMoveHistory(currentGame.history());
      setIsThinking(false);

      if (!checkGameOver(currentGame)) {
        setGameStatus("Your turn");
      }
    } catch (error) {
      console.error('Stockfish error:', error);
      // Fallback to random move
      const randomMove = getRandomMove(currentGame);
      if (randomMove) {
        currentGame.move(randomMove.san);
        setGame(new Chess(currentGame.fen()));
        setMoveHistory(currentGame.history());
        play('chess_move');
      }
      setIsThinking(false);
      if (!checkGameOver(currentGame)) {
        setGameStatus("Your turn");
      }
    }
  }, [checkGameOver, triggerAnimation, play, getRandomMove]);

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
                {t('gameAI.backToTemple')}
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
                {t('gameAI.chessTitle')}
              </h1>
              <Gem className="w-4 h-4 text-primary" />
              <div className="h-px w-8 bg-gradient-to-l from-transparent to-primary/50 hidden sm:block" />
            </div>
            
            <p className="text-center text-sm text-muted-foreground/60">
              <Star className="w-3 h-3 inline-block mr-1 text-primary/40" />
              {t('gameAI.freeMode')}
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
                        ? gameStatus.includes(t('gameAI.youWin')) 
                          ? "text-green-400" 
                          : gameStatus.includes(t('gameAI.youLose'))
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
                    {gameStatus || (isThinking ? t('gameAI.aiThinking') : t('gameAI.yourTurn'))}
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
                
                <p className="text-xs text-primary/60 uppercase tracking-wider mb-3 font-medium">{t('gameAI.difficulty')}</p>
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
                
                <p className="text-xs text-primary/60 uppercase tracking-wider mb-3 font-medium">{t('common.gameInfo') || 'Game Info'}</p>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('common.you') || 'You'}</span>
                    <span className="text-foreground font-medium">{t('gameAI.white')} ♔</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">AI</span>
                    <span className="text-foreground font-medium">{t('gameAI.black')} ♚</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('common.totalMoves') || 'Total Moves'}</span>
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
                
                <p className="text-xs text-primary/60 uppercase tracking-wider mb-3 font-medium">{t('gameAI.moveHistory')}</p>
                <div className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
                  {formattedMoves.length === 0 ? (
                    <p className="text-sm text-muted-foreground/50 text-center py-4">{t('gameAI.noMoves')}</p>
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
                {t('gameAI.restart')}
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
