import { useState, useCallback, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, RotateCcw, Bot, Crown } from "lucide-react";

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

  // Render a domino tile
  const renderDomino = (domino: Domino, isClickable: boolean, isSelected: boolean, flipped?: boolean) => {
    const left = flipped ? domino.right : domino.left;
    const right = flipped ? domino.left : domino.right;
    const isLegal = playerLegalMoves.some(d => d.id === domino.id);
    
    return (
      <button
        key={domino.id}
        onClick={() => isClickable && handlePlayerPlay(domino)}
        disabled={!isClickable}
        className={`
          relative flex items-center gap-0.5 px-2 py-3 rounded-lg border-2 transition-all duration-200
          ${isSelected ? "border-gold ring-2 ring-gold/50 scale-105" : "border-gold/30"}
          ${isClickable && isLegal ? "hover:border-gold hover:scale-105 cursor-pointer" : ""}
          ${isClickable && !isLegal ? "opacity-50 cursor-not-allowed" : ""}
          ${!isClickable ? "cursor-default" : ""}
          bg-gradient-to-b from-sand/20 to-background
        `}
      >
        <span className="text-lg font-bold text-gold w-5 text-center">{left}</span>
        <span className="w-px h-6 bg-gold/40" />
        <span className="text-lg font-bold text-gold w-5 text-center">{right}</span>
      </button>
    );
  };

  // Render chain domino (horizontal)
  const renderChainDomino = (placed: PlacedDomino, index: number) => {
    const left = placed.flipped ? placed.right : placed.left;
    const right = placed.flipped ? placed.left : placed.right;
    
    return (
      <div
        key={`chain-${placed.id}-${index}`}
        className="flex items-center gap-0.5 px-1.5 py-2 rounded border border-gold/40 bg-gradient-to-b from-sand/30 to-card"
      >
        <span className="text-sm font-bold text-gold w-4 text-center">{left}</span>
        <span className="w-px h-4 bg-gold/40" />
        <span className="text-sm font-bold text-gold w-4 text-center">{right}</span>
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
                  Dominos vs AI <span className="text-gold">(Free Practice)</span>
                </h1>
                <p className="text-sm text-muted-foreground">
                  No wallet needed · No money · Just practice
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
          {/* Game Area */}
          <div className="lg:col-span-3 space-y-4">
            {/* AI Hand (face down) */}
            <Card className="border-gold/20 bg-card/80">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-display flex items-center gap-2">
                  <Bot size={16} className="text-gold" />
                  AI's Hand ({aiHand.length} tiles)
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex flex-wrap gap-2">
                  {aiHand.map((_, i) => (
                    <div
                      key={i}
                      className="w-12 h-8 rounded border border-gold/30 bg-gradient-to-b from-primary/20 to-card flex items-center justify-center"
                    >
                      <span className="text-gold/50 text-xs">?</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Chain / Table */}
            <Card className="border-gold/20 bg-card/80 min-h-[120px]">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-display">Table</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                {chain.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    Play any tile to start the game
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1 justify-center items-center">
                    {chain.map((placed, i) => renderChainDomino(placed, i))}
                  </div>
                )}
              </CardContent>
            </Card>

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
              <p className="font-medium">{gameStatus}</p>
            </div>

            {/* Player Hand */}
            <Card className="border-gold/20 bg-card/80">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-display">Your Hand ({playerHand.length} tiles)</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex flex-wrap gap-2 justify-center">
                  {playerHand.map(d => 
                    renderDomino(d, isPlayerTurn && !gameOver && !isThinking, selectedDomino === d.id)
                  )}
                </div>
                
                {/* Draw/Pass buttons */}
                {isPlayerTurn && !gameOver && !canPlayerPlay && (
                  <div className="flex gap-3 justify-center mt-4">
                    {boneyard.length > 0 ? (
                      <Button variant="gold" size="sm" onClick={handleDraw}>
                        Draw from Boneyard ({boneyard.length})
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={handlePass}>
                        Pass (no moves)
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Side Panel */}
          <div className="space-y-4">
            <Card className="border-gold/20 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-display">Game Info</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <div className="flex justify-between">
                  <span>Your tiles:</span>
                  <span className="text-foreground font-medium">{playerHand.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>AI tiles:</span>
                  <span className="text-foreground font-medium">{aiHand.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Boneyard:</span>
                  <span className="text-foreground font-medium">{boneyard.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Difficulty:</span>
                  <span className="text-gold font-medium">{difficultyLabel}</span>
                </div>
              </CardContent>
            </Card>

            <Button onClick={initGame} className="w-full" variant="outline">
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

export default DominosAI;
