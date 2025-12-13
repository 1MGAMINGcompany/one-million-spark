import { useState, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Trophy, Gem, Star, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";

type Difficulty = "easy" | "medium" | "hard";
type PlayerColor = "gold" | "ruby" | "emerald" | "sapphire";

interface Token {
  position: number; // -1 = home, 0-56 = on board, 57 = finished
  color: PlayerColor;
  id: number;
}

interface Player {
  color: PlayerColor;
  tokens: Token[];
  isAI: boolean;
  startPosition: number;
  finishStart: number;
}

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

const PLAYER_COLORS: Record<PlayerColor, { bg: string; border: string; shadow: string }> = {
  gold: {
    bg: "bg-gradient-to-br from-yellow-300 via-yellow-500 to-yellow-700",
    border: "border-yellow-200",
    shadow: "shadow-[0_0_15px_-3px_hsl(45_93%_54%_/_0.6)]",
  },
  ruby: {
    bg: "bg-gradient-to-br from-red-400 via-red-600 to-red-800",
    border: "border-red-300",
    shadow: "shadow-[0_0_15px_-3px_hsl(350_70%_50%_/_0.6)]",
  },
  emerald: {
    bg: "bg-gradient-to-br from-green-400 via-green-600 to-green-800",
    border: "border-green-300",
    shadow: "shadow-[0_0_15px_-3px_hsl(145_60%_45%_/_0.6)]",
  },
  sapphire: {
    bg: "bg-gradient-to-br from-blue-400 via-blue-600 to-blue-800",
    border: "border-blue-300",
    shadow: "shadow-[0_0_15px_-3px_hsl(210_70%_50%_/_0.6)]",
  },
};

const initializePlayers = (): Player[] => [
  {
    color: "gold",
    tokens: [
      { position: -1, color: "gold", id: 0 },
      { position: -1, color: "gold", id: 1 },
      { position: -1, color: "gold", id: 2 },
      { position: -1, color: "gold", id: 3 },
    ],
    isAI: false,
    startPosition: 0,
    finishStart: 52,
  },
  {
    color: "ruby",
    tokens: [
      { position: -1, color: "ruby", id: 0 },
      { position: -1, color: "ruby", id: 1 },
      { position: -1, color: "ruby", id: 2 },
      { position: -1, color: "ruby", id: 3 },
    ],
    isAI: true,
    startPosition: 13,
    finishStart: 13,
  },
  {
    color: "emerald",
    tokens: [
      { position: -1, color: "emerald", id: 0 },
      { position: -1, color: "emerald", id: 1 },
      { position: -1, color: "emerald", id: 2 },
      { position: -1, color: "emerald", id: 3 },
    ],
    isAI: true,
    startPosition: 26,
    finishStart: 26,
  },
  {
    color: "sapphire",
    tokens: [
      { position: -1, color: "sapphire", id: 0 },
      { position: -1, color: "sapphire", id: 1 },
      { position: -1, color: "sapphire", id: 2 },
      { position: -1, color: "sapphire", id: 3 },
    ],
    isAI: true,
    startPosition: 39,
    finishStart: 39,
  },
];

const LudoAI = () => {
  const [searchParams] = useSearchParams();
  const difficulty = (searchParams.get("difficulty") as Difficulty) || "medium";
  
  const [players, setPlayers] = useState<Player[]>(initializePlayers);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [gameOver, setGameOver] = useState<PlayerColor | null>(null);
  const [selectedToken, setSelectedToken] = useState<number | null>(null);
  const [movableTokens, setMovableTokens] = useState<number[]>([]);

  const currentPlayer = players[currentPlayerIndex];

  // Get movable tokens for current dice value
  const getMovableTokens = useCallback((player: Player, dice: number): number[] => {
    const movable: number[] = [];
    
    player.tokens.forEach((token, index) => {
      if (token.position === -1 && dice === 6) {
        // Can leave home with a 6
        movable.push(index);
      } else if (token.position >= 0 && token.position < 57) {
        // Can move on the board
        const newPos = token.position + dice;
        if (newPos <= 57) {
          movable.push(index);
        }
      }
    });
    
    return movable;
  }, []);

  // Move a token
  const moveToken = useCallback((playerIndex: number, tokenIndex: number, dice: number) => {
    setPlayers(prev => {
      const newPlayers = prev.map((p, pi) => ({
        ...p,
        tokens: p.tokens.map((t, ti) => ({ ...t })),
      }));
      
      const player = newPlayers[playerIndex];
      const token = player.tokens[tokenIndex];
      
      if (token.position === -1 && dice === 6) {
        // Move out of home
        token.position = 0;
      } else if (token.position >= 0) {
        token.position += dice;
        if (token.position > 57) token.position = 57;
      }
      
      // Check for captures (simplified - capture any opponent on same position)
      const tokenBoardPos = token.position;
      if (tokenBoardPos >= 0 && tokenBoardPos < 52) {
        newPlayers.forEach((otherPlayer, opi) => {
          if (opi !== playerIndex) {
            otherPlayer.tokens.forEach(otherToken => {
              // Simplified capture logic
              if (otherToken.position >= 0 && otherToken.position < 52) {
                const relativePos = (otherToken.position + newPlayers[opi].startPosition) % 52;
                const myRelativePos = (tokenBoardPos + player.startPosition) % 52;
                if (relativePos === myRelativePos) {
                  otherToken.position = -1; // Send back home
                }
              }
            });
          }
        });
      }
      
      return newPlayers;
    });
  }, []);

  // Check for winner
  const checkWinner = useCallback((players: Player[]): PlayerColor | null => {
    for (const player of players) {
      if (player.tokens.every(t => t.position === 57)) {
        return player.color;
      }
    }
    return null;
  }, []);

  // Roll dice
  const rollDice = useCallback(() => {
    if (isRolling || diceValue !== null) return;
    
    setIsRolling(true);
    
    // Animate dice roll
    let rolls = 0;
    const maxRolls = 10;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      rolls++;
      
      if (rolls >= maxRolls) {
        clearInterval(interval);
        const finalValue = Math.floor(Math.random() * 6) + 1;
        setDiceValue(finalValue);
        setIsRolling(false);
        
        const movable = getMovableTokens(currentPlayer, finalValue);
        setMovableTokens(movable);
        
        if (movable.length === 0) {
          // No valid moves, next player
          setTimeout(() => {
            setDiceValue(null);
            setCurrentPlayerIndex(prev => (prev + 1) % 4);
          }, 1000);
        } else if (movable.length === 1 && currentPlayer.isAI) {
          // AI auto-moves single option
          setTimeout(() => {
            moveToken(currentPlayerIndex, movable[0], finalValue);
            setDiceValue(null);
            setMovableTokens([]);
            
            const winner = checkWinner(players);
            if (winner) {
              setGameOver(winner);
            } else {
              setCurrentPlayerIndex(prev => finalValue === 6 ? prev : (prev + 1) % 4);
            }
          }, 500);
        }
      }
    }, 100);
  }, [isRolling, diceValue, currentPlayer, currentPlayerIndex, getMovableTokens, moveToken, checkWinner, players]);

  // Handle token click (for human player)
  const handleTokenClick = (tokenIndex: number) => {
    if (currentPlayer.isAI || diceValue === null || isRolling) return;
    if (!movableTokens.includes(tokenIndex)) return;
    
    moveToken(currentPlayerIndex, tokenIndex, diceValue);
    setDiceValue(null);
    setMovableTokens([]);
    setSelectedToken(null);
    
    const winner = checkWinner(players);
    if (winner) {
      setGameOver(winner);
    } else {
      setCurrentPlayerIndex(prev => diceValue === 6 ? prev : (prev + 1) % 4);
    }
  };

  // AI turn
  useEffect(() => {
    if (currentPlayer.isAI && !gameOver && diceValue === null && !isRolling) {
      const delay = difficulty === "easy" ? 800 : difficulty === "medium" ? 500 : 300;
      const timeout = setTimeout(rollDice, delay);
      return () => clearTimeout(timeout);
    }
  }, [currentPlayer.isAI, gameOver, diceValue, isRolling, rollDice, difficulty]);

  // AI move selection
  useEffect(() => {
    if (currentPlayer.isAI && diceValue !== null && !isRolling && movableTokens.length > 1) {
      const delay = difficulty === "easy" ? 600 : difficulty === "medium" ? 400 : 200;
      
      const timeout = setTimeout(() => {
        // AI strategy based on difficulty
        let chosenToken: number;
        
        if (difficulty === "easy") {
          chosenToken = movableTokens[Math.floor(Math.random() * movableTokens.length)];
        } else {
          // Prefer moving tokens closest to finish, or leaving home
          const tokens = movableTokens.map(i => ({ index: i, token: currentPlayer.tokens[i] }));
          
          // Prioritize: finishing > advancing > leaving home
          tokens.sort((a, b) => {
            if (a.token.position === -1 && b.token.position !== -1) return 1;
            if (b.token.position === -1 && a.token.position !== -1) return -1;
            return b.token.position - a.token.position;
          });
          
          chosenToken = tokens[0].index;
        }
        
        moveToken(currentPlayerIndex, chosenToken, diceValue!);
        setDiceValue(null);
        setMovableTokens([]);
        
        const winner = checkWinner(players);
        if (winner) {
          setGameOver(winner);
        } else {
          setCurrentPlayerIndex(prev => diceValue === 6 ? prev : (prev + 1) % 4);
        }
      }, delay);
      
      return () => clearTimeout(timeout);
    }
  }, [currentPlayer, diceValue, isRolling, movableTokens, difficulty, moveToken, currentPlayerIndex, checkWinner, players]);

  const resetGame = () => {
    setPlayers(initializePlayers());
    setCurrentPlayerIndex(0);
    setDiceValue(null);
    setIsRolling(false);
    setGameOver(null);
    setSelectedToken(null);
    setMovableTokens([]);
  };

  const DiceIcon = diceValue ? DICE_ICONS[diceValue - 1] : Dice1;

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="relative py-8 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-midnight-light via-background to-background" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <Button asChild variant="ghost" size="sm" className="mb-4 text-muted-foreground hover:text-primary">
            <Link to="/play-ai" className="flex items-center gap-2">
              <ArrowLeft size={18} />
              Back to Lobby
            </Link>
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-display font-bold bg-gradient-to-r from-primary via-gold-light to-accent bg-clip-text text-transparent">
                Ludo vs AI
              </h1>
              <p className="text-muted-foreground capitalize">Difficulty: {difficulty}</p>
            </div>
            
            <Button onClick={resetGame} variant="outline" className="border-primary/30">
              <RotateCcw size={18} />
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Game Area */}
      <div className="max-w-lg mx-auto px-4">
        {/* Status */}
        <div className="text-center mb-4">
          {gameOver ? (
            <div className="flex items-center justify-center gap-2 text-xl font-display">
              <Trophy className="w-6 h-6 text-primary" />
              <span className="text-primary capitalize">
                {gameOver === "gold" ? "You Win!" : `${gameOver} Wins!`}
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground capitalize">
              {currentPlayer.color}'s turn {currentPlayer.isAI ? "(AI)" : "(You)"}
            </p>
          )}
        </div>

        {/* Simplified Board Representation */}
        <div className="bg-gradient-to-br from-amber-100 to-amber-200 border-4 border-primary/40 rounded-xl p-6 shadow-[0_0_40px_-10px_hsl(45_93%_54%_/_0.3)]">
          {/* Player Home Bases */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {players.map((player, playerIndex) => (
              <div
                key={player.color}
                className={`p-4 rounded-lg border-2 ${
                  currentPlayerIndex === playerIndex ? "border-primary" : "border-transparent"
                } bg-gradient-to-br ${
                  player.color === "gold" ? "from-yellow-100 to-yellow-200" :
                  player.color === "ruby" ? "from-red-100 to-red-200" :
                  player.color === "emerald" ? "from-green-100 to-green-200" :
                  "from-blue-100 to-blue-200"
                }`}
              >
                <p className="text-xs font-semibold text-gray-700 mb-2 capitalize">
                  {player.color} {player.isAI ? "(AI)" : "(You)"}
                </p>
                <div className="flex gap-2">
                  {player.tokens.map((token, tokenIndex) => {
                    const isMovable = currentPlayerIndex === playerIndex && movableTokens.includes(tokenIndex);
                    const colors = PLAYER_COLORS[player.color];
                    
                    return (
                      <div
                        key={token.id}
                        onClick={() => handleTokenClick(tokenIndex)}
                        className={`
                          w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold text-white
                          ${colors.bg} ${colors.border} ${colors.shadow}
                          ${isMovable ? "cursor-pointer ring-2 ring-white animate-pulse" : ""}
                          ${token.position === 57 ? "opacity-50" : ""}
                          transition-all
                        `}
                      >
                        {token.position === -1 ? "H" : token.position === 57 ? "✓" : token.position}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Dice */}
          <div className="flex flex-col items-center gap-4">
            <div
              className={`
                w-16 h-16 rounded-xl bg-gradient-to-br from-gray-100 to-white border-2 border-primary/30
                flex items-center justify-center shadow-lg
                ${isRolling ? "animate-bounce" : ""}
              `}
            >
              <DiceIcon className="w-10 h-10 text-primary" />
            </div>
            
            {!currentPlayer.isAI && !gameOver && diceValue === null && (
              <Button
                onClick={rollDice}
                disabled={isRolling}
                variant="gold"
                className="px-8"
              >
                Roll Dice
              </Button>
            )}
            
            {!currentPlayer.isAI && movableTokens.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Click a highlighted token to move
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="py-8 flex items-center justify-center gap-3">
        <Star className="w-3 h-3 text-primary/40 fill-primary/20" />
        <Gem className="w-4 h-4 text-primary/40" />
        <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">Race Through the Nile's Path</span>
        <Gem className="w-4 h-4 text-primary/40" />
        <Star className="w-3 h-3 text-primary/40 fill-primary/20" />
      </div>
    </div>
  );
};

export default LudoAI;