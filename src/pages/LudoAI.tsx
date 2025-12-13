import { useState, useCallback, useEffect, memo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Star, Gem } from "lucide-react";
import LudoBoard from "@/components/ludo/LudoBoard";
import EgyptianDice from "@/components/ludo/EgyptianDice";
import TurnIndicator from "@/components/ludo/TurnIndicator";
import { Difficulty, Player, PlayerColor, initializePlayers } from "@/components/ludo/ludoTypes";

const LudoAI = () => {
  const [searchParams] = useSearchParams();
  const difficulty = (searchParams.get("difficulty") as Difficulty) || "medium";
  
  const [players, setPlayers] = useState<Player[]>(initializePlayers);
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
  const handleTokenClick = (playerIndex: number, tokenIndex: number) => {
    if (playerIndex !== currentPlayerIndex) return;
    if (currentPlayer.isAI || diceValue === null || isRolling) return;
    if (!movableTokens.includes(tokenIndex)) return;
    
    moveToken(currentPlayerIndex, tokenIndex, diceValue);
    setDiceValue(null);
    setMovableTokens([]);
    
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
    setMovableTokens([]);
  };

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
