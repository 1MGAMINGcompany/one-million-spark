import { useState, useCallback, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Gem, Star } from "lucide-react";
import { Dice3D, CheckerStack } from "@/components/BackgammonPieces";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

type Difficulty = "easy" | "medium" | "hard";
type Player = "player" | "ai";

interface GameState {
  points: number[]; // Positive = player checkers, negative = AI checkers
  bar: { player: number; ai: number };
  bearOff: { player: number; ai: number };
}

interface Move {
  from: number; // -1 = bar, 0-23 = point, 24 = bear off
  to: number;
  dieValue: number;
}

// Initial backgammon setup
const getInitialBoard = (): number[] => {
  const points = Array(24).fill(0);
  // Player pieces (positive) - moves from 24->1
  points[23] = 2;  // Point 24
  points[12] = 5;  // Point 13
  points[7] = 3;   // Point 8
  points[5] = 5;   // Point 6
  // AI pieces (negative) - moves from 1->24
  points[0] = -2;  // Point 1
  points[11] = -5; // Point 12
  points[16] = -3; // Point 17
  points[18] = -5; // Point 19
  return points;
};

const BackgammonAI = () => {
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
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
  const [gameStatus, setGameStatus] = useState("Roll the dice to start");
  const [gameOver, setGameOver] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [validMoves, setValidMoves] = useState<number[]>([]);

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
      case "medium": return "Moves toward home";
      case "hard": return "Hits and stacks";
    }
  }, [difficulty]);

  // Check if player can bear off
  const canBearOff = useCallback((state: GameState, player: Player): boolean => {
    if (player === "player") {
      if (state.bar.player > 0) return false;
      // All checkers must be in home board (points 0-5)
      for (let i = 6; i < 24; i++) {
        if (state.points[i] > 0) return false;
      }
      return true;
    } else {
      if (state.bar.ai > 0) return false;
      // All checkers must be in home board (points 18-23)
      for (let i = 0; i < 18; i++) {
        if (state.points[i] < 0) return false;
      }
      return true;
    }
  }, []);

  // Get legal moves for a point/bar
  const getLegalMoves = useCallback((state: GameState, from: number, moves: number[], player: Player): Move[] => {
    const legalMoves: Move[] = [];
    
    for (const die of moves) {
      let to: number;
      
      if (from === -1) {
        // From bar
        if (player === "player") {
          to = 24 - die; // Enter from point 24
        } else {
          to = die - 1; // Enter from point 1
        }
      } else {
        if (player === "player") {
          to = from - die;
        } else {
          to = from + die;
        }
      }
      
      // Check bearing off
      if (player === "player" && to < 0) {
        if (canBearOff(state, "player")) {
          // Can bear off if exact or highest checker
          if (to === -1 || from === Math.max(...state.points.map((p, i) => p > 0 ? i : -1))) {
            legalMoves.push({ from, to: -2, dieValue: die });
          }
        }
        continue;
      }
      if (player === "ai" && to > 23) {
        if (canBearOff(state, "ai")) {
          if (to === 24 || from === Math.min(...state.points.map((p, i) => p < 0 ? i : 99))) {
            legalMoves.push({ from, to: 25, dieValue: die });
          }
        }
        continue;
      }
      
      if (to < 0 || to > 23) continue;
      
      // Check if point is blocked
      const pointValue = state.points[to];
      if (player === "player" && pointValue < -1) continue; // Blocked by AI
      if (player === "ai" && pointValue > 1) continue; // Blocked by player
      
      legalMoves.push({ from, to, dieValue: die });
    }
    
    return legalMoves;
  }, [canBearOff]);

  // Get all legal moves for current player
  const getAllLegalMoves = useCallback((state: GameState, moves: number[], player: Player): Move[] => {
    const allMoves: Move[] = [];
    
    // Must move from bar first
    if (player === "player" && state.bar.player > 0) {
      return getLegalMoves(state, -1, moves, player);
    }
    if (player === "ai" && state.bar.ai > 0) {
      return getLegalMoves(state, -1, moves, player);
    }
    
    // Check all points
    for (let i = 0; i < 24; i++) {
      if (player === "player" && state.points[i] > 0) {
        allMoves.push(...getLegalMoves(state, i, moves, player));
      }
      if (player === "ai" && state.points[i] < 0) {
        allMoves.push(...getLegalMoves(state, i, moves, player));
      }
    }
    
    return allMoves;
  }, [getLegalMoves]);

  // Apply a move
  const applyMove = useCallback((state: GameState, move: Move, player: Player): GameState => {
    const newState: GameState = {
      points: [...state.points],
      bar: { ...state.bar },
      bearOff: { ...state.bearOff },
    };
    
    // Remove from source
    if (move.from === -1) {
      if (player === "player") newState.bar.player--;
      else newState.bar.ai--;
    } else {
      if (player === "player") newState.points[move.from]--;
      else newState.points[move.from]++;
    }
    
    // Add to destination
    if (move.to === -2 || move.to === 25) {
      // Bear off
      if (player === "player") newState.bearOff.player++;
      else newState.bearOff.ai++;
    } else {
      // Check for hit
      if (player === "player" && newState.points[move.to] === -1) {
        newState.points[move.to] = 0;
        newState.bar.ai++;
      } else if (player === "ai" && newState.points[move.to] === 1) {
        newState.points[move.to] = 0;
        newState.bar.player++;
      }
      
      if (player === "player") newState.points[move.to]++;
      else newState.points[move.to]--;
    }
    
    return newState;
  }, []);

  // Roll dice
  const rollDice = useCallback(() => {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const newDice = [d1, d2];
    const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    
    setDice(newDice);
    setRemainingMoves(moves);
    setGameStatus(currentPlayer === "player" ? "Your turn - select a checker" : "AI's turn");
    
    // Check if any moves are possible
    const allMoves = getAllLegalMoves(gameState, moves, currentPlayer);
    if (allMoves.length === 0) {
      setGameStatus(currentPlayer === "player" ? "No legal moves - AI's turn" : "AI has no moves - Your turn");
      setTimeout(() => {
        setCurrentPlayer(currentPlayer === "player" ? "ai" : "player");
        setDice([]);
        setRemainingMoves([]);
      }, 1000);
    }
  }, [currentPlayer, gameState, getAllLegalMoves]);

  // Handle point click
  const handlePointClick = useCallback((pointIndex: number) => {
    if (currentPlayer !== "player" || remainingMoves.length === 0 || gameOver || isThinking) return;
    
    // Must move from bar first
    if (gameState.bar.player > 0 && pointIndex !== -1) {
      setGameStatus("You must move from the bar first!");
      return;
    }
    
    if (selectedPoint === null) {
      // Select a point
      if (pointIndex === -1 && gameState.bar.player > 0) {
        const moves = getLegalMoves(gameState, -1, remainingMoves, "player");
        if (moves.length > 0) {
          setSelectedPoint(-1);
          setValidMoves(moves.map(m => m.to));
          setGameStatus("Select where to move");
        }
      } else if (gameState.points[pointIndex] > 0) {
        const moves = getLegalMoves(gameState, pointIndex, remainingMoves, "player");
        if (moves.length > 0) {
          setSelectedPoint(pointIndex);
          setValidMoves(moves.map(m => m.to));
          setGameStatus("Select where to move");
        } else {
          setGameStatus("No legal moves from this point");
        }
      }
    } else {
      // Try to move to clicked point
      if (validMoves.includes(pointIndex) || (pointIndex === -2 && validMoves.includes(-2))) {
        const moves = getLegalMoves(gameState, selectedPoint, remainingMoves, "player");
        const move = moves.find(m => m.to === pointIndex);
        
        if (move) {
          const newState = applyMove(gameState, move, "player");
          setGameState(newState);
          
          const newRemaining = [...remainingMoves];
          const idx = newRemaining.indexOf(move.dieValue);
          if (idx > -1) newRemaining.splice(idx, 1);
          setRemainingMoves(newRemaining);
          
          // Check win
          if (newState.bearOff.player === 15) {
            setGameStatus("You win! 🎉");
            setGameOver(true);
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
  }, [currentPlayer, remainingMoves, gameOver, isThinking, gameState, selectedPoint, validMoves, getLegalMoves, applyMove, getAllLegalMoves]);

  // AI turn
  useEffect(() => {
    if (currentPlayer !== "ai" || gameOver || dice.length > 0) return;
    
    setIsThinking(true);
    setGameStatus("AI is rolling...");
    
    setTimeout(() => {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      setDice([d1, d2]);
      const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      setRemainingMoves(moves);
      
      setTimeout(() => {
        let state = gameState;
        let remaining = [...moves];
        
        while (remaining.length > 0) {
          const allMoves = getAllLegalMoves(state, remaining, "ai");
          if (allMoves.length === 0) break;
          
          let chosenMove: Move;
          
          switch (difficulty) {
            case "easy": {
              chosenMove = allMoves[Math.floor(Math.random() * allMoves.length)];
              break;
            }
            case "medium": {
              // Prefer moves towards home
              const sorted = [...allMoves].sort((a, b) => b.to - a.to);
              chosenMove = sorted[0];
              break;
            }
            case "hard": {
              // Prefer hitting blots, then stacking
              const hits = allMoves.filter(m => m.to >= 0 && m.to <= 23 && state.points[m.to] === 1);
              if (hits.length > 0) {
                chosenMove = hits[0];
              } else {
                // Prefer stacking
                const stacks = allMoves.filter(m => m.to >= 0 && m.to <= 23 && state.points[m.to] < -1);
                if (stacks.length > 0) {
                  chosenMove = stacks[Math.floor(Math.random() * stacks.length)];
                } else {
                  const sorted = [...allMoves].sort((a, b) => b.to - a.to);
                  chosenMove = sorted[0];
                }
              }
              break;
            }
            default:
              chosenMove = allMoves[0];
          }
          
          state = applyMove(state, chosenMove, "ai");
          const idx = remaining.indexOf(chosenMove.dieValue);
          if (idx > -1) remaining.splice(idx, 1);
        }
        
        setGameState(state);
        setIsThinking(false);
        setDice([]);
        setRemainingMoves([]);
        
        if (state.bearOff.ai === 15) {
          setGameStatus("You lose!");
          setGameOver(true);
        } else {
          setCurrentPlayer("player");
          setGameStatus("Your turn - roll the dice");
        }
      }, 800);
    }, 500);
  }, [currentPlayer, gameOver, dice, gameState, difficulty, getAllLegalMoves, applyMove]);

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
    setGameStatus("Roll the dice to start");
    setGameOver(false);
    setIsThinking(false);
    setValidMoves([]);
  }, []);

  // Render point (triangle) with premium styling - responsive
  const renderPoint = (index: number, isTop: boolean, isVertical: boolean = false) => {
    const value = gameState.points[index];
    const checkerCount = Math.abs(value);
    const isPlayer = value > 0;
    const isSelected = selectedPoint === index;
    const isValidTarget = validMoves.includes(index);

    // For vertical mobile layout, we need different sizing
    const triangleWidth = isVertical ? 32 : 40;
    const triangleHeight = isVertical ? 80 : 120;
    const mdWidth = isVertical ? 36 : 48;
    const mdHeight = isVertical ? 90 : 144;
    
    return (
      <div
        key={index}
        onClick={() => handlePointClick(index)}
        className={cn(
          "relative flex items-center cursor-pointer transition-all",
          isVertical 
            ? (isTop ? "flex-row pl-0.5" : "flex-row-reverse pr-0.5")
            : (isTop ? "flex-col pt-1" : "flex-col-reverse pb-1")
        )}
      >
        {/* Triangle with textured gold/sand look */}
        <svg
          width={triangleWidth}
          height={triangleHeight}
          viewBox="0 0 40 120"
          className={cn(
            `md:w-[${mdWidth}px] md:h-[${mdHeight}px] transition-all duration-200`,
            isVertical 
              ? (isTop ? "rotate-90" : "-rotate-90")
              : (isTop ? "" : "rotate-180"),
            isValidTarget && "drop-shadow-[0_0_12px_hsl(45_93%_54%_/_0.6)]"
          )}
          style={{
            width: isVertical ? triangleWidth : undefined,
            height: isVertical ? triangleHeight : undefined,
          }}
        >
          <defs>
            {/* Gold triangle gradient with texture */}
            <linearGradient id={`goldTriangle-${index}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="hsl(45 93% 50%)" />
              <stop offset="40%" stopColor="hsl(45 80% 45%)" />
              <stop offset="100%" stopColor="hsl(35 70% 35%)" />
            </linearGradient>
            
            {/* Sand triangle gradient */}
            <linearGradient id={`sandTriangle-${index}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="hsl(35 50% 55%)" />
              <stop offset="40%" stopColor="hsl(35 45% 45%)" />
              <stop offset="100%" stopColor="hsl(30 40% 35%)" />
            </linearGradient>

            {/* Engraved texture pattern */}
            <pattern id={`engravePattern-${index}`} width="4" height="4" patternUnits="userSpaceOnUse">
              <rect width="4" height="4" fill="transparent"/>
              <circle cx="2" cy="2" r="0.5" fill="rgba(0,0,0,0.1)"/>
            </pattern>
          </defs>

          {/* Triangle shadow */}
          <polygon
            points="20,5 3,115 37,115"
            fill="rgba(0,0,0,0.3)"
            transform="translate(1, 2)"
          />

          {/* Main triangle */}
          <polygon
            points="20,5 3,115 37,115"
            fill={index % 2 === 0 ? `url(#goldTriangle-${index})` : `url(#sandTriangle-${index})`}
            stroke={index % 2 === 0 ? "hsl(35 80% 35%)" : "hsl(30 40% 30%)"}
            strokeWidth="1"
          />

          {/* Engraved texture overlay */}
          <polygon
            points="20,5 3,115 37,115"
            fill={`url(#engravePattern-${index})`}
          />

          {/* Inner highlight */}
          <polygon
            points="20,15 10,105 30,105"
            fill="none"
            stroke={index % 2 === 0 ? "hsl(45 93% 65% / 0.3)" : "hsl(35 50% 60% / 0.3)"}
            strokeWidth="1"
          />

          {/* Valid target glow overlay */}
          {isValidTarget && (
            <polygon
              points="20,5 3,115 37,115"
              fill="hsl(45 93% 54% / 0.2)"
              className="animate-pulse"
            />
          )}
        </svg>
        
        {/* Checkers */}
        {checkerCount > 0 && (
          <div className={cn(
            "absolute",
            isVertical 
              ? (isTop ? "left-[70px]" : "right-[70px]")
              : (isTop ? "top-4" : "bottom-4")
          )}>
            <CheckerStack
              count={checkerCount}
              variant={isPlayer ? "gold" : "obsidian"}
              isSelected={isSelected}
              isValidTarget={isValidTarget}
              onClick={() => handlePointClick(index)}
              isTop={isVertical ? true : isTop}
              size={isVertical ? "sm" : "md"}
            />
          </div>
        )}
        
        {/* Point number - hidden on mobile vertical */}
        {!isVertical && (
          <span className={`absolute ${isTop ? "-bottom-4" : "-top-4"} text-xs text-primary/40 font-medium`}>
            {index + 1}
          </span>
        )}
      </div>
    );
  };

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
                Backgammon Training – Temple of Precision
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
                    
                    {/* MOBILE VERTICAL LAYOUT */}
                    {isMobile ? (
                      <div className="flex flex-col">
                        {/* AI Info Bar */}
                        <div className="flex justify-between items-center mb-2 px-2">
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            AI: <span className="text-foreground font-bold">{gameState.bearOff.ai}</span> off
                          </div>
                          {gameState.bar.ai > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Bar:</span>
                              <CheckerStack count={gameState.bar.ai} variant="obsidian" isTop={true} size="sm" />
                            </div>
                          )}
                        </div>

                        {/* Vertical Board */}
                        <div className="flex">
                          {/* Left side - AI's home (points 19-24) and outer (points 7-12) */}
                          <div className="flex-1 flex flex-col gap-1">
                            {/* AI Home Board - Top Left (points 24-19, going down) */}
                            <div className="flex flex-col items-start gap-0">
                              {[23, 22, 21, 20, 19, 18].map(i => renderPoint(i, true, true))}
                            </div>
                          </div>

                          {/* Center bar with dice */}
                          <div className="w-14 md:w-16 bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-lg border border-primary/20 flex flex-col items-center justify-center py-4 mx-1">
                            {dice.length > 0 && (
                              <div className="flex flex-col gap-2 items-center">
                                <Dice3D value={dice[0]} variant={currentPlayer === "player" ? "ivory" : "obsidian"} isRolling={isThinking && currentPlayer === "ai"} size="sm" />
                                <Dice3D value={dice[1]} variant={currentPlayer === "player" ? "ivory" : "obsidian"} isRolling={isThinking && currentPlayer === "ai"} size="sm" />
                              </div>
                            )}
                          </div>

                          {/* Right side - Player's outer (points 13-18) and home (points 1-6) */}
                          <div className="flex-1 flex flex-col gap-1">
                            {/* Player Home Board - Bottom Right (points 6-1, going down) */}
                            <div className="flex flex-col items-end gap-0">
                              {[5, 4, 3, 2, 1, 0].map(i => renderPoint(i, false, true))}
                            </div>
                          </div>
                        </div>

                        {/* Player Info Bar */}
                        <div className="flex justify-between items-center mt-2 px-2">
                          {gameState.bar.player > 0 && (
                            <div 
                              className={cn(
                                "flex items-center gap-2 cursor-pointer transition-all rounded-lg p-1",
                                selectedPoint === -1 && "ring-2 ring-primary bg-primary/10"
                              )}
                              onClick={() => handlePointClick(-1)}
                            >
                              <span className="text-xs text-muted-foreground">Bar:</span>
                              <CheckerStack 
                                count={gameState.bar.player} 
                                variant="gold" 
                                isSelected={selectedPoint === -1}
                                onClick={() => handlePointClick(-1)}
                                isTop={false} 
                                size="sm"
                              />
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground ml-auto flex items-center gap-2">
                            You: <span className="text-primary font-bold">{gameState.bearOff.player}</span> off
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* DESKTOP HORIZONTAL LAYOUT */
                      <>
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

                        {/* Top points (13-24, right to left) */}
                        <div className="flex justify-center gap-0.5 mb-1">
                          <div className="flex gap-0.5">
                            {[12, 13, 14, 15, 16, 17].map(i => renderPoint(i, true))}
                          </div>
                          <div className="w-6 md:w-8 bg-gradient-to-b from-primary/20 to-primary/10 rounded border border-primary/20" />
                          <div className="flex gap-0.5">
                            {[18, 19, 20, 21, 22, 23].map(i => renderPoint(i, true))}
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

                        {/* Bottom points (1-12, left to right visually) */}
                        <div className="flex justify-center gap-0.5 mt-1">
                          <div className="flex gap-0.5">
                            {[11, 10, 9, 8, 7, 6].map(i => renderPoint(i, false))}
                          </div>
                          <div className="w-6 md:w-8 bg-gradient-to-t from-primary/20 to-primary/10 rounded border border-primary/20" />
                          <div className="flex gap-0.5">
                            {[5, 4, 3, 2, 1, 0].map(i => renderPoint(i, false))}
                          </div>
                        </div>

                        {/* Player Bar / Bear Off */}
                        <div className="flex justify-between items-center mt-3 px-2">
                          {gameState.bar.player > 0 && (
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
                          )}
                          <div className="text-xs text-muted-foreground ml-auto flex items-center gap-2">
                            You Borne Off: <span className="text-primary font-bold">{gameState.bearOff.player}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Bar - repositioned for mobile thumb access */}
              <div 
                className={`relative overflow-hidden rounded-lg border transition-all duration-300 ${
                  gameOver 
                    ? gameStatus.includes("win") 
                      ? "bg-green-500/10 border-green-500/30" 
                      : "bg-red-500/10 border-red-500/30"
                    : "bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-primary/30"
                }`}
              >
                {/* Decorative corner accents */}
                <div className="absolute top-1 left-1 w-3 h-3 border-l border-t border-primary/40 rounded-tl" />
                <div className="absolute top-1 right-1 w-3 h-3 border-r border-t border-primary/40 rounded-tr" />
                <div className="absolute bottom-1 left-1 w-3 h-3 border-l border-b border-primary/40 rounded-bl" />
                <div className="absolute bottom-1 right-1 w-3 h-3 border-r border-b border-primary/40 rounded-br" />
                
                <div className="px-4 md:px-6 py-3 md:py-4 text-center">
                  <p 
                    className={`font-display font-bold text-base md:text-lg ${
                      gameOver 
                        ? gameStatus.includes("win") 
                          ? "text-green-400" 
                          : "text-red-400"
                        : isThinking
                        ? "text-muted-foreground"
                        : "text-primary"
                    }`}
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
                    <p className="text-xs md:text-sm mt-1 text-muted-foreground">
                      Moves left: {remainingMoves.join(", ")}
                    </p>
                  )}
                </div>
              </div>

              {/* Controls - larger buttons for mobile thumb access */}
              <div className="flex flex-col gap-2">
                {/* Roll Button */}
                {currentPlayer === "player" && dice.length === 0 && !gameOver && (
                  <Button variant="gold" size="lg" className="w-full py-4 text-base" onClick={rollDice}>
                    🎲 Roll Dice
                  </Button>
                )}

                {/* Bear off button */}
                {canBearOff(gameState, "player") && validMoves.includes(-2) && (
                  <Button variant="outline" className="w-full py-4 border-primary/30 text-primary hover:bg-primary/10" onClick={() => handlePointClick(-2)}>
                    Bear Off Selected Checker
                  </Button>
                )}

                {/* Mobile: Quick actions row */}
                {isMobile && (
                  <div className="flex gap-2">
                    <Button onClick={restartGame} className="flex-1" variant="gold" size="sm">
                      <RotateCcw size={16} />
                      Restart
                    </Button>
                    <Button asChild variant="ghost" size="sm" className="flex-1 text-muted-foreground hover:text-primary border border-primary/20">
                      <Link to="/play-ai">
                        Change Difficulty
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Side Panel - Desktop only */}
            {!isMobile && (
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
                    <span className="text-muted-foreground">Your checkers</span>
                    <span className="text-primary font-medium">{15 - gameState.bearOff.player} remaining</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">AI checkers</span>
                    <span className="text-foreground font-medium">{15 - gameState.bearOff.ai} remaining</span>
                  </div>
                </div>
              </div>

              {/* How to Play */}
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
                
                <p className="text-xs text-primary/60 uppercase tracking-wider mb-3 font-medium">How to Play</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• Roll dice and move your checkers</p>
                  <p>• Move from high points to low</p>
                  <p>• Land on opponent's single checker to hit</p>
                  <p>• Get all checkers to points 1-6 to bear off</p>
                  <p>• First to bear off all 15 wins!</p>
                </div>
              </div>

              {/* Actions */}
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
                
                <p className="text-xs text-primary/60 uppercase tracking-wider mb-3 font-medium">Actions</p>
                <div className="space-y-2">
                  <Button onClick={restartGame} className="w-full" variant="gold" size="sm">
                    <RotateCcw size={16} />
                    Restart Game
                  </Button>

                  <Button asChild variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-primary">
                    <Link to="/play-ai">
                      Change Difficulty
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .clip-triangle {
          clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
        }
      `}</style>
    </div>
  );
};

export default BackgammonAI;
