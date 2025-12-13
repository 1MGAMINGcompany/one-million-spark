import { useState, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Star, Gem } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import LudoBoard from "@/components/ludo/LudoBoard";
import EgyptianDice from "@/components/ludo/EgyptianDice";
import TurnIndicator from "@/components/ludo/TurnIndicator";
import { Difficulty, Player, PlayerColor, Token, initializePlayers } from "@/components/ludo/ludoTypes";

const LudoAI = () => {
  const [searchParams] = useSearchParams();
  const difficulty = (searchParams.get("difficulty") as Difficulty) || "medium";
  
  const [players, setPlayers] = useState<Player[]>(() => initializePlayers());
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [gameOver, setGameOver] = useState<PlayerColor | null>(null);
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

  // Move a token - IMMUTABLE update to fix disappearing pieces bug
  const moveToken = useCallback((playerIndex: number, tokenIndex: number, dice: number) => {
    setPlayers(prevPlayers => {
      // Deep clone all players and their tokens immutably
      const newPlayers: Player[] = prevPlayers.map((player, pIdx) => ({
        ...player,
        tokens: player.tokens.map((token) => ({ ...token })),
      }));
      
      const player = newPlayers[playerIndex];
      const token = player.tokens[tokenIndex];
      
      // Calculate new position
      const previousPosition = token.position;
      let newPosition: number;
      
      if (token.position === -1 && dice === 6) {
        // Move out of home
        newPosition = 0;
      } else if (token.position >= 0) {
        newPosition = Math.min(token.position + dice, 57);
      } else {
        // Invalid move - should not happen
        console.warn(`[LUDO] Invalid move attempt: token at ${token.position}, dice: ${dice}`);
        return prevPlayers;
      }
      
      // Update the token's position immutably
      player.tokens[tokenIndex] = {
        ...token,
        position: newPosition,
      };
      
      // Console log for debugging
      console.log(`[LUDO MOVE] Player ${player.color} Token #${tokenIndex}: ${previousPosition} -> ${newPosition} (dice: ${dice})`);
      
      // Check for captures (simplified - capture any opponent on same position)
      if (newPosition >= 0 && newPosition < 52) {
        newPlayers.forEach((otherPlayer, opi) => {
          if (opi !== playerIndex) {
            otherPlayer.tokens.forEach((otherToken, oti) => {
              // Simplified capture logic
              if (otherToken.position >= 0 && otherToken.position < 52) {
                const relativePos = (otherToken.position + otherPlayer.startPosition) % 52;
                const myRelativePos = (newPosition + player.startPosition) % 52;
                if (relativePos === myRelativePos) {
                  // Capture - send back home immutably
                  otherPlayer.tokens[oti] = {
                    ...otherToken,
                    position: -1,
                  };
                  console.log(`[LUDO CAPTURE] ${player.color} captured ${otherPlayer.color} token #${oti}`);
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
  const checkWinner = useCallback((playersToCheck: Player[]): PlayerColor | null => {
    for (const player of playersToCheck) {
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
        
        console.log(`[LUDO DICE] Player ${currentPlayer.color} rolled ${finalValue}, movable tokens: [${movable.join(', ')}]`);
        
        if (movable.length === 0) {
          // No valid moves, next player
          toast({
            title: "No valid moves",
            description: `${currentPlayer.isAI ? 'AI' : 'You'} cannot move any token.`,
            duration: 1500,
          });
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
            
            setPlayers(current => {
              const winner = checkWinner(current);
              if (winner) {
                setGameOver(winner);
              } else {
                setCurrentPlayerIndex(prev => finalValue === 6 ? prev : (prev + 1) % 4);
              }
              return current;
            });
          }, 500);
        }
      }
    }, 100);
  }, [isRolling, diceValue, currentPlayer, currentPlayerIndex, getMovableTokens, moveToken, checkWinner]);

  // Handle token click (for human player)
  const handleTokenClick = useCallback((playerIndex: number, tokenIndex: number) => {
    if (playerIndex !== currentPlayerIndex) {
      console.log(`[LUDO] Click ignored: not current player's turn`);
      return;
    }
    if (currentPlayer.isAI) {
      console.log(`[LUDO] Click ignored: AI player`);
      return;
    }
    if (diceValue === null) {
      console.log(`[LUDO] Click ignored: no dice value`);
      return;
    }
    if (isRolling) {
      console.log(`[LUDO] Click ignored: dice still rolling`);
      return;
    }
    if (!movableTokens.includes(tokenIndex)) {
      console.log(`[LUDO] Illegal move: token ${tokenIndex} not in movable list [${movableTokens.join(', ')}]`);
      toast({
        title: "Illegal move",
        description: "This token cannot move with the current dice roll.",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }
    
    const token = currentPlayer.tokens[tokenIndex];
    console.log(`[LUDO] Human moving token #${tokenIndex} from position ${token.position}`);
    
    moveToken(currentPlayerIndex, tokenIndex, diceValue);
    
    const currentDice = diceValue;
    setDiceValue(null);
    setMovableTokens([]);
    
    // Use setTimeout to let state update complete before checking winner
    setTimeout(() => {
      setPlayers(current => {
        const winner = checkWinner(current);
        if (winner) {
          setGameOver(winner);
        } else {
          setCurrentPlayerIndex(prev => currentDice === 6 ? prev : (prev + 1) % 4);
        }
        return current;
      });
    }, 50);
  }, [currentPlayerIndex, currentPlayer, diceValue, isRolling, movableTokens, moveToken, checkWinner]);

  // AI turn - trigger dice roll
  useEffect(() => {
    if (currentPlayer.isAI && !gameOver && diceValue === null && !isRolling) {
      const delay = difficulty === "easy" ? 800 : difficulty === "medium" ? 500 : 300;
      const timeout = setTimeout(rollDice, delay);
      return () => clearTimeout(timeout);
    }
  }, [currentPlayer.isAI, gameOver, diceValue, isRolling, rollDice, difficulty]);

  // AI move selection when multiple options available
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
        
        console.log(`[LUDO AI] Choosing token ${chosenToken} from options [${movableTokens.join(', ')}]`);
        
        moveToken(currentPlayerIndex, chosenToken, diceValue);
        
        const currentDice = diceValue;
        setDiceValue(null);
        setMovableTokens([]);
        
        setTimeout(() => {
          setPlayers(current => {
            const winner = checkWinner(current);
            if (winner) {
              setGameOver(winner);
            } else {
              setCurrentPlayerIndex(prev => currentDice === 6 ? prev : (prev + 1) % 4);
            }
            return current;
          });
        }, 50);
      }, delay);
      
      return () => clearTimeout(timeout);
    }
  }, [currentPlayer, diceValue, isRolling, movableTokens, difficulty, moveToken, currentPlayerIndex, checkWinner]);

  const resetGame = useCallback(() => {
    console.log('[LUDO] Game reset');
    setPlayers(initializePlayers());
    setCurrentPlayerIndex(0);
    setDiceValue(null);
    setIsRolling(false);
    setGameOver(null);
    setMovableTokens([]);
  }, []);

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="relative py-4 sm:py-6 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-midnight-light via-background to-background" />
        <div className="relative z-10 max-w-lg mx-auto">
          <Button asChild variant="ghost" size="sm" className="mb-2 text-muted-foreground hover:text-primary">
            <Link to="/play-ai" className="flex items-center gap-2">
              <ArrowLeft size={18} />
              Back to Lobby
            </Link>
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold bg-gradient-to-r from-primary via-gold-light to-accent bg-clip-text text-transparent">
                Ludo vs AI
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground capitalize flex items-center gap-1">
                <span className="text-primary">𓆣</span>
                Difficulty: {difficulty}
              </p>
            </div>
            
            <Button onClick={resetGame} variant="outline" size="sm" className="border-primary/30">
              <RotateCcw size={16} />
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Game Area */}
      <div className="max-w-lg mx-auto px-2 sm:px-4 space-y-4">
        {/* Turn Indicator */}
        <TurnIndicator
          currentPlayer={currentPlayer.color}
          isAI={currentPlayer.isAI}
          isGameOver={!!gameOver}
          winner={gameOver}
        />

        {/* Ludo Board */}
        <LudoBoard
          players={players}
          currentPlayerIndex={currentPlayerIndex}
          movableTokens={movableTokens}
          onTokenClick={handleTokenClick}
        />

        {/* Dice Area */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <EgyptianDice
            value={diceValue}
            isRolling={isRolling}
            onRoll={rollDice}
            disabled={isRolling || diceValue !== null || !!gameOver}
            showRollButton={!currentPlayer.isAI && !gameOver && diceValue === null}
          />
          
          {!currentPlayer.isAI && movableTokens.length > 0 && (
            <p className="text-sm text-muted-foreground text-center">
              <span className="text-primary">☥</span>
              {" "}Tap a glowing token to move{" "}
              <span className="text-primary">☥</span>
            </p>
          )}
          
          {currentPlayer.isAI && !gameOver && (
            <p className="text-sm text-muted-foreground animate-pulse">
              {isRolling ? "Rolling..." : diceValue ? "Thinking..." : "AI is playing..."}
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="py-6 flex items-center justify-center gap-3">
        <Star className="w-3 h-3 text-primary/40 fill-primary/20" />
        <Gem className="w-4 h-4 text-primary/40" />
        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Race Through the Nile's Path</span>
        <Gem className="w-4 h-4 text-primary/40" />
        <Star className="w-3 h-3 text-primary/40 fill-primary/20" />
      </div>
    </div>
  );
};

export default LudoAI;