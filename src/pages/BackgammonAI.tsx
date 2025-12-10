import { useState, useCallback, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, RotateCcw, Bot, Crown, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";

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

const DiceIcon = ({ value }: { value: number }) => {
  const icons = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
  const Icon = icons[value - 1] || Dice1;
  return <Icon size={32} className="text-gold" />;
};

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

  // Render point (triangle)
  const renderPoint = (index: number, isTop: boolean) => {
    const value = gameState.points[index];
    const checkerCount = Math.abs(value);
    const isPlayer = value > 0;
    const isSelected = selectedPoint === index;
    const isValidTarget = validMoves.includes(index);
    
    return (
      <div
        key={index}
        onClick={() => handlePointClick(index)}
        className={`
          relative flex flex-col items-center cursor-pointer transition-all
          ${isTop ? "pt-1" : "pb-1 flex-col-reverse"}
          ${isSelected ? "ring-2 ring-gold rounded" : ""}
          ${isValidTarget ? "ring-2 ring-green-400 rounded bg-green-400/10" : ""}
        `}
      >
        {/* Triangle */}
        <div
          className={`
            w-8 md:w-10 h-24 md:h-32 clip-triangle
            ${index % 2 === 0 ? "bg-gold/60" : "bg-sand/40"}
            ${isTop ? "" : "rotate-180"}
          `}
        />
        
        {/* Checkers */}
        <div className={`absolute ${isTop ? "top-2" : "bottom-2"} flex flex-col gap-0.5 items-center`}>
          {Array.from({ length: Math.min(checkerCount, 5) }).map((_, i) => (
            <div
              key={i}
              className={`
                w-6 md:w-8 h-5 md:h-6 rounded-full border-2 shadow-md
                ${isPlayer 
                  ? "bg-gradient-to-b from-amber-200 to-amber-400 border-amber-500" 
                  : "bg-gradient-to-b from-gray-700 to-gray-900 border-gray-600"
                }
              `}
            >
              {i === Math.min(checkerCount, 5) - 1 && checkerCount > 5 && (
                <span className="text-xs font-bold text-center block">{checkerCount}</span>
              )}
            </div>
          ))}
        </div>
        
        {/* Point number */}
        <span className={`absolute ${isTop ? "bottom-0" : "top-0"} text-xs text-muted-foreground`}>
          {index + 1}
        </span>
      </div>
    );
  };

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
                  Backgammon vs AI <span className="text-gold">(Free Practice)</span>
                </h1>
                <p className="text-sm text-muted-foreground">
                  Roll, move, and bear off · No wallet · No money
                </p>
              </div>
            </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Board Area */}
          <div className="lg:col-span-3 space-y-4">
            {/* Board */}
            <Card className="border-gold/20 bg-card/80 overflow-hidden">
              <CardContent className="p-4">
                <div className="bg-gradient-to-b from-amber-900/40 to-amber-950/60 rounded-lg p-3 border border-gold/30">
                  {/* AI Bear Off / Bar */}
                  <div className="flex justify-between items-center mb-2 px-2">
                    <div className="text-xs text-muted-foreground">
                      AI Borne Off: <span className="text-gold font-bold">{gameState.bearOff.ai}</span>
                    </div>
                    {gameState.bar.ai > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">AI Bar:</span>
                        <div className="w-6 h-5 rounded-full bg-gradient-to-b from-gray-700 to-gray-900 border-2 border-gray-600 flex items-center justify-center">
                          <span className="text-xs font-bold text-white">{gameState.bar.ai}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Top points (13-24, right to left) */}
                  <div className="flex justify-center gap-0.5 mb-1">
                    <div className="flex gap-0.5">
                      {[12, 13, 14, 15, 16, 17].map(i => renderPoint(i, true))}
                    </div>
                    <div className="w-6 md:w-8 bg-amber-900/60 rounded" />
                    <div className="flex gap-0.5">
                      {[18, 19, 20, 21, 22, 23].map(i => renderPoint(i, true))}
                    </div>
                  </div>

                  {/* Middle bar */}
                  <div className="h-4 bg-amber-800/40 my-1 rounded flex items-center justify-center">
                    {dice.length > 0 && (
                      <div className="flex gap-2">
                        <DiceIcon value={dice[0]} />
                        <DiceIcon value={dice[1]} />
                      </div>
                    )}
                  </div>

                  {/* Bottom points (1-12, left to right visually) */}
                  <div className="flex justify-center gap-0.5 mt-1">
                    <div className="flex gap-0.5">
                      {[11, 10, 9, 8, 7, 6].map(i => renderPoint(i, false))}
                    </div>
                    <div className="w-6 md:w-8 bg-amber-900/60 rounded" />
                    <div className="flex gap-0.5">
                      {[5, 4, 3, 2, 1, 0].map(i => renderPoint(i, false))}
                    </div>
                  </div>

                  {/* Player Bar / Bear Off */}
                  <div className="flex justify-between items-center mt-2 px-2">
                    {gameState.bar.player > 0 && (
                      <div 
                        className={`flex items-center gap-1 cursor-pointer ${selectedPoint === -1 ? "ring-2 ring-gold rounded p-1" : ""}`}
                        onClick={() => handlePointClick(-1)}
                      >
                        <span className="text-xs text-muted-foreground">Your Bar:</span>
                        <div className="w-6 h-5 rounded-full bg-gradient-to-b from-amber-200 to-amber-400 border-2 border-amber-500 flex items-center justify-center">
                          <span className="text-xs font-bold text-amber-900">{gameState.bar.player}</span>
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground ml-auto">
                      You Borne Off: <span className="text-gold font-bold">{gameState.bearOff.player}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Status & Controls */}
            <div className={`text-center p-4 rounded-lg border ${
              gameOver
                ? gameStatus.includes("win")
                  ? "bg-green-500/10 border-green-500/30 text-green-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
                : isThinking
                ? "bg-muted/50 border-border text-muted-foreground"
                : "bg-gold/10 border-gold/30 text-gold"
            }`}>
              <p className="font-medium">{gameStatus}</p>
              {remainingMoves.length > 0 && currentPlayer === "player" && (
                <p className="text-sm mt-1 text-muted-foreground">
                  Moves left: {remainingMoves.join(", ")}
                </p>
              )}
            </div>

            {/* Roll Button */}
            {currentPlayer === "player" && dice.length === 0 && !gameOver && (
              <Button variant="gold" size="lg" className="w-full" onClick={rollDice}>
                🎲 Roll Dice
              </Button>
            )}

            {/* Bear off button */}
            {canBearOff(gameState, "player") && validMoves.includes(-2) && (
              <Button variant="outline" className="w-full" onClick={() => handlePointClick(-2)}>
                Bear Off Selected Checker
              </Button>
            )}
          </div>

          {/* Side Panel */}
          <div className="space-y-4">
            <Card className="border-gold/20 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-display">Game Info</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <div className="flex justify-between">
                  <span>Your checkers:</span>
                  <span className="text-foreground font-medium">
                    {15 - gameState.bearOff.player} remaining
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>AI checkers:</span>
                  <span className="text-foreground font-medium">
                    {15 - gameState.bearOff.ai} remaining
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Difficulty:</span>
                  <span className="text-gold font-medium">{difficultyLabel}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gold/20 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-display">How to Play</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <p>• Roll dice and move your checkers</p>
                <p>• Move from high points to low</p>
                <p>• Land on opponent's single checker to hit</p>
                <p>• Get all checkers to points 1-6 to bear off</p>
                <p>• First to bear off all 15 wins!</p>
              </CardContent>
            </Card>

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

      <style>{`
        .clip-triangle {
          clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
        }
      `}</style>
    </div>
  );
};

export default BackgammonAI;
