import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, RotateCw, Gem, Star, Trophy } from "lucide-react";
import { SoundToggle } from "@/components/SoundToggle";
import { BackgammonRulesDialog } from "@/components/BackgammonRulesDialog";
import { Dice3D, CheckerStack } from "@/components/BackgammonPieces";
import { BackgammonCheckerAnimation, useCheckerAnimation } from "@/components/BackgammonCheckerAnimation";
import GoldConfettiExplosion from "@/components/GoldConfettiExplosion";
import { cn } from "@/lib/utils";
import { useAIGameTracker } from "@/hooks/useAIGameTracker";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSound } from "@/contexts/SoundContext";
import { useTranslation } from "react-i18next";
import {
  type Player,
  type GameState,
  type Move,
  type GameResultType,
  getInitialBoard,
  canBearOff,
  getAllLegalMoves,
  getLegalMovesFromBar,
  getLegalMovesFromPoint,
  applyMove as applyMoveEngine,
  consumeDie,
  checkWinner,
  getGameResult,
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

// Format result type for display
const formatResultType = (resultType: GameResultType | null): { label: string; multiplier: string; color: string } => {
  switch (resultType) {
    case "backgammon":
      return { label: "BACKGAMMON!", multiplier: "3×", color: "text-red-500" };
    case "gammon":
      return { label: "GAMMON!", multiplier: "2×", color: "text-orange-500" };
    case "single":
    default:
      return { label: "Single Game", multiplier: "1×", color: "text-primary" };
  }
};

const BackgammonAI = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const difficulty = (searchParams.get("difficulty") as Difficulty) || "medium";
  const { recordWin, recordLoss } = useAIGameTracker("backgammon", difficulty);
  const { play } = useSound();

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
  // Animation state for moves
  const [animatingMove, setAnimatingMove] = useState<{ from: number | 'BAR'; to: number } | null>(null);
  // Smooth checker animation
  const { animatingChecker, animateMove, onAnimationComplete } = useCheckerAnimation(450);
  // Refs for point elements (for animation positioning)
  const pointRefs = useRef<Map<number | 'BAR' | 'BEAR_OFF_PLAYER' | 'BEAR_OFF_AI', HTMLDivElement | null>>(new Map());
  // Game result state
  const [gameResultInfo, setGameResultInfo] = useState<{ winner: Player | null; resultType: GameResultType | null; multiplier: number } | null>(null);

  const difficultyLabel = useMemo(() => {
    switch (difficulty) {
      case "easy": return t('playAi.easy');
      case "medium": return t('playAi.medium');
      case "hard": return t('playAi.hard');
    }
  }, [difficulty, t]);

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

  // State for player animation in progress
  const [isAnimatingPlayerMove, setIsAnimatingPlayerMove] = useState(false);

  // Execute a player move with animation
  const executePlayerMove = useCallback(async (
    move: Move,
    fromKey: number | 'BAR',
    toKey: number | 'BEAR_OFF_PLAYER'
  ) => {
    setIsAnimatingPlayerMove(true);
    
    // Get element refs for animation
    const fromEl = pointRefs.current.get(fromKey) ?? null;
    const toEl = pointRefs.current.get(toKey) ?? null;
    
    // Play sound at start
    const isBearOff = move.to === -2 || move.to === 25;
    if (isBearOff) {
      play('backgammon_bearoff');
    } else {
      play('backgammon_move');
    }
    
    // Animate the checker movement
    if (fromEl && toEl) {
      await animateMove('gold', fromEl, toEl);
    }
    
    // Apply the move after animation
    const newState = applyMoveEngine(gameState, move, "player");
    setGameState(newState);
    
    const newRemaining = consumeDie(remainingMoves, move.dieValue);
    setRemainingMoves(newRemaining);
    
    // Reset selection
    setSelectedPoint(null);
    setValidMoves([]);
    setIsAnimatingPlayerMove(false);
    
    // Check game state after move
    if (newState.bearOff.player === 15) {
      const result = getGameResult(newState);
      setGameResultInfo(result);
      const resultDisplay = formatResultType(result.resultType);
      setGameStatus(`${t('gameAI.youWin')} ${resultDisplay.label}`);
      setGameOver(true);
      play('chess_win');
      recordWin();
    } else if (newRemaining.length === 0) {
      setGameStatus(t('gameAI.aiTurn'));
      setCurrentPlayer("ai");
      setDice([]);
    } else {
      const allMoves = getAllLegalMoves(newState, newRemaining, "player");
      if (allMoves.length === 0) {
        setGameStatus(t('gameAI.noLegalMoves'));
        setCurrentPlayer("ai");
        setDice([]);
        setRemainingMoves([]);
      } else if (newState.bar.player > 0) {
        setGameStatus(t('gameAI.barReenter'));
      } else {
        setGameStatus(t('gameAI.continueMoving'));
      }
    }
  }, [gameState, remainingMoves, animateMove, play]);

  // Handle point click - simplified bar logic to avoid closure issues
  const handlePointClick = useCallback((pointIndex: number) => {
    if (currentPlayer !== "player" || remainingMoves.length === 0 || gameOver || isThinking || isAnimatingPlayerMove) {
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
          setGameStatus(t('gameAI.barReenter'));
        } else {
          // Select the bar
          if (barMoves.length > 0) {
            setSelectedPoint(-1);
            setValidMoves(barMoves.map(m => m.to));
            setGameStatus(t('gameAI.selectEntry'));
          } else {
            setGameStatus(t('gameAI.allBlocked'));
          }
        }
        return;
      }
      
      // Clicking a board point - check if it's a valid bar entry destination
      const move = barMoves.find(m => m.to === pointIndex);
      
      if (move) {
        // Valid bar entry - animate and apply the move
        executePlayerMove(move, 'BAR', pointIndex);
        return;
      }
      
      // Not a valid bar entry point - prompt user
      if (selectedPoint !== -1) {
        setGameStatus(t('gameAI.mustClickBar'));
      } else {
        setGameStatus(t('gameAI.selectHighlightedEntry'));
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
          setGameStatus(t('gameAI.selectWhereToMove'));
        } else {
          setGameStatus(t('gameAI.noLegalMovesFromPoint'));
        }
      }
    } else {
      if (pointIndex === selectedPoint) {
        setSelectedPoint(null);
        setValidMoves([]);
        setGameStatus(t('gameAI.selectChecker'));
        return;
      }
      
      if (validMoves.includes(pointIndex) || (pointIndex === -2 && validMoves.includes(-2))) {
        const moves = getLegalMovesFromPoint(gameState, selectedPoint, remainingMoves, "player");
        const move = moves.find(m => m.to === pointIndex);
        
        if (move) {
          // Determine destination key for animation
          const toKey = move.to === -2 ? 'BEAR_OFF_PLAYER' : move.to;
          executePlayerMove(move, selectedPoint, toKey as number | 'BEAR_OFF_PLAYER');
          return;
        }
      }
      
      setSelectedPoint(null);
      setValidMoves([]);
    }
  }, [currentPlayer, remainingMoves, gameOver, isThinking, isAnimatingPlayerMove, gameState, selectedPoint, validMoves, executePlayerMove]);

  // AI turn - uses unified engine with animated moves
  useEffect(() => {
    if (currentPlayer !== "ai" || gameOver || dice.length > 0) return;
    
    setIsThinking(true);
    setGameStatus(t('gameAI.aiRolling'));
    
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
      
      setGameStatus(t('gameAI.aiThinking'));
      
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
        const fromKey = move.from === 'BAR' ? 'BAR' : move.from;
        const toKey = move.to === 'OFF' ? 'BEAR_OFF_AI' : move.to;
        
        // Get element refs for animation
        const fromEl = pointRefs.current.get(fromKey) ?? null;
        const toEl = pointRefs.current.get(toKey) ?? null;
        
        // Show glow indicator
        setAnimatingMove({ 
          from: move.from === 'BAR' ? 'BAR' : move.from, 
          to: move.to === 'OFF' ? 25 : move.to 
        });
        
        // Play move sound at start
        if (move.to === 'OFF') {
          play('backgammon_bearoff');
        } else {
          play('backgammon_move');
        }
        
        // Animate the checker movement
        if (fromEl && toEl) {
          await animateMove('obsidian', fromEl, toEl);
        } else {
          // Fallback: just wait
          await new Promise(resolve => setTimeout(resolve, 450));
        }
        
        // Apply the move after animation
        const legacyMove = toLegacyMove(move);
        currentState = applyMoveEngine(currentState, legacyMove, "ai");
        setGameState(currentState);
        
        // Clear animation indicator
        setAnimatingMove(null);
        
        // Small pause between moves
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      setIsThinking(false);
      setDice([]);
      setRemainingMoves([]);
      
      if (currentState.bearOff.ai === 15) {
        const result = getGameResult(currentState);
        setGameResultInfo(result);
        const resultDisplay = formatResultType(result.resultType);
        setGameStatus(`${t('gameAI.youLose')} - ${resultDisplay.label}`);
        setGameOver(true);
        play('chess_lose');
        recordLoss();
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
    setGameResultInfo(null);
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
        ref={(el) => pointRefs.current.set(index, el)}
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
        ref={(el) => pointRefs.current.set(index, el)}
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
      {/* Checker Animation Layer */}
      <BackgammonCheckerAnimation 
        animatingChecker={animatingChecker} 
        onAnimationComplete={onAnimationComplete} 
      />
      
      {/* Gold Confetti Explosion on Win */}
      <GoldConfettiExplosion 
        active={gameOver && gameResultInfo?.winner === 'player'} 
      />
      
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

              {/* Sound & Rules Buttons */}
              <div className="flex items-center gap-2">
                <SoundToggle size={isMobile ? "sm" : "md"} />
                {isMobile ? (
                  <BackgammonRulesDialog className="h-8 w-8" />
                ) : (
                  <BackgammonRulesDialog variant="button" />
                )}
              </div>
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
          <div className="flex-1 flex flex-col px-2 pt-1 pb-2 overflow-hidden min-h-0">
            {/* Score Row */}
              <div className="flex justify-between items-center px-2 py-1 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">{t('common.ai')}:</span>
                <span className="text-primary font-bold text-sm">{gameState.bearOff.ai}</span>
                <span className="text-[10px] text-muted-foreground/60">/15</span>
              </div>
              {/* Direction indicators - Player (Gold) moves counterclockwise, AI (Black) moves clockwise */}
              <div className="flex items-center gap-3">
                {/* Gold counter-clockwise (moves 24→1) */}
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-primary/40 bg-primary/5">
                  <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-primary to-amber-600" />
                  <RotateCcw className="w-3 h-3 text-primary" strokeWidth={2.5} />
                </div>
                {/* Black clockwise (moves 1→24) */}
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-slate-500/40 bg-slate-800/30">
                  <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-slate-600 to-slate-900" />
                  <RotateCw className="w-3 h-3 text-slate-400" strokeWidth={2.5} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">{t('common.you')}:</span>
                <span className="text-primary font-bold text-sm">{gameState.bearOff.player}</span>
                <span className="text-[10px] text-muted-foreground/60">/15</span>
              </div>
            </div>

            {/* Board Container - Flexible height that fits remaining space */}
            <div className="relative w-full flex-1 min-h-0" style={{ maxHeight: '55vh' }}>
              {/* Subtle glow */}
              <div className="absolute -inset-1 bg-primary/10 rounded-xl blur-lg opacity-30" />
              
              {/* Gold frame */}
              <div className="relative h-full p-[3px] rounded-lg bg-gradient-to-br from-primary/40 via-primary/20 to-primary/40">
                <div className="h-full flex bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-md overflow-hidden">
                  
                  {/* LEFT Column - Player's OUTER BOARD journey (24→13) */}
                  <div className="flex-1 flex flex-col p-1">
                    {/* Top half: Points 24→19 (player STARTS here, moves DOWN) */}
                    <div className="flex-1 flex flex-col justify-evenly border-b border-primary/20">
                      {[23, 22, 21, 20, 19, 18].map(i => renderMobilePoint(i, true))}
                    </div>
                    {/* Bottom half: Points 18→13 (continues DOWN) */}
                    <div className="flex-1 flex flex-col justify-evenly">
                      {[17, 16, 15, 14, 13, 12].map(i => renderMobilePoint(i, true))}
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
                        ref={(el) => pointRefs.current.set('BAR', el)}
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

                  {/* RIGHT Column - Player's HOME BOARD journey - REVERSED for clockwise flow */}
                  {/* Player enters from BOTTOM (point 12) and moves UP to bear off at TOP (point 1) */}
                  <div className="flex-1 flex flex-col p-1">
                    {/* Top half: Points 1→6 (player bears off from TOP) */}
                    <div className="flex-1 flex flex-col justify-evenly border-b border-primary/20">
                      {[0, 1, 2, 3, 4, 5].map(i => renderMobilePoint(i, false))}
                    </div>
                    {/* Bottom half: Points 7→12 (player enters from bar at BOTTOM) */}
                    <div className="flex-1 flex flex-col justify-evenly">
                      {[6, 7, 8, 9, 10, 11].map(i => renderMobilePoint(i, false))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls Area - Fixed height section below board */}
            <div className="shrink-0 mt-2 space-y-2" style={{ minHeight: '80px' }}>
              {/* Roll Button - Always takes space even when hidden */}
              <div style={{ minHeight: '52px' }}>
                {currentPlayer === "player" && dice.length === 0 && !gameOver ? (
                  <Button 
                    variant="gold" 
                    size="lg" 
                    className="w-full py-3 text-base font-bold shadow-[0_0_24px_-6px_hsl(45_93%_54%_/_0.6)]" 
                    onClick={rollDice}
                  >
                    🎲 {t('gameAI.rollDice').toUpperCase()}
                  </Button>
                ) : null}
              </div>

              {/* Status Bar */}
              <div 
                className={cn(
                  "rounded-lg border px-3 py-1.5",
                  gameOver 
                    ? gameStatus.includes("win") 
                      ? "bg-green-500/10 border-green-500/30" 
                      : "bg-red-500/10 border-red-500/30"
                    : "bg-primary/5 border-primary/20"
                )}
              >
                {/* Turn Indicator */}
                {!gameOver && (
                  <div className="flex items-center justify-center gap-2 mb-0.5">
                    {currentPlayer === "player" ? (
                      <span className="text-[10px] font-medium text-primary">{t('game.yourTurn').toUpperCase()}</span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400">{t('gameAI.aiThinking').toUpperCase()}</span>
                    )}
                  </div>
                )}
                <p 
                  className={cn(
                    "font-display font-bold text-sm text-center",
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
                {/* Game Result Display */}
                {gameOver && gameResultInfo && (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <Trophy className={cn("w-4 h-4", formatResultType(gameResultInfo.resultType).color)} />
                    <span className={cn("text-sm font-bold", formatResultType(gameResultInfo.resultType).color)}>
                      {formatResultType(gameResultInfo.resultType).multiplier} {t('gameAI.points')}
                    </span>
                  </div>
                )}
                {remainingMoves.length > 0 && currentPlayer === "player" && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t('gameAI.movesLeft')}: {remainingMoves.join(", ")}
                  </p>
                )}
              </div>

              {/* Bear Off Zone - Mobile */}
              {canBearOff(gameState, "player") && (
                <div 
                  className={cn(
                    "w-full py-2 rounded-lg flex items-center justify-center gap-2 transition-all",
                    validMoves.includes(-2) 
                      ? "bg-primary/20 border-2 border-primary animate-pulse cursor-pointer shadow-[0_0_20px_hsl(45_93%_54%_/_0.4)]" 
                      : "border border-primary/30 bg-primary/5"
                  )}
                  onClick={() => validMoves.includes(-2) && handlePointClick(-2)}
                >
                  <Trophy className={cn("w-4 h-4", validMoves.includes(-2) ? "text-primary" : "text-primary/50")} />
                  <span className={cn(
                    "font-bold",
                    validMoves.includes(-2) ? "text-primary" : "text-muted-foreground"
                  )}>
                    {validMoves.includes(-2) ? t('gameAI.tapToBearOff') : `${t('gameAI.bearOff')}: ${gameState.bearOff.player}/15`}
                  </span>
                  {validMoves.includes(-2) && (
                    <span className="text-xs text-primary/70">({gameState.bearOff.player}/15)</span>
                  )}
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex gap-2">
                <Button onClick={restartGame} className="flex-1 py-2" variant="gold" size="sm">
                  <RotateCcw size={14} className="mr-1" />
                  {t('gameAI.restart')}
                </Button>
                <Button asChild variant="ghost" size="sm" className="flex-1 py-2 text-muted-foreground border border-primary/20 text-xs">
                  <Link to="/play-ai">
                    {t('gameAI.changeDifficulty')}
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
                      
                      {/* AI Bear Off / Bar + Direction Indicators */}
                      <div className="flex justify-between items-center mb-3 px-2">
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {t('gameAI.aiBornOff')}: <span className="text-primary font-bold">{gameState.bearOff.ai}</span>
                        </div>
                        {/* Direction indicators - Gold moves counter-clockwise (24→1), Black moves clockwise (1→24) */}
                        <div className="flex items-center gap-3">
                          {/* Gold counter-clockwise */}
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-primary/40 bg-primary/5">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-primary to-amber-600 border border-amber-500/50" />
                            <RotateCcw className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} />
                            <span className="text-[10px] font-medium text-primary">{t('gameAI.ccw')}</span>
                          </div>
                          {/* Black clockwise */}
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-slate-500/40 bg-slate-800/30">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-slate-600 to-slate-900 border border-slate-500/50" />
                            <RotateCw className="w-3.5 h-3.5 text-slate-400" strokeWidth={2.5} />
                            <span className="text-[10px] font-medium text-slate-400">{t('gameAI.cw')}</span>
                          </div>
                        </div>
                        {gameState.bar.ai > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{t('gameAI.aiBar')}:</span>
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

                      {/* Player Bar / Bear Off Zone */}
                      <div className="flex justify-between items-center mt-3 px-2">
                        {gameState.bar.player > 0 ? (
                          <div 
                            ref={(el) => pointRefs.current.set('BAR', el)}
                            className={cn(
                              "flex items-center gap-2 cursor-pointer transition-all rounded-lg p-1",
                              selectedPoint === -1 && "ring-2 ring-primary bg-primary/10"
                            )}
                            onClick={() => handlePointClick(-1)}
                          >
                            <span className="text-xs text-muted-foreground">{t('gameAI.yourBar')}:</span>
                            <CheckerStack 
                              count={gameState.bar.player} 
                              variant="gold" 
                              isSelected={selectedPoint === -1}
                              onClick={() => handlePointClick(-1)}
                              isTop={false} 
                            />
                          </div>
                        ) : <div ref={(el) => pointRefs.current.set('BAR', el)} />}
                        
                        {/* Bear Off Zone - clickable when valid */}
                        <div 
                          ref={(el) => pointRefs.current.set('BEAR_OFF_PLAYER', el)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-3 py-2 transition-all",
                            validMoves.includes(-2) 
                              ? "cursor-pointer bg-primary/20 border-2 border-primary animate-pulse hover:bg-primary/30 shadow-[0_0_20px_hsl(45_93%_54%_/_0.4)]" 
                              : canBearOff(gameState, "player") 
                                ? "border border-primary/30 bg-primary/5" 
                                : "border border-primary/10"
                          )}
                          onClick={() => validMoves.includes(-2) && handlePointClick(-2)}
                        >
                          <span className={cn(
                            "text-xs font-medium",
                            validMoves.includes(-2) ? "text-primary" : "text-muted-foreground"
                          )}>
                            {t('gameAI.bearOff')}:
                          </span>
                          <span className={cn(
                            "font-bold",
                            validMoves.includes(-2) ? "text-primary text-lg" : "text-primary"
                          )}>
                            {gameState.bearOff.player}
                          </span>
                          <span className="text-xs text-muted-foreground">/15</span>
                          {validMoves.includes(-2) && (
                            <Trophy className="w-4 h-4 text-primary ml-1" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap gap-3 items-center justify-center">
                  {currentPlayer === "player" && dice.length === 0 && !gameOver && (
                    <Button variant="gold" size="lg" className="min-w-[140px] shadow-[0_0_30px_-8px_hsl(45_93%_54%_/_0.5)]" onClick={rollDice}>
                      🎲 {t('gameAI.rollDice')}
                    </Button>
                  )}
                  <Button onClick={restartGame} variant="ghost" className="border border-primary/20">
                    <RotateCcw size={16} className="mr-2" />
                    {t('gameAI.restart')}
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
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('game.gameStatus')}</h3>
                    {/* Direction Indicator - Desktop: Player (Gold) = counterclockwise, AI (Black) = clockwise */}
                    {!gameOver && (
                      <div className="flex items-center justify-start gap-2 mb-2">
                        {currentPlayer === "player" ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30">
                            <RotateCcw className="w-4 h-4 text-primary" strokeWidth={2.5} />
                            <span className="text-xs font-medium text-primary">{t('gameAI.counterCw')}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-700/50 border border-slate-500/30">
                            <RotateCw className="w-4 h-4 text-slate-400" strokeWidth={2.5} />
                            <span className="text-xs font-medium text-slate-400">{t('gameAI.clockwise')}</span>
                          </div>
                        )}
                      </div>
                    )}
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
                    {/* Game Result Display */}
                    {gameOver && gameResultInfo && (
                      <div className="mt-3 p-3 rounded-lg bg-background/50 border border-primary/20">
                        <div className="flex items-center justify-center gap-2">
                          <Trophy className={cn("w-5 h-5", formatResultType(gameResultInfo.resultType).color)} />
                          <span className={cn("text-lg font-bold", formatResultType(gameResultInfo.resultType).color)}>
                            {formatResultType(gameResultInfo.resultType).multiplier} {t('gameAI.points')}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground text-center mt-1">
                          {gameResultInfo.resultType === "backgammon" && t('gameAI.backgammonResult')}
                          {gameResultInfo.resultType === "gammon" && t('gameAI.gammonResult')}
                          {gameResultInfo.resultType === "single" && t('gameAI.singleResult')}
                        </p>
                      </div>
                    )}
                    {remainingMoves.length > 0 && currentPlayer === "player" && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {t('gameAI.remainingMoves')}: {remainingMoves.join(", ")}
                      </p>
                    )}
                  </div>
                </div>

                {/* Difficulty Card */}
                <div className="relative">
                  <div className="absolute -inset-1 bg-primary/5 rounded-xl blur-lg opacity-40" />
                  <div className="relative rounded-xl border border-primary/20 bg-card/30 p-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('gameAI.aiDifficulty')}</h3>
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
                        {t('gameAI.changeDifficulty')}
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Rules Card */}
                <div className="relative">
                  <div className="absolute -inset-1 bg-primary/5 rounded-xl blur-lg opacity-40" />
                  <div className="relative rounded-xl border border-primary/20 bg-card/30 p-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('gameAI.quickRules')}</h3>
                    <ul className="text-xs text-muted-foreground space-y-1.5">
                      <li>• {t('gameAI.quickRule1')}</li>
                      <li>• {t('gameAI.quickRule2')}</li>
                      <li>• {t('gameAI.quickRule3')}</li>
                      <li>• {t('gameAI.quickRule4')}</li>
                    </ul>
                    <div className="mt-3">
                      <BackgammonRulesDialog variant="button" className="w-full" />
                    </div>
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