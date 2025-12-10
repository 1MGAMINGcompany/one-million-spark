import { useState, useCallback, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Gem, Star } from "lucide-react";
import DominoTile3D, { DominoTileBack } from "@/components/DominoTile3D";

type Difficulty = "easy" | "medium" | "hard";

interface Domino {
  id: number;
  left: number;
  right: number;
}

interface PlacedDomino extends Domino {
  flipped: boolean;
}

// Generate a standard set of dominos (double-six)
const generateDominoSet = (): Domino[] => {
  const dominos: Domino[] = [];
  let id = 0;
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      dominos.push({ id: id++, left: i, right: j });
    }
  }
  return dominos;
};

// Shuffle array
const shuffle = <T,>(array: T[]): T[] => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const DominosAI = () => {
  const [searchParams] = useSearchParams();
  const rawDifficulty = searchParams.get("difficulty");
  const difficulty: Difficulty =
    rawDifficulty === "easy" || rawDifficulty === "medium" || rawDifficulty === "hard"
      ? rawDifficulty
      : "easy";

  const [chain, setChain] = useState<PlacedDomino[]>([]);
  const [playerHand, setPlayerHand] = useState<Domino[]>([]);
  const [aiHand, setAiHand] = useState<Domino[]>([]);
  const [boneyard, setBoneyard] = useState<Domino[]>([]);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [gameStatus, setGameStatus] = useState("Your turn");
  const [gameOver, setGameOver] = useState(false);
  const [selectedDomino, setSelectedDomino] = useState<number | null>(null);
  const [isThinking, setIsThinking] = useState(false);

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
      case "medium": return "Greedy strategy";
      case "hard": return "Advanced tactics";
    }
  }, [difficulty]);

  // Initialize game
  const initGame = useCallback(() => {
    const allDominos = shuffle(generateDominoSet());
    setPlayerHand(allDominos.slice(0, 7));
    setAiHand(allDominos.slice(7, 14));
    setBoneyard(allDominos.slice(14));
    setChain([]);
    setIsPlayerTurn(true);
    setGameStatus("Your turn - play any tile to start");
    setGameOver(false);
    setSelectedDomino(null);
    setIsThinking(false);
  }, []);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // Get chain ends
  const getChainEnds = useCallback((): { left: number; right: number } | null => {
    if (chain.length === 0) return null;
    const first = chain[0];
    const last = chain[chain.length - 1];
    return {
      left: first.flipped ? first.right : first.left,
      right: last.flipped ? last.left : last.right,
    };
  }, [chain]);

  // Check if a domino can be played
  const canPlay = useCallback((domino: Domino): { canPlayLeft: boolean; canPlayRight: boolean } => {
    const ends = getChainEnds();
    if (!ends) return { canPlayLeft: true, canPlayRight: true };
    
    const canPlayLeft = domino.left === ends.left || domino.right === ends.left;
    const canPlayRight = domino.left === ends.right || domino.right === ends.right;
    
    return { canPlayLeft, canPlayRight };
  }, [getChainEnds]);

  // Get legal moves for a hand
  const getLegalMoves = useCallback((hand: Domino[]): Domino[] => {
    return hand.filter(d => {
      const { canPlayLeft, canPlayRight } = canPlay(d);
      return canPlayLeft || canPlayRight;
    });
  }, [canPlay]);

  // Check for game over
  const checkGameOver = useCallback((pHand: Domino[], aHand: Domino[], bone: Domino[]) => {
    if (pHand.length === 0) {
      setGameStatus("You win! 🎉");
      setGameOver(true);
      return true;
    }
    if (aHand.length === 0) {
      setGameStatus("You lose!");
      setGameOver(true);
      return true;
    }
    
    // Check for blocked game
    const playerCanPlay = pHand.some(d => {
      const { canPlayLeft, canPlayRight } = canPlay(d);
      return canPlayLeft || canPlayRight;
    });
    const aiCanPlay = aHand.some(d => {
      const { canPlayLeft, canPlayRight } = canPlay(d);
      return canPlayLeft || canPlayRight;
    });
    
    if (!playerCanPlay && !aiCanPlay && bone.length === 0) {
      // Count pips
      const playerPips = pHand.reduce((sum, d) => sum + d.left + d.right, 0);
      const aiPips = aHand.reduce((sum, d) => sum + d.left + d.right, 0);
      
      if (playerPips < aiPips) {
        setGameStatus("Game blocked - You win! (fewer pips)");
      } else if (aiPips < playerPips) {
        setGameStatus("Game blocked - You lose! (more pips)");
      } else {
        setGameStatus("Game blocked - Draw!");
      }
      setGameOver(true);
      return true;
    }
    
    return false;
  }, [canPlay]);

  // Play a domino
  const playDomino = useCallback((domino: Domino, side: "left" | "right", isPlayer: boolean) => {
    const ends = getChainEnds();
    let flipped = false;
    
    if (ends) {
      const targetEnd = side === "left" ? ends.left : ends.right;
      if (side === "left") {
        flipped = domino.right !== targetEnd;
      } else {
        flipped = domino.left !== targetEnd;
      }
    }
    
    const placedDomino: PlacedDomino = { ...domino, flipped };
    
    setChain(prev => 
      side === "left" ? [placedDomino, ...prev] : [...prev, placedDomino]
    );
    
    if (isPlayer) {
      setPlayerHand(prev => prev.filter(d => d.id !== domino.id));
    } else {
      setAiHand(prev => prev.filter(d => d.id !== domino.id));
    }
  }, [getChainEnds]);

  // Player plays a domino
  const handlePlayerPlay = useCallback((domino: Domino) => {
    if (!isPlayerTurn || gameOver || isThinking) return;
    
    const { canPlayLeft, canPlayRight } = canPlay(domino);
    
    if (!canPlayLeft && !canPlayRight) {
      setGameStatus("That tile doesn't match!");
      return;
    }
    
    // If first tile or only one option, play automatically
    if (chain.length === 0 || (canPlayLeft && !canPlayRight)) {
      playDomino(domino, "left", true);
    } else if (canPlayRight && !canPlayLeft) {
      playDomino(domino, "right", true);
    } else {
      // Both ends match - use selected side or default to right
      if (selectedDomino === domino.id) {
        // Toggle or just play right
        playDomino(domino, "right", true);
        setSelectedDomino(null);
      } else {
        setSelectedDomino(domino.id);
        setGameStatus("Click again to play on right, or click another tile");
        return;
      }
    }
    
    setSelectedDomino(null);
    setIsPlayerTurn(false);
  }, [isPlayerTurn, gameOver, isThinking, canPlay, chain.length, playDomino, selectedDomino]);

  // Player draws from boneyard
  const handleDraw = useCallback(() => {
    if (!isPlayerTurn || gameOver || boneyard.length === 0) return;
    
    const drawn = boneyard[0];
    setPlayerHand(prev => [...prev, drawn]);
    setBoneyard(prev => prev.slice(1));
    setGameStatus("Drew a tile - your turn");
  }, [isPlayerTurn, gameOver, boneyard]);

  // Player passes
  const handlePass = useCallback(() => {
    if (!isPlayerTurn || gameOver) return;
    setIsPlayerTurn(false);
  }, [isPlayerTurn, gameOver]);

  // AI turn
  useEffect(() => {
    if (isPlayerTurn || gameOver) return;
    
    setIsThinking(true);
    setGameStatus("AI is thinking...");
    
    const timeout = setTimeout(() => {
      const legalMoves = getLegalMoves(aiHand);
      
      if (legalMoves.length === 0) {
        // AI must draw or pass
        if (boneyard.length > 0) {
          const drawn = boneyard[0];
          setAiHand(prev => [...prev, drawn]);
          setBoneyard(prev => prev.slice(1));
          setGameStatus("AI drew a tile");
          // Check if AI can now play
          setTimeout(() => {
            setIsThinking(false);
            // Re-trigger AI turn after drawing
          }, 300);
          return;
        } else {
          // AI passes
          setGameStatus("AI passes");
          setIsPlayerTurn(true);
          setIsThinking(false);
          checkGameOver(playerHand, aiHand, boneyard);
          return;
        }
      }
      
      // Choose move based on difficulty
      let chosenDomino: Domino;
      
      switch (difficulty) {
        case "easy": {
          // Random legal move
          chosenDomino = legalMoves[Math.floor(Math.random() * legalMoves.length)];
          break;
        }
        case "medium": {
          // Prefer doubles and higher pip counts (greedy)
          const sorted = [...legalMoves].sort((a, b) => {
            const aIsDouble = a.left === a.right;
            const bIsDouble = b.left === b.right;
            if (aIsDouble && !bIsDouble) return -1;
            if (!aIsDouble && bIsDouble) return 1;
            return (b.left + b.right) - (a.left + a.right);
          });
          chosenDomino = sorted[0];
          break;
        }
        case "hard": {
          // Prefer moves that use numbers the player might not have
          // Simple heuristic: play tiles that match chain ends with rare numbers
          const ends = getChainEnds();
          if (ends) {
            // Count occurrences of each number in AI's remaining hand
            const aiNumbers = new Map<number, number>();
            aiHand.forEach(d => {
              aiNumbers.set(d.left, (aiNumbers.get(d.left) || 0) + 1);
              aiNumbers.set(d.right, (aiNumbers.get(d.right) || 0) + 1);
            });
            
            // Score each legal move
            const scored = legalMoves.map(d => {
              const { canPlayLeft, canPlayRight } = canPlay(d);
              let score = d.left + d.right; // Base score: pip count
              
              // Bonus for doubles
              if (d.left === d.right) score += 5;
              
              // Prefer playing numbers we have many of
              score += (aiNumbers.get(d.left) || 0) * 2;
              score += (aiNumbers.get(d.right) || 0) * 2;
              
              return { domino: d, score, canPlayLeft, canPlayRight };
            });
            
            scored.sort((a, b) => b.score - a.score);
            chosenDomino = scored[0].domino;
          } else {
            chosenDomino = legalMoves[0];
          }
          break;
        }
        default:
          chosenDomino = legalMoves[0];
      }
      
      // Determine which side to play on
      const { canPlayLeft, canPlayRight } = canPlay(chosenDomino);
      const side = canPlayLeft && !canPlayRight ? "left" : "right";
      
      playDomino(chosenDomino, side, false);
      setIsThinking(false);
      
      // Check game over after AI move
      const newAiHand = aiHand.filter(d => d.id !== chosenDomino.id);
      if (!checkGameOver(playerHand, newAiHand, boneyard)) {
        setIsPlayerTurn(true);
        setGameStatus("Your turn");
      }
    }, 800);
    
    return () => clearTimeout(timeout);
  }, [isPlayerTurn, gameOver, aiHand, boneyard, difficulty, getLegalMoves, canPlay, playDomino, checkGameOver, playerHand, getChainEnds]);

  // Check player legal moves
  const playerLegalMoves = useMemo(() => getLegalMoves(playerHand), [getLegalMoves, playerHand]);
  const canPlayerPlay = playerLegalMoves.length > 0;

  // Render a domino tile (desktop)
  const renderDomino = (domino: Domino, isClickable: boolean, isSelected: boolean, flipped?: boolean) => {
    const left = flipped ? domino.right : domino.left;
    const right = flipped ? domino.left : domino.right;
    const isLegal = playerLegalMoves.some(d => d.id === domino.id);
    
    return (
      <DominoTile3D
        key={domino.id}
        left={left}
        right={right}
        isClickable={isClickable}
        isSelected={isSelected}
        isPlayable={isLegal}
        isAITurn={isThinking}
        onClick={() => isClickable && handlePlayerPlay(domino)}
      />
    );
  };

  // Render a domino tile (mobile - smaller size)
  const renderDominoMobile = (domino: Domino, isClickable: boolean, isSelected: boolean, flipped?: boolean) => {
    const left = flipped ? domino.right : domino.left;
    const right = flipped ? domino.left : domino.right;
    const isLegal = playerLegalMoves.some(d => d.id === domino.id);
    
    return (
      <DominoTile3D
        key={domino.id}
        left={left}
        right={right}
        isClickable={isClickable}
        isSelected={isSelected}
        isPlayable={isLegal}
        isAITurn={isThinking}
        size="mobile"
        onClick={() => isClickable && handlePlayerPlay(domino)}
      />
    );
  };

  // Render chain domino (horizontal)
  const renderChainDomino = (placed: PlacedDomino, index: number) => {
    const left = placed.flipped ? placed.right : placed.left;
    const right = placed.flipped ? placed.left : placed.right;
    
    return (
      <DominoTile3D
        key={`chain-${placed.id}-${index}`}
        left={left}
        right={right}
        isChainTile
      />
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
                Dominos Training – Temple of Tactics
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
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Game Area */}
            <div className="lg:col-span-3 space-y-4">
              {/* AI Hand (face down) */}
              <div className="relative p-4 rounded-xl bg-gradient-to-br from-midnight-light via-card to-background border border-primary/20">
                {/* AI thinking indicator */}
                {isThinking && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1 rounded-full bg-background border border-primary/40 shadow-[0_0_15px_-3px_hsl(45_93%_54%_/_0.5)]">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_2px_hsl(45_93%_54%_/_0.6)]" />
                    <span className="text-xs text-primary font-medium">AI Thinking...</span>
                  </div>
                )}
                
                <div className="absolute top-2 right-2">
                  <div 
                    className="w-3 h-3 opacity-40"
                    style={{
                      background: "linear-gradient(to top, hsl(45 93% 54%) 0%, hsl(45 90% 65%) 100%)",
                      clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                    }}
                  />
                </div>
                <p className="text-xs text-primary/60 uppercase tracking-wider mb-3 font-medium">AI's Hand ({aiHand.length} tiles)</p>
                <div className="flex flex-wrap gap-3 justify-center">
                  {aiHand.map((_, i) => (
                    <DominoTileBack key={i} isThinking={isThinking} />
                  ))}
                </div>
              </div>

              {/* Table / Chain Container with gold frame */}
              <div className="relative">
                {/* Outer glow */}
                <div className="absolute -inset-2 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-xl opacity-50" />
                
                {/* Gold frame */}
                <div className="relative p-1 rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-primary/40 shadow-[0_0_40px_-10px_hsl(45_93%_54%_/_0.4)]">
                  <div className="bg-gradient-to-br from-midnight-light via-background to-background rounded-lg p-6 min-h-[140px]">
                    <p className="text-xs text-primary/60 uppercase tracking-wider mb-4 font-medium text-center">Game Table</p>
                    {chain.length === 0 ? (
                      <p className="text-muted-foreground/60 text-center py-6">
                        Play any tile to start the game
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 justify-center items-center">
                        {chain.map((placed, i) => renderChainDomino(placed, i))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Bar */}
              <div 
                className={`relative overflow-hidden rounded-lg border transition-all duration-300 ${
                  gameOver 
                    ? gameStatus.includes("win") 
                      ? "bg-green-500/10 border-green-500/30" 
                      : gameStatus.includes("lose")
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-primary/10 border-primary/30"
                    : "bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-primary/30"
                }`}
              >
                {/* Decorative corner accents */}
                <div className="absolute top-1 left-1 w-3 h-3 border-l border-t border-primary/40 rounded-tl" />
                <div className="absolute top-1 right-1 w-3 h-3 border-r border-t border-primary/40 rounded-tr" />
                <div className="absolute bottom-1 left-1 w-3 h-3 border-l border-b border-primary/40 rounded-bl" />
                <div className="absolute bottom-1 right-1 w-3 h-3 border-r border-b border-primary/40 rounded-br" />
                
                <div className="px-6 py-4 text-center">
                  <p 
                    className={`font-display font-bold text-lg ${
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
                    } : undefined}
                  >
                    {gameStatus}
                  </p>
                </div>
              </div>

              {/* Player Hand */}
              <div className="relative p-4 md:p-4 rounded-xl bg-gradient-to-br from-midnight-light via-card to-background border border-primary/20">
                <div className="absolute top-2 right-2">
                  <div 
                    className="w-3 h-3 opacity-40"
                    style={{
                      background: "linear-gradient(to top, hsl(45 93% 54%) 0%, hsl(45 90% 65%) 100%)",
                      clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
                    }}
                  />
                </div>
                <p className="text-xs text-primary/60 uppercase tracking-wider mb-2 md:mb-3 font-medium">Your Hand ({playerHand.length} tiles)</p>
                
                {/* Desktop: single row flex */}
                <div className="hidden md:flex flex-wrap gap-2 justify-center">
                  {playerHand.map(d => 
                    renderDomino(d, isPlayerTurn && !gameOver && !isThinking, selectedDomino === d.id)
                  )}
                </div>
                
                {/* Mobile: 2-row grid layout with smaller tiles */}
                <div className="md:hidden">
                  {(() => {
                    const midpoint = Math.ceil(playerHand.length / 2);
                    const row1 = playerHand.slice(0, midpoint);
                    const row2 = playerHand.slice(midpoint);
                    return (
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="flex flex-wrap gap-1.5 justify-center">
                          {row1.map(d => 
                            renderDominoMobile(d, isPlayerTurn && !gameOver && !isThinking, selectedDomino === d.id)
                          )}
                        </div>
                        {row2.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 justify-center">
                            {row2.map(d => 
                              renderDominoMobile(d, isPlayerTurn && !gameOver && !isThinking, selectedDomino === d.id)
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                
                {/* Draw/Pass buttons */}
                {isPlayerTurn && !gameOver && !canPlayerPlay && (
                  <div className="flex gap-3 justify-center mt-3 md:mt-4">
                    {boneyard.length > 0 ? (
                      <Button variant="gold" size="sm" onClick={handleDraw}>
                        Draw from Boneyard ({boneyard.length})
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={handlePass} className="border-primary/30 text-primary hover:bg-primary/10">
                        Pass (no moves)
                      </Button>
                    )}
                  </div>
                )}
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
                    <span className="text-muted-foreground">Your tiles</span>
                    <span className="text-primary font-medium">{playerHand.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">AI tiles</span>
                    <span className="text-foreground font-medium">{aiHand.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Boneyard</span>
                    <span className="text-foreground font-medium">{boneyard.length}</span>
                  </div>
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
                  <Button onClick={initGame} className="w-full" variant="gold" size="sm">
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default DominosAI;
