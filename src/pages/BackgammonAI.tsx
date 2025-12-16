import { useState, useCallback, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Gem, Star } from "lucide-react";
import { Dice3D, CheckerStack } from "@/components/BackgammonPieces";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSound } from "@/contexts/SoundContext";
import { useTranslation } from "react-i18next";
import {
  type Player,
  type GameState,
  type Move,
  getInitialBoard,
  canBearOff,
  getAllLegalMoves,
  getLegalMovesFromBar,
  getLegalMovesFromPoint,
  applyMove as applyMoveEngine,
  consumeDie,
  checkWinner,
} from "@/lib/backgammonEngine";
import {
  type Difficulty as EngineDifficulty,
  type BackgammonState,
  type BackgammonMove,
  chooseBackgammonMove,
  backgammonEngine,
} from "@/engine";

type Difficulty = "easy" | "medium" | "hard";

// Map UI difficulty to engine difficulty
const toEngineDifficulty = (d: Difficulty): EngineDifficulty => {
  switch (d) {
    case "easy": return "EASY";
    case "medium": return "MEDIUM";
    case "hard": return "HARD";
  }
};

// Convert legacy GameState to engine BackgammonState
const toEngineState = (
  state: GameState,
  dice: number[],
  currentPlayer: "player" | "ai"
): BackgammonState => ({
  board: [...state.points],
  bar: {
    'PLAYER_1': state.bar.player,
    'PLAYER_2': state.bar.ai,
  },
  borneOff: {
    'PLAYER_1': state.bearOff.player,
    'PLAYER_2': state.bearOff.ai,
  },
  dice,
  currentPlayer: currentPlayer === "player" ? 'PLAYER_1' : 'PLAYER_2',
});

// Convert engine move to legacy move
const toLegacyMove = (move: BackgammonMove): Move => ({
  from: move.from === 'BAR' ? -1 : move.from,
  to: move.to === 'OFF' ? 25 : move.to, // AI bears off to 25 in legacy
  dieValue: move.dieUsed,
});

