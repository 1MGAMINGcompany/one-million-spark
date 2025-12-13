import { useState, useCallback, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Music, Music2, Volume2, VolumeX } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useTranslation } from "react-i18next";
import LudoBoard from "@/components/ludo/LudoBoard";
import EgyptianDice from "@/components/ludo/EgyptianDice";
import TurnIndicator from "@/components/ludo/TurnIndicator";
import { Difficulty, Player, PlayerColor, Token, initializePlayers, getTokenCoords } from "@/components/ludo/ludoTypes";

const LudoAI = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const difficulty = (searchParams.get("difficulty") as Difficulty) || "medium";
  const { play } = useSound();
  
  const [players, setPlayers] = useState<Player[]>(() => initializePlayers());
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [gameOver, setGameOver] = useState<PlayerColor | null>(null);
  const [movableTokens, setMovableTokens] = useState<number[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // Wrapper for play function that respects sfxEnabled
  const playSfx = useCallback((sound: string) => {
    if (sfxEnabled) {
      play(sound);
    }
  }, [sfxEnabled, play]);

  const currentPlayer = players[currentPlayerIndex];

  // Background music control
  useEffect(() => {
    if (!musicRef.current) {
      musicRef.current = new Audio('/sounds/ludo/background.mp3');
      musicRef.current.loop = true;
      musicRef.current.volume = 0.3;
    }

    if (musicEnabled) {
      musicRef.current.play().catch(() => {});
    } else {
      musicRef.current.pause();
    }

    return () => {
      if (musicRef.current) {
        musicRef.current.pause();
      }
    };
  }, [musicEnabled]);

  // Cleanup music on unmount
  useEffect(() => {
    return () => {
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current = null;
      }
    };
  }, []);

  const toggleMusic = useCallback(() => {
    setMusicEnabled(prev => !prev);
  }, []);

  const toggleSfx = useCallback(() => {
    setSfxEnabled(prev => !prev);
  }, []);

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

  // Animate token movement step by step
  const animateMove = useCallback((
    playerIndex: number, 
    tokenIndex: number, 
    startPos: number, 
    endPos: number,
    onComplete: () => void
  ) => {
    setIsAnimating(true);
    
    // Generate path from start to end
    const path: number[] = [];
    if (startPos === -1) {
      // Moving out of home - just one step to position 0
      path.push(0);
    } else {
      for (let pos = startPos + 1; pos <= endPos; pos++) {
        path.push(pos);
      }
    }
    
    let stepIndex = 0;
    
    const animateStep = () => {
      if (stepIndex >= path.length) {
        setIsAnimating(false);
        onComplete();
        return;
      }
      
      const nextPos = path[stepIndex];
      
      // Play move sound on each step
      playSfx('ludo_move');
      
      // Update token position for this step
      setPlayers(prevPlayers => {
        const newPlayers = prevPlayers.map((player, pIdx) => ({
          ...player,
          tokens: player.tokens.map((token, tIdx) => {
            if (pIdx === playerIndex && tIdx === tokenIndex) {
              console.log(`[LUDO ANIM] Step ${stepIndex + 1}/${path.length}: ${token.position} -> ${nextPos}`);
              return { ...token, position: nextPos };
            }
            return { ...token };
          }),
        }));
        return newPlayers;
      });
      
      stepIndex++;
      animationRef.current = setTimeout(animateStep, 150);
    };
    
    animateStep();
  }, [playSfx]);

  // Move a token with animation
  const moveToken = useCallback((playerIndex: number, tokenIndex: number, dice: number) => {
    const player = players[playerIndex];
    const token = player.tokens[tokenIndex];
    
    const previousPosition = token.position;
    let newPosition: number;
    
    if (token.position === -1 && dice === 6) {
      newPosition = 0;
    } else if (token.position >= 0) {
      newPosition = Math.min(token.position + dice, 57);
    } else {
      console.warn(`[LUDO] Invalid move attempt: token at ${token.position}, dice: ${dice}`);
      return;
    }
    
    console.log(`[LUDO MOVE] Player ${player.color} Token #${tokenIndex}: ${previousPosition} -> ${newPosition} (dice: ${dice})`);
    
    // Animate the movement
    animateMove(playerIndex, tokenIndex, previousPosition, newPosition, () => {
      // After animation: check captures
      setPlayers(prevPlayers => {
        const newPlayers = prevPlayers.map((p, pi) => ({
          ...p,
          tokens: p.tokens.map(t => ({ ...t })),
        }));
        
        // Check for captures (simplified)
        if (newPosition >= 0 && newPosition < 52) {
          const currentPlayerData = newPlayers[playerIndex];
          newPlayers.forEach((otherPlayer, opi) => {
            if (opi !== playerIndex) {
              otherPlayer.tokens.forEach((otherToken, oti) => {
                if (otherToken.position >= 0 && otherToken.position < 52) {
                  const relativePos = (otherToken.position + otherPlayer.startPosition) % 52;
                  const myRelativePos = (newPosition + currentPlayerData.startPosition) % 52;
                  if (relativePos === myRelativePos) {
                    otherPlayer.tokens[oti] = { ...otherToken, position: -1 };
                    console.log(`[LUDO CAPTURE] ${currentPlayerData.color} captured ${otherPlayer.color} token #${oti}`);
                    playSfx('ludo_capture');
                    toast({
                      title: "Captured!",
                      description: `${currentPlayerData.color} captured ${otherPlayer.color}'s token!`,
                      duration: 2000,
                    });
                  }
                }
              });
            }
          });
        }
        
        return newPlayers;
      });
    });
  }, [players, animateMove, play]);

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
    if (isRolling || diceValue !== null || isAnimating) return;
    
    setIsRolling(true);
    playSfx('ludo_dice');
    
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
          setTimeout(() => {
            moveToken(currentPlayerIndex, movable[0], finalValue);
            const currentDice = finalValue;
            setDiceValue(null);
            setMovableTokens([]);
            
            setTimeout(() => {
              setPlayers(current => {
                const winner = checkWinner(current);
                if (winner) {
                  setGameOver(winner);
                  playSfx(winner === 'gold' ? 'ludo_win' : 'ludo_lose');
                } else {
                  setCurrentPlayerIndex(prev => currentDice === 6 ? prev : (prev + 1) % 4);
                }
                return current;
              });
            }, 800);
          }, 500);
        }
      }
    }, 100);
  }, [isRolling, diceValue, isAnimating, currentPlayer, currentPlayerIndex, getMovableTokens, moveToken, checkWinner, playSfx]);

  // Handle token click (for human player)
  const handleTokenClick = useCallback((playerIndex: number, tokenIndex: number) => {
    if (isAnimating) return;
    if (playerIndex !== currentPlayerIndex) return;
    if (currentPlayer.isAI) return;
    if (diceValue === null) return;
    if (isRolling) return;
    
    if (!movableTokens.includes(tokenIndex)) {
      toast({
        title: "Illegal move",
        description: "This token cannot move with the current dice roll.",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }
    
    const currentDice = diceValue;
    moveToken(currentPlayerIndex, tokenIndex, currentDice);
    setDiceValue(null);
    setMovableTokens([]);
    
    setTimeout(() => {
      setPlayers(current => {
        const winner = checkWinner(current);
        if (winner) {
          setGameOver(winner);
          playSfx(winner === 'gold' ? 'ludo_win' : 'ludo_lose');
        } else {
          setCurrentPlayerIndex(prev => currentDice === 6 ? prev : (prev + 1) % 4);
        }
        return current;
      });
    }, 800);
  }, [isAnimating, currentPlayerIndex, currentPlayer, diceValue, isRolling, movableTokens, moveToken, checkWinner, playSfx]);

  // AI turn
  useEffect(() => {
    if (currentPlayer.isAI && !gameOver && diceValue === null && !isRolling && !isAnimating) {
      const delay = difficulty === "easy" ? 800 : difficulty === "medium" ? 500 : 300;
      const timeout = setTimeout(rollDice, delay);
      return () => clearTimeout(timeout);
    }
  }, [currentPlayer.isAI, gameOver, diceValue, isRolling, isAnimating, rollDice, difficulty]);

  // AI move selection
  useEffect(() => {
    if (currentPlayer.isAI && diceValue !== null && !isRolling && !isAnimating && movableTokens.length > 1) {
      const delay = difficulty === "easy" ? 600 : difficulty === "medium" ? 400 : 200;
      
      const timeout = setTimeout(() => {
        let chosenToken: number;
        
        if (difficulty === "easy") {
          chosenToken = movableTokens[Math.floor(Math.random() * movableTokens.length)];
        } else {
          const tokens = movableTokens.map(i => ({ index: i, token: currentPlayer.tokens[i] }));
          tokens.sort((a, b) => {
            if (a.token.position === -1 && b.token.position !== -1) return 1;
            if (b.token.position === -1 && a.token.position !== -1) return -1;
            return b.token.position - a.token.position;
          });
          chosenToken = tokens[0].index;
        }
        
        const currentDice = diceValue;
        moveToken(currentPlayerIndex, chosenToken, currentDice);
        setDiceValue(null);
        setMovableTokens([]);
        
        setTimeout(() => {
          setPlayers(current => {
            const winner = checkWinner(current);
            if (winner) {
              setGameOver(winner);
              playSfx(winner === 'gold' ? 'ludo_win' : 'ludo_lose');
            } else {
              setCurrentPlayerIndex(prev => currentDice === 6 ? prev : (prev + 1) % 4);
            }
            return current;
          });
        }, 800);
      }, delay);
      
      return () => clearTimeout(timeout);
    }
  }, [currentPlayer, diceValue, isRolling, isAnimating, movableTokens, difficulty, moveToken, currentPlayerIndex, checkWinner, playSfx]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, []);

  const resetGame = useCallback(() => {
    if (animationRef.current) {
      clearTimeout(animationRef.current);
    }
    setPlayers(initializePlayers());
    setCurrentPlayerIndex(0);
    setDiceValue(null);
    setIsRolling(false);
    setGameOver(null);
    setMovableTokens([]);
    setIsAnimating(false);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="relative py-3 px-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
              <Link to="/play-ai" className="flex items-center gap-2">
                <ArrowLeft size={18} />
                <span className="hidden sm:inline">{t('gameAI.back')}</span>
              </Link>
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-display font-bold text-primary">
                {t('gameAI.ludoTitle')}
              </h1>
              <p className="text-xs text-muted-foreground capitalize">
                {difficulty} {t('gameAI.difficulty')}
              </p>
            </div>
          </div>
          
          <Button onClick={resetGame} variant="outline" size="sm" className="border-primary/30">
            <RotateCcw size={16} />
            <span className="hidden sm:inline ml-1">{t('gameAI.reset')}</span>
          </Button>
        </div>
      </div>

      {/* Game Area - Responsive layout */}
      <div className="flex-1 flex items-center justify-center p-2 md:p-4">
        <div className="w-full max-w-4xl flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
          
          {/* Dice - Left side on desktop */}
          <div className="hidden md:flex flex-col items-center gap-4 w-32">
            <TurnIndicator
              currentPlayer={currentPlayer.color}
              isAI={currentPlayer.isAI}
              isGameOver={!!gameOver}
              winner={gameOver}
            />
            <EgyptianDice
              value={diceValue}
              isRolling={isRolling}
              onRoll={rollDice}
              disabled={isRolling || diceValue !== null || !!gameOver || isAnimating}
              showRollButton={!currentPlayer.isAI && !gameOver && diceValue === null && !isAnimating}
            />
            {!currentPlayer.isAI && movableTokens.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                {t('gameAI.tapGlowingToken')}
              </p>
            )}
            {currentPlayer.isAI && !gameOver && (
              <p className="text-xs text-muted-foreground animate-pulse text-center">
                {isRolling ? t('gameAI.rolling') : isAnimating ? t('gameAI.moving') : diceValue ? t('gameAI.thinking') : t('gameAI.aiPlaying')}
              </p>
            )}
            {/* Audio toggles - Desktop */}
            <div className="flex flex-col gap-2">
              <button
                onClick={toggleMusic}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-card/50 hover:bg-card transition-colors text-xs"
              >
                {musicEnabled ? <Music2 size={14} className="text-primary" /> : <Music size={14} className="text-muted-foreground" />}
                <span className={musicEnabled ? "text-primary" : "text-muted-foreground"}>
                  {musicEnabled ? t('gameAI.musicOn') : t('gameAI.musicOff')}
                </span>
              </button>
              <button
                onClick={toggleSfx}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-card/50 hover:bg-card transition-colors text-xs"
              >
                {sfxEnabled ? <Volume2 size={14} className="text-primary" /> : <VolumeX size={14} className="text-muted-foreground" />}
                <span className={sfxEnabled ? "text-primary" : "text-muted-foreground"}>
                  {sfxEnabled ? t('gameAI.sfxOn') : t('gameAI.sfxOff')}
                </span>
              </button>
            </div>
          </div>

          {/* Board */}
          <LudoBoard
            players={players}
            currentPlayerIndex={currentPlayerIndex}
            movableTokens={isAnimating ? [] : movableTokens}
            onTokenClick={handleTokenClick}
          />

          {/* Dice - Below board on mobile, aligned left */}
          <div className="flex md:hidden flex-row items-center gap-4 w-full px-2 relative">
            <div className="flex flex-col items-center gap-2">
              <EgyptianDice
                value={diceValue}
                isRolling={isRolling}
                onRoll={rollDice}
                disabled={isRolling || diceValue !== null || !!gameOver || isAnimating}
                showRollButton={!currentPlayer.isAI && !gameOver && diceValue === null && !isAnimating}
              />
            </div>
            <div className="flex flex-col items-start gap-1 flex-1">
              <TurnIndicator
                currentPlayer={currentPlayer.color}
                isAI={currentPlayer.isAI}
                isGameOver={!!gameOver}
                winner={gameOver}
              />
              {!currentPlayer.isAI && movableTokens.length > 0 && (
                <p className="text-xs text-muted-foreground">Tap a glowing token</p>
              )}
              {currentPlayer.isAI && !gameOver && (
                <p className="text-xs text-muted-foreground animate-pulse">
                  {isRolling ? "Rolling..." : isAnimating ? "Moving..." : diceValue ? "Thinking..." : "AI turn..."}
                </p>
              )}
            </div>
            {/* Audio toggles - Mobile (bottom right) */}
            <div className="flex flex-col gap-1.5">
              <button
                onClick={toggleMusic}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-primary/30 bg-card/50 hover:bg-card transition-colors text-xs"
              >
                {musicEnabled ? <Music2 size={14} className="text-primary" /> : <Music size={14} className="text-muted-foreground" />}
                <span className={musicEnabled ? "text-primary" : "text-muted-foreground"}>
                  {musicEnabled ? "On" : "Off"}
                </span>
              </button>
              <button
                onClick={toggleSfx}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-primary/30 bg-card/50 hover:bg-card transition-colors text-xs"
              >
                {sfxEnabled ? <Volume2 size={14} className="text-primary" /> : <VolumeX size={14} className="text-muted-foreground" />}
                <span className={sfxEnabled ? "text-primary" : "text-muted-foreground"}>
                  {sfxEnabled ? "On" : "Off"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Game Over Overlay */}
      {gameOver && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-card border border-primary rounded-lg p-6 text-center">
            <h2 className="text-2xl font-display font-bold text-primary mb-2">
              {gameOver === "gold" ? "You Win!" : `${gameOver.charAt(0).toUpperCase() + gameOver.slice(1)} Wins!`}
            </h2>
            <p className="text-muted-foreground mb-4">
              {gameOver === "gold" ? "Congratulations!" : "Better luck next time!"}
            </p>
            <Button onClick={resetGame} className="bg-primary text-primary-foreground">
              Play Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LudoAI;