const BackgammonAI = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { play } = useSound();
  const rawDifficulty = searchParams.get("difficulty");
  const difficulty: Difficulty =
    rawDifficulty === "easy" || rawDifficulty === "medium" || rawDifficulty === "hard"
      ? rawDifficulty
      : "easy";

  const [gameState, setGameState] = useState<GameState>({
    points: getInitialBoard(),
    bar: { player: 0, ai: 0 },
    bearOff: { player: 0, ai: 0 },
  });
  const [dice, setDice] = useState<number[]>([]);
  const [remainingMoves, setRemainingMoves] = useState<number[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player>("player");
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [gameStatus, setGameStatus] = useState("");
  const [gameOver, setGameOver] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [validMoves, setValidMoves] = useState<number[]>([]);
  // Animation state for AI moves
  const [animatingMove, setAnimatingMove] = useState<{ from: number | 'BAR'; to: number } | null>(null);

  const difficultyLabel = useMemo(() => {
    switch (difficulty) {
      case "easy": return "EASY";
      case "medium": return "MEDIUM";
      case "hard": return "HARD";
    }
  }, [difficulty]);

  const difficultyDescription = useMemo(() => {
    switch (difficulty) {
      case "easy": return t('gameAI.randomMoves');
      case "medium": return t('gameAI.movesTowardHome');
      case "hard": return t('gameAI.hitsAndStacks');
    }
  }, [difficulty, t]);

  // Apply a move with sound effects
  const applyMoveWithSound = useCallback((state: GameState, move: Move, player: Player): GameState => {
    const isBearOff = move.to === -2 || move.to === 25;
    const isHit = !isBearOff && (
      (player === "player" && state.points[move.to] === -1) ||
      (player === "ai" && state.points[move.to] === 1)
    );
    
    const newState = applyMoveEngine(state, move, player);
    
    if (isBearOff) {
      play('backgammon_bearoff');
    } else {
      play('backgammon_move');
    }
    
    return newState;
  }, [play]);

  // Roll dice
  const rollDice = useCallback(() => {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const newDice = [d1, d2];
    const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    
    // Play dice roll sound
    play('backgammon_dice');
    
    setDice(newDice);
    setRemainingMoves(moves);
    
    // Check if player has checkers on bar and show appropriate message
    if (gameState.bar.player > 0) {
      const barMoves = getLegalMovesFromBar(gameState, moves, "player");
      if (barMoves.length === 0) {
        setGameStatus(t('gameAI.allBlocked'));
        setTimeout(() => {
          setCurrentPlayer("ai");
          setDice([]);
          setRemainingMoves([]);
        }, 1500);
        return;
      }
      setGameStatus(t('gameAI.barReenter'));
    } else {
      setGameStatus(t('gameAI.selectChecker'));
    }
    
    const allMoves = getAllLegalMoves(gameState, moves, "player");
    if (allMoves.length === 0) {
      setGameStatus(t('gameAI.noLegalMoves'));
      setTimeout(() => {
        setCurrentPlayer("ai");
        setDice([]);
        setRemainingMoves([]);
      }, 1000);
    }
  }, [gameState, play, t]);

  // Handle point click - simplified bar logic to avoid closure issues
  const handlePointClick = useCallback((pointIndex: number) => {
    if (currentPlayer !== "player" || remainingMoves.length === 0 || gameOver || isThinking) {
      return;
    }
    
    const hasBarCheckers = gameState.bar.player > 0;
    
    // CASE 1: Player has bar checkers - they MUST move from bar first
    if (hasBarCheckers) {
      // Get all legal bar entry moves upfront
      const barMoves = getLegalMovesFromBar(gameState, remainingMoves, "player");
      
      // Clicking the bar itself - select it and show targets
      if (pointIndex === -1) {
        if (selectedPoint === -1) {
          // Already selected, deselect
          setSelectedPoint(null);
          setValidMoves([]);
          setGameStatus("Click the bar to re-enter");
        } else {
          // Select the bar
          if (barMoves.length > 0) {
            setSelectedPoint(-1);
            setValidMoves(barMoves.map(m => m.to));
            setGameStatus("Select where to re-enter");
          } else {
            setGameStatus("All entry points are blocked!");
          }
        }
        return;
      }
      
      // Clicking a board point - check if it's a valid bar entry destination
      const move = barMoves.find(m => m.to === pointIndex);
      
      if (move) {
        // Valid bar entry - apply the move
        const newState = applyMoveWithSound(gameState, move, "player");
        setGameState(newState);
        
        const newRemaining = consumeDie(remainingMoves, move.dieValue);
        setRemainingMoves(newRemaining);
        
        // Reset selection
        setSelectedPoint(null);
        setValidMoves([]);
        
        if (newState.bearOff.player === 15) {
          setGameStatus("You win! 🎉");
          setGameOver(true);
          play('chess_win');
        } else if (newRemaining.length === 0) {
          setGameStatus("AI's turn");
          setCurrentPlayer("ai");
          setDice([]);
        } else {
          const allMoves = getAllLegalMoves(newState, newRemaining, "player");
          if (allMoves.length === 0) {
            setGameStatus("No more moves - AI's turn");
            setCurrentPlayer("ai");
            setDice([]);
            setRemainingMoves([]);
          } else if (newState.bar.player > 0) {
            setGameStatus("Click the bar to re-enter your next checker");
          } else {
            setGameStatus("Continue moving - select a checker");
          }
        }
        return;
      }
      
      // Not a valid bar entry point - prompt user
      if (selectedPoint !== -1) {
        setGameStatus("You must click the bar first to re-enter!");
      } else {
        setGameStatus("Select a highlighted entry point");
      }
      return;
    }
    
    // CASE 2: No bar checkers - normal move selection
    if (selectedPoint === null) {
      if (pointIndex >= 0 && gameState.points[pointIndex] > 0) {
        const pointMoves = getLegalMovesFromPoint(gameState, pointIndex, remainingMoves, "player");
        if (pointMoves.length > 0) {
          setSelectedPoint(pointIndex);
          setValidMoves(pointMoves.map(m => m.to));
          setGameStatus("Select where to move");
        } else {
          setGameStatus("No legal moves from this point");
        }
      }
    } else {
      if (pointIndex === selectedPoint) {
        setSelectedPoint(null);
        setValidMoves([]);
        setGameStatus("Select a checker to move");
        return;
      }
      
      if (validMoves.includes(pointIndex) || (pointIndex === -2 && validMoves.includes(-2))) {
        const moves = getLegalMovesFromPoint(gameState, selectedPoint, remainingMoves, "player");
        const move = moves.find(m => m.to === pointIndex);
        
        if (move) {
          const newState = applyMoveWithSound(gameState, move, "player");
          setGameState(newState);
          
          const newRemaining = consumeDie(remainingMoves, move.dieValue);
          setRemainingMoves(newRemaining);
          
          if (newState.bearOff.player === 15) {
            setGameStatus("You win! 🎉");
            setGameOver(true);
            play('chess_win');
          } else if (newRemaining.length === 0) {
            setGameStatus("AI's turn");
            setCurrentPlayer("ai");
            setDice([]);
          } else {
            const allMoves = getAllLegalMoves(newState, newRemaining, "player");
            if (allMoves.length === 0) {
              setGameStatus("No more moves - AI's turn");
              setCurrentPlayer("ai");
              setDice([]);
              setRemainingMoves([]);
            } else {
              setGameStatus("Continue moving");
            }
          }
        }
      }
      
      setSelectedPoint(null);
      setValidMoves([]);
    }
  }, [currentPlayer, remainingMoves, gameOver, isThinking, gameState, selectedPoint, validMoves, applyMoveWithSound, play]);

  // AI turn - uses unified engine with animated moves
  useEffect(() => {
    if (currentPlayer !== "ai" || gameOver || dice.length > 0) return;
    
    setIsThinking(true);
    setGameStatus("AI is rolling...");
    
    const runAiTurn = async () => {
      // Roll dice
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      setDice([d1, d2]);
      const diceValues = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      setRemainingMoves(diceValues);
      
      // Play dice sound for AI
      play('backgammon_dice');
      
      // Wait for dice animation
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      setGameStatus("AI is thinking...");
      
      // Use the unified engine for AI moves
      let state = gameState;
      let remaining = [...diceValues];
      
      // Collect all moves first
      const movesToAnimate: BackgammonMove[] = [];
      
      while (remaining.length > 0) {
        // Convert to engine state for AI decision
        const engineState = toEngineState(state, remaining, "ai");
        
        // Use the unified AI engine to choose move
        const engineMove = await chooseBackgammonMove(
          engineState,
          'PLAYER_2', // AI is always PLAYER_2
          toEngineDifficulty(difficulty)
        );
        
        if (!engineMove) break; // No legal moves
        
        movesToAnimate.push(engineMove);
        
        // Apply move to state for next iteration
        const legacyMove = toLegacyMove(engineMove);
        state = applyMoveEngine(state, legacyMove, "ai");
        remaining = consumeDie(remaining, legacyMove.dieValue);
      }
      
      // Now animate each move one by one
      let currentState = gameState;
      for (const move of movesToAnimate) {
        // Show animation indicator
        setAnimatingMove({ 
          from: move.from === 'BAR' ? 'BAR' : move.from, 
          to: move.to === 'OFF' ? 25 : move.to 
        });
        
        // Wait for animation
        await new Promise(resolve => setTimeout(resolve, 600));
        
        // Apply the move
        const legacyMove = toLegacyMove(move);
        currentState = applyMoveEngine(currentState, legacyMove, "ai");
        setGameState(currentState);
        
        // Play move sound
        if (move.to === 'OFF') {
          play('backgammon_bearoff');
        } else {
          play('backgammon_move');
        }
        
        // Clear animation
        setAnimatingMove(null);
        
        // Small pause between moves
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      setIsThinking(false);
      setDice([]);
      setRemainingMoves([]);
      
      if (currentState.bearOff.ai === 15) {
        setGameStatus(t('gameAI.youLose'));
        setGameOver(true);
        play('chess_lose');
      } else {
        setCurrentPlayer("player");
        setGameStatus(t('gameAI.yourTurnRoll'));
      }
    };
    
    setTimeout(() => {
      runAiTurn();
    }, 500);
  }, [currentPlayer, gameOver, dice, gameState, difficulty, play, t]);

  // Restart game
  const restartGame = useCallback(() => {
    setGameState({
      points: getInitialBoard(),
      bar: { player: 0, ai: 0 },
      bearOff: { player: 0, ai: 0 },
    });
    setDice([]);
    setRemainingMoves([]);
    setCurrentPlayer("player");
    setSelectedPoint(null);
    setGameStatus(t('gameAI.rollToStart'));
    setGameOver(false);
    setIsThinking(false);
    setValidMoves([]);
  }, [t]);

  // ============== DESKTOP POINT RENDERING ==============
  const renderDesktopPoint = (index: number, isTop: boolean) => {
    const value = gameState.points[index];
    const checkerCount = Math.abs(value);
    const isPlayer = value > 0;
    const isSelected = selectedPoint === index;
    const isValidTarget = validMoves.includes(index);
    const isAnimatingFrom = animatingMove?.from === index;
    const isAnimatingTo = animatingMove?.to === index;
    
    return (
      <div
        key={index}
        onClick={() => handlePointClick(index)}
        className={cn(
          "relative flex items-center cursor-pointer transition-all",
          isTop ? "flex-col" : "flex-col-reverse"
        )}
        style={{ width: 48 }}
      >
        {/* Triangle */}
        <svg
          width={48}
          height={140}
          viewBox="0 0 48 140"
          className={cn(
            "transition-all duration-200",
            isTop ? "" : "rotate-180",
            isValidTarget && "drop-shadow-[0_0_25px_hsl(45_93%_70%)] drop-shadow-[0_0_50px_hsl(45_93%_60%)] md:drop-shadow-[0_0_20px_hsl(45_93%_60%)] md:drop-shadow-[0_0_40px_hsl(45_93%_50%/_0.8)]"
          )}
        >
          <defs>
            <linearGradient id={`goldTri-${index}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="hsl(45 93% 50%)" />
              <stop offset="40%" stopColor="hsl(45 80% 45%)" />
              <stop offset="100%" stopColor="hsl(35 70% 35%)" />
            </linearGradient>
            <linearGradient id={`sandTri-${index}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="hsl(35 50% 55%)" />
              <stop offset="40%" stopColor="hsl(35 45% 45%)" />
              <stop offset="100%" stopColor="hsl(30 40% 35%)" />
            </linearGradient>
          </defs>

          <polygon points="24,5 3,135 45,135" fill="rgba(0,0,0,0.2)" transform="translate(1, 1)" />
          <polygon
            points="24,5 3,135 45,135"
            fill={index % 2 === 0 ? `url(#goldTri-${index})` : `url(#sandTri-${index})`}
            stroke={index % 2 === 0 ? "hsl(35 80% 35%)" : "hsl(30 40% 30%)"}
            strokeWidth="1"
          />
          <polygon
            points="24,18 10,125 38,125"
            fill="none"
            stroke={index % 2 === 0 ? "hsl(45 93% 65% / 0.25)" : "hsl(35 50% 60% / 0.25)"}
            strokeWidth="1"
          />
          {isValidTarget && (
            <>
              <polygon points="24,5 3,135 45,135" fill="hsl(45 93% 75% / 0.7)" className="animate-pulse" />
              <polygon points="24,5 3,135 45,135" fill="none" stroke="hsl(45 100% 80%)" strokeWidth="4" className="animate-pulse" />
            </>
          )}
        </svg>
        
        {/* AI Move Animation Glow - Source */}
        {isAnimatingFrom && (
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(circle at 50% 50%, hsl(45 93% 54% / 0.6) 0%, transparent 70%)",
              animation: "pulse 0.6s ease-in-out infinite"
            }}
          />
        )}
        
        {/* AI Move Animation Glow - Target */}
        {isAnimatingTo && (
          <div 
            className="absolute inset-0 pointer-events-none z-20"
            style={{
              background: "radial-gradient(circle at 50% 50%, hsl(120 70% 50% / 0.5) 0%, transparent 70%)",
              animation: "pulse 0.6s ease-in-out infinite"
            }}
          />
        )}
        
        {/* Checkers - positioned on triangle */}
        {checkerCount > 0 && (
          <div 
            className={cn(
              "absolute transition-all duration-500",
              isTop ? "top-2" : "bottom-2",
              isAnimatingFrom && "opacity-50 scale-90",
              isAnimatingTo && "animate-[bounce_0.5s_ease-out]"
            )}
            style={{ left: '50%', transform: 'translateX(-50%)' }}
          >
            <CheckerStack
              count={checkerCount}
              variant={isPlayer ? "gold" : "obsidian"}
              isSelected={isSelected}
              isValidTarget={isValidTarget}
              onClick={() => handlePointClick(index)}
              isTop={isTop}
              size="md"
            />
          </div>
        )}
        
        <span className={`absolute ${isTop ? "-bottom-5" : "-top-5"} text-xs text-primary/40 font-medium`}>
          {index + 1}
        </span>
      </div>
    );
  };

  // ============== MOBILE POINT RENDERING (Vertical Board) ==============
  const renderMobilePoint = (index: number, isLeftSide: boolean) => {
    const value = gameState.points[index];
    const checkerCount = Math.abs(value);
    const isPlayer = value > 0;
    const isSelected = selectedPoint === index;
    const isValidTarget = validMoves.includes(index);
    const isAnimatingFrom = animatingMove?.from === index;
    const isAnimatingTo = animatingMove?.to === index;
    
    // For mobile vertical board: triangles point inward toward center bar
    // Left side triangles point right, right side triangles point left
    return (
      <div
        key={index}
        onClick={() => handlePointClick(index)}
        className={cn(
          "relative flex items-center cursor-pointer transition-all",
          "h-[calc((100%-8px)/6)]", // Divide available height by 6 points
          isLeftSide ? "flex-row" : "flex-row-reverse"
        )}
      >
        {/* Triangle pointing toward center */}
        <svg
          viewBox="0 0 60 28"
          className={cn(
            "h-full w-[50px] shrink-0 transition-all duration-300",
            isValidTarget && "drop-shadow-[0_0_12px_hsl(45_93%_70%)] drop-shadow-[0_0_24px_hsl(45_93%_55%/_0.7)]",
            isSelected && "drop-shadow-[0_0_8px_hsl(45_93%_60%/_0.5)]"
          )}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`mGold-${index}`} x1={isLeftSide ? "0%" : "100%"} y1="0%" x2={isLeftSide ? "100%" : "0%"} y2="0%">
              <stop offset="0%" stopColor="hsl(45 93% 48%)" />
              <stop offset="100%" stopColor="hsl(35 70% 32%)" />
            </linearGradient>
            <linearGradient id={`mSand-${index}`} x1={isLeftSide ? "0%" : "100%"} y1="0%" x2={isLeftSide ? "100%" : "0%"} y2="0%">
              <stop offset="0%" stopColor="hsl(35 50% 50%)" />
              <stop offset="100%" stopColor="hsl(30 40% 32%)" />
            </linearGradient>
          </defs>

          {/* Triangle: left side points right, right side points left */}
          <polygon
            points={isLeftSide ? "0,2 0,26 58,14" : "60,2 60,26 2,14"}
            fill={index % 2 === 0 ? `url(#mGold-${index})` : `url(#mSand-${index})`}
            stroke={index % 2 === 0 ? "hsl(35 80% 30%)" : "hsl(30 40% 28%)"}
            strokeWidth="0.5"
          />
          {isValidTarget && (
            <>
              {/* Elegant gold fill with soft glow */}
              <polygon
                points={isLeftSide ? "0,2 0,26 58,14" : "60,2 60,26 2,14"}
                fill="hsl(45 93% 65% / 0.5)"
                style={{ filter: 'blur(0.5px)' }}
              />
              {/* Crisp golden border */}
              <polygon
                points={isLeftSide ? "0,2 0,26 58,14" : "60,2 60,26 2,14"}
                fill="none"
                stroke="hsl(45 100% 75%)"
                strokeWidth="1.5"
                className="animate-pulse"
              />
            </>
          )}
        </svg>
        
        {/* AI Move Animation Glow - Source (Mobile) */}
        {isAnimatingFrom && (
          <div 
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: "radial-gradient(circle at 50% 50%, hsl(45 93% 54% / 0.6) 0%, transparent 70%)",
              animation: "pulse 0.6s ease-in-out infinite"
            }}
          />
        )}
        
        {/* AI Move Animation Glow - Target (Mobile) */}
        {isAnimatingTo && (
          <div 
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: "radial-gradient(circle at 50% 50%, hsl(120 70% 50% / 0.5) 0%, transparent 70%)",
              animation: "pulse 0.6s ease-in-out infinite"
            }}
          />
        )}
        
        {/* Checker stack - positioned beside triangle - TAPPABLE ZONE */}
        <div 
          className={cn(
            "absolute flex items-center justify-center cursor-pointer min-w-[48px] min-h-[48px] transition-all active:scale-95",
            isLeftSide ? "left-[50px]" : "right-[50px]",
            isAnimatingFrom && "opacity-50 scale-90",
            isAnimatingTo && "animate-[bounce_0.5s_ease-out]"
          )}
          onClick={(e) => {
            e.stopPropagation();
            handlePointClick(index);
          }}
        >
          {checkerCount > 0 && (
            <div className="flex flex-row items-center gap-0">
              {/* Render checkers horizontally for mobile */}
              {Array.from({ length: Math.min(checkerCount, 4) }).map((_, i) => (
                <div
                  key={i}
                  className="transition-all"
                  style={{
                    marginLeft: i > 0 ? '-8px' : 0,
                    zIndex: i,
                  }}
                >
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shadow-md",
                      isPlayer 
                        ? "bg-gradient-to-br from-primary via-primary to-amber-700 text-amber-900 border-2 border-amber-500" 
                        : "bg-gradient-to-br from-slate-600 via-slate-800 to-slate-900 text-primary border-2 border-primary/40",
                      isSelected && i === Math.min(checkerCount, 4) - 1 && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                      isValidTarget && i === Math.min(checkerCount, 4) - 1 && "ring-2 ring-primary"
                    )}
                    style={{
                      boxShadow: isSelected 
                        ? '0 0 12px hsl(45 93% 60% / 0.6), 0 2px 4px rgba(0,0,0,0.3)' 
                        : '0 2px 4px rgba(0,0,0,0.3)'
                    }}
                  >
                    {i === Math.min(checkerCount, 4) - 1 && checkerCount > 4 ? checkerCount : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={cn(
      "bg-background relative overflow-hidden",
      isMobile ? "h-screen overflow-y-hidden flex flex-col" : "min-h-screen"
    )}>
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
      {/* Subtle pyramid silhouette - desktop only */}
      {!isMobile && (
        <div className="absolute inset-0 flex items-end justify-center pointer-events-none overflow-hidden">
          <div 
            className="w-[600px] h-[400px] opacity-[0.03] translate-y-1/2"
            style={{
              background: "linear-gradient(to top, hsl(45 93% 54%) 0%, transparent 80%)",
              clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
            }}
          />
        </div>
      )}

      <div className={cn(
        "relative z-10",
        isMobile ? "flex-1 flex flex-col min-h-0" : ""
      )}>
        {/* Header */}
        <header className={cn(
          "border-b border-primary/20 px-3 shrink-0",
          isMobile ? "py-1.5" : "py-4"
        )}>
          <div className="max-w-6xl mx-auto">
            {!isMobile && (
              <div className="mb-4">
                <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary group p-1">
                  <Link to="/play-ai" className="flex items-center gap-1">
                    <ArrowLeft size={16} className="group-hover:text-primary transition-colors" />
                    <span>{t('gameAI.back')}</span>
                  </Link>
                </Button>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              {isMobile && (
                <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary p-1 -ml-1">
                  <Link to="/play-ai">
                    <ArrowLeft size={16} />
                  </Link>
                </Button>
              )}
              
              <div className="flex items-center gap-1.5 flex-1 justify-center">
                <Gem className={cn("text-primary", isMobile ? "w-3 h-3" : "w-4 h-4")} />
                <h1 
                  className={cn(
                    "font-display font-bold tracking-wide text-center",
                    isMobile ? "text-sm" : "text-xl md:text-2xl"
                  )}
                  style={{
                    background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {isMobile ? "Backgammon" : t('gameAI.backgammonTitle')}
                </h1>
                <Gem className={cn("text-primary", isMobile ? "w-3 h-3" : "w-4 h-4")} />
              </div>

              {isMobile && <div className="w-8" />}
            </div>
            
            {!isMobile && (
              <p className="text-center text-sm text-muted-foreground/60 mt-1">
                <Star className="w-3 h-3 inline-block mr-1 text-primary/40" />
                {t('gameAI.freeMode')}
                <Star className="w-3 h-3 inline-block ml-1 text-primary/40" />
              </p>
            )}
          </div>
        </header>

        {/* ============== MOBILE LAYOUT ============== */}
        {isMobile ? (
          <div className="flex-1 flex flex-col min-h-0 px-2 pt-1 pb-2">
            {/* Score Row */}
            <div className="flex justify-between items-center px-2 py-1 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">AI:</span>
                <span className="text-primary font-bold text-sm">{gameState.bearOff.ai}</span>
                <span className="text-[10px] text-muted-foreground/60">/15</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">You:</span>
                <span className="text-primary font-bold text-sm">{gameState.bearOff.player}</span>
                <span className="text-[10px] text-muted-foreground/60">/15</span>
              </div>
            </div>

            {/* Board Container */}
            <div className="flex-1 min-h-0 relative">
              {/* Subtle glow */}
              <div className="absolute -inset-1 bg-primary/10 rounded-xl blur-lg opacity-30" />
              
              {/* Gold frame */}
              <div className="relative h-full p-[3px] rounded-lg bg-gradient-to-br from-primary/40 via-primary/20 to-primary/40">
                <div className="h-full flex bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-md overflow-hidden">
                  
                  {/* Left Column - Player moves: 18→13 (top), then 12→7 (bottom) */}
                  <div className="flex-1 flex flex-col p-1">
                    {/* Top half: Points 18→13 (player moves DOWN through these) */}
                    <div className="flex-1 flex flex-col justify-evenly border-b border-primary/20">
                      {[17, 16, 15, 14, 13, 12].map(i => renderMobilePoint(i, true))}
                    </div>
                    {/* Bottom half: Points 12→7 (player continues DOWN) */}
                    <div className="flex-1 flex flex-col justify-evenly">
                      {[11, 10, 9, 8, 7, 6].map(i => renderMobilePoint(i, true))}
                    </div>
                  </div>

                  {/* Center Bar */}
                  <div className="w-14 bg-gradient-to-b from-background via-midnight-light to-background border-x border-primary/20 flex flex-col items-center justify-center shrink-0">
                    {/* AI Bar Checkers */}
                    {gameState.bar.ai > 0 && (
                      <div className="flex flex-col items-center mb-2">
                        <span className="text-[8px] text-muted-foreground mb-0.5">AI</span>
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-600 to-slate-900 border border-primary/30 flex items-center justify-center text-[10px] text-primary font-bold">
                          {gameState.bar.ai}
                        </div>
                      </div>
                    )}
                    
                    {/* Dice */}
                    {dice.length > 0 && (
                      <div className="flex flex-col gap-1 my-2">
                        <Dice3D value={dice[0]} variant={currentPlayer === "player" ? "ivory" : "obsidian"} isRolling={isThinking && currentPlayer === "ai"} size="xs" />
                        <Dice3D value={dice[1]} variant={currentPlayer === "player" ? "ivory" : "obsidian"} isRolling={isThinking && currentPlayer === "ai"} size="xs" />
                      </div>
                    )}
                    
                    {/* Player Bar Checkers - Min 44px tap target */}
                    {gameState.bar.player > 0 && (
                      <div 
                        className={cn(
                          "flex flex-col items-center justify-center cursor-pointer rounded-lg p-2 min-w-[44px] min-h-[44px] transition-all active:scale-95",
                          selectedPoint === -1 
                            ? "ring-2 ring-primary bg-primary/20 shadow-[0_0_12px_hsl(45_93%_54%_/_0.4)]" 
                            : currentPlayer === "player" && remainingMoves.length > 0 && !gameOver
                              ? "bg-primary/10 animate-pulse"
                              : ""
                        )}
                        onClick={() => handlePointClick(-1)}
                      >
                        <div className={cn(
                          "w-7 h-7 rounded-full bg-gradient-to-br from-primary to-amber-700 border-2 border-amber-500 flex items-center justify-center text-[11px] text-amber-900 font-bold shadow-md",
                          selectedPoint === -1 && "ring-2 ring-offset-1 ring-offset-background ring-primary"
                        )}>
                          {gameState.bar.player}
                        </div>
                        <span className="text-[9px] text-primary font-medium mt-1">TAP</span>
                      </div>
                    )}
                  </div>

                  {/* Right Column - Player moves: 24→19 (top), then 6→1 (bottom = HOME) */}
                  <div className="flex-1 flex flex-col p-1">
                    {/* Top half: Points 24→19 (player starts here, moves DOWN) */}
                    <div className="flex-1 flex flex-col justify-evenly border-b border-primary/20">
                      {[23, 22, 21, 20, 19, 18].map(i => renderMobilePoint(i, false))}
                    </div>
                    {/* Bottom half: Points 6→1 (player HOME, bears off from here) */}
                    <div className="flex-1 flex flex-col justify-evenly">
                      {[5, 4, 3, 2, 1, 0].map(i => renderMobilePoint(i, false))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls Area - Below Board */}
            <div className="shrink-0 mt-2 space-y-2">
              {/* Roll Button */}
              {currentPlayer === "player" && dice.length === 0 && !gameOver && (
                <Button 
                  variant="gold" 
                  size="lg" 
                  className="w-full py-4 text-lg font-bold shadow-[0_0_24px_-6px_hsl(45_93%_54%_/_0.6)]" 
                  onClick={rollDice}
                >
                  🎲 ROLL
                </Button>
              )}

              {/* Status Bar */}
              <div 
                className={cn(
                  "rounded-lg border px-3 py-2 text-center",
                  gameOver 
                    ? gameStatus.includes("win") 
                      ? "bg-green-500/10 border-green-500/30" 
                      : "bg-red-500/10 border-red-500/30"
                    : "bg-primary/5 border-primary/20"
                )}
              >
                <p 
                  className={cn(
                    "font-display font-bold text-sm",
                    gameOver 
                      ? gameStatus.includes("win") ? "text-green-400" : "text-red-400"
                      : isThinking ? "text-muted-foreground" : "text-primary"
                  )}
                  style={!gameOver && !isThinking ? {
                    background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  } : undefined}
                >
                  {gameStatus}
                </p>
                {remainingMoves.length > 0 && currentPlayer === "player" && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Moves left: {remainingMoves.join(", ")}
                  </p>
                )}
              </div>

              {/* Bear Off Button */}
              {canBearOff(gameState, "player") && validMoves.includes(-2) && (
                <Button 
                  variant="outline" 
                  className="w-full py-2 border-primary/30 text-primary hover:bg-primary/10" 
                  onClick={() => handlePointClick(-2)}
                >
                  Bear Off
                </Button>
              )}

              {/* Quick Actions */}
              <div className="flex gap-2">
                <Button onClick={restartGame} className="flex-1 py-2" variant="gold" size="sm">
                  <RotateCcw size={14} className="mr-1" />
                  Restart
                </Button>
                <Button asChild variant="ghost" size="sm" className="flex-1 py-2 text-muted-foreground border border-primary/20 text-xs">
                  <Link to="/play-ai">
                    Change AI
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* ============== DESKTOP LAYOUT (Original Premium) ============== */
          <div className="max-w-6xl mx-auto px-2 md:px-4 py-4 md:py-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
              {/* Board Area */}
              <div className="lg:col-span-3 space-y-3 md:space-y-4">
                {/* Board Container with gold frame */}
                <div className="relative">
                  {/* Outer glow */}
                  <div className="absolute -inset-2 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-xl opacity-50" />
                  
                  {/* Gold frame */}
                  <div className="relative p-1 rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-primary/40 shadow-[0_0_40px_-10px_hsl(45_93%_54%_/_0.4)]">
                    <div className="bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-lg p-2 md:p-4 overflow-hidden">
                      
                      {/* AI Bear Off / Bar */}
                      <div className="flex justify-between items-center mb-3 px-2">
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          AI Borne Off: <span className="text-primary font-bold">{gameState.bearOff.ai}</span>
                        </div>
                        {gameState.bar.ai > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">AI Bar:</span>
                            <CheckerStack count={gameState.bar.ai} variant="obsidian" isTop={true} />
                          </div>
                        )}
                      </div>

                      {/* Top points (13-24) */}
                      <div className="flex justify-center gap-0.5 mb-1">
                        <div className="flex gap-0.5">
                          {[12, 13, 14, 15, 16, 17].map(i => renderDesktopPoint(i, true))}
                        </div>
                        <div className="w-6 md:w-8 bg-gradient-to-b from-primary/20 to-primary/10 rounded border border-primary/20" />
                        <div className="flex gap-0.5">
                          {[18, 19, 20, 21, 22, 23].map(i => renderDesktopPoint(i, true))}
                        </div>
                      </div>

                      {/* Middle bar with premium 3D dice */}
                      <div className="h-16 bg-gradient-to-r from-midnight-light via-background to-midnight-light my-2 rounded-lg border border-primary/20 flex items-center justify-center gap-1">
                        {dice.length > 0 && (
                          <div className="flex gap-4 items-center">
                            <Dice3D value={dice[0]} variant={currentPlayer === "player" ? "ivory" : "obsidian"} isRolling={isThinking && currentPlayer === "ai"} />
                            <Dice3D value={dice[1]} variant={currentPlayer === "player" ? "ivory" : "obsidian"} isRolling={isThinking && currentPlayer === "ai"} />
                          </div>
                        )}
                      </div>

                      {/* Bottom points (1-12) */}
                      <div className="flex justify-center gap-0.5 mt-1">
                        <div className="flex gap-0.5">
                          {[11, 10, 9, 8, 7, 6].map(i => renderDesktopPoint(i, false))}
                        </div>
                        <div className="w-6 md:w-8 bg-gradient-to-t from-primary/20 to-primary/10 rounded border border-primary/20" />
                        <div className="flex gap-0.5">
                          {[5, 4, 3, 2, 1, 0].map(i => renderDesktopPoint(i, false))}
                        </div>
                      </div>

                      {/* Player Bar / Bear Off */}
                      <div className="flex justify-between items-center mt-3 px-2">
                        {gameState.bar.player > 0 ? (
                          <div 
                            className={cn(
                              "flex items-center gap-2 cursor-pointer transition-all rounded-lg p-1",
                              selectedPoint === -1 && "ring-2 ring-primary bg-primary/10"
                            )}
                            onClick={() => handlePointClick(-1)}
                          >
                            <span className="text-xs text-muted-foreground">Your Bar:</span>
                            <CheckerStack 
                              count={gameState.bar.player} 
                              variant="gold" 
                              isSelected={selectedPoint === -1}
                              onClick={() => handlePointClick(-1)}
                              isTop={false} 
                            />
                          </div>
                        ) : <div />}
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          You Borne Off: <span className="text-primary font-bold">{gameState.bearOff.player}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap gap-3 items-center justify-center">
                  {currentPlayer === "player" && dice.length === 0 && !gameOver && (
                    <Button variant="gold" size="lg" className="min-w-[140px] shadow-[0_0_30px_-8px_hsl(45_93%_54%_/_0.5)]" onClick={rollDice}>
                      🎲 Roll Dice
                    </Button>
                  )}
                  {canBearOff(gameState, "player") && validMoves.includes(-2) && (
                    <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/10" onClick={() => handlePointClick(-2)}>
                      Bear Off
                    </Button>
                  )}
                  <Button onClick={restartGame} variant="ghost" className="border border-primary/20">
                    <RotateCcw size={16} className="mr-2" />
                    Restart
                  </Button>
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Status Card */}
                <div className="relative">
                  <div className="absolute -inset-1 bg-primary/10 rounded-xl blur-lg opacity-40" />
                  <div 
                    className={cn(
                      "relative rounded-xl border p-4",
                      gameOver 
                        ? gameStatus.includes("win") 
                          ? "bg-green-500/10 border-green-500/30" 
                          : "bg-red-500/10 border-red-500/30"
                        : "bg-card/50 border-primary/20"
                    )}
                  >
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Game Status</h3>
                    <p 
                      className={cn(
                        "font-display text-lg font-bold",
                        gameOver 
                          ? gameStatus.includes("win") ? "text-green-400" : "text-red-400"
                          : isThinking ? "text-muted-foreground" : "text-primary"
                      )}
                      style={!gameOver && !isThinking ? {
                        background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      } : undefined}
                    >
                      {gameStatus}
                    </p>
                    {remainingMoves.length > 0 && currentPlayer === "player" && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Remaining moves: {remainingMoves.join(", ")}
                      </p>
                    )}
                  </div>
                </div>

                {/* Difficulty Card */}
                <div className="relative">
                  <div className="absolute -inset-1 bg-primary/5 rounded-xl blur-lg opacity-40" />
                  <div className="relative rounded-xl border border-primary/20 bg-card/30 p-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">AI Difficulty</h3>
                    <p 
                      className="font-display text-xl font-bold"
                      style={{
                        background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      {difficultyLabel}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{difficultyDescription}</p>
                    <Button asChild variant="ghost" size="sm" className="mt-3 w-full border border-primary/20 text-primary/80 hover:text-primary hover:bg-primary/5">
                      <Link to="/play-ai">
                        Change Difficulty
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Rules Card */}
                <div className="relative">
                  <div className="absolute -inset-1 bg-primary/5 rounded-xl blur-lg opacity-40" />
                  <div className="relative rounded-xl border border-primary/20 bg-card/30 p-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Quick Rules</h3>
                    <ul className="text-xs text-muted-foreground space-y-1.5">
                      <li>• Move all 15 checkers to your home board</li>
                      <li>• Then bear off all checkers to win</li>
                      <li>• Hit opponent's single checkers to send them to the bar</li>
                      <li>• Must re-enter from bar before other moves</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BackgammonAI;