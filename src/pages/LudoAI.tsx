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

  // Use refs to track current game state for reliable access in callbacks
  const playersRef = useRef(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  
  const currentPlayerIndexRef = useRef(currentPlayerIndex);
  useEffect(() => {
    currentPlayerIndexRef.current = currentPlayerIndex;
  }, [currentPlayerIndex]);

  // Animate token movement step by step - completely rewritten for reliability
  const animateMove = useCallback((
    playerIndex: number, 
    tokenIndex: number, 
    startPos: number, 
    endPos: number,
    onComplete: () => void
  ) => {
    setIsAnimating(true);
    
    // Calculate exact number of steps
    const numSteps = startPos === -1 ? 1 : Math.abs(endPos - startPos);
    
    console.log(`[LUDO ANIM] Animating ${numSteps} step(s) from ${startPos} to ${endPos}`);
    
    // Track current step outside React state to avoid race conditions
    let completedSteps = 0;
    
    const executeStep = () => {
      completedSteps++;
      
      // Calculate position for this step
      let newPosition: number;
      if (startPos === -1) {
        newPosition = 0;
      } else {
        newPosition = startPos + completedSteps;
      }
      
      console.log(`[LUDO ANIM] Step ${completedSteps}/${numSteps}: pos=${newPosition}`);
      playSfx('ludo_move');
      
      // Update state synchronously for this step
      setPlayers(prev => prev.map((player, pIdx) => ({
        ...player,
        tokens: player.tokens.map((token, tIdx) => {
          if (pIdx === playerIndex && tIdx === tokenIndex) {
            return { ...token, position: newPosition };
          }
          return token;
        }),
      })));
      
      if (completedSteps >= numSteps) {
        // Animation complete - force final position and finish
        setPlayers(prev => prev.map((player, pIdx) => ({
          ...player,
          tokens: player.tokens.map((token, tIdx) => {
            if (pIdx === playerIndex && tIdx === tokenIndex) {
              console.log(`[LUDO ANIM] Final: ${token.position} -> ${endPos}`);
              return { ...token, position: endPos };
            }
            return token;
          }),
        })));
        
        setIsAnimating(false);
        onComplete();
      } else {
        // Schedule next step
        animationRef.current = setTimeout(executeStep, 150);
      }
    };
    
    // Start first step after initial delay
    animationRef.current = setTimeout(executeStep, 150);
  }, [playSfx]);

  // Move a token - using refs for reliable state access
  const moveToken = useCallback((playerIndex: number, tokenIndex: number, dice: number) => {
    // Get current state from ref to avoid stale closures
    const currentPlayers = playersRef.current;
    const player = currentPlayers[playerIndex];
    const token = player.tokens[tokenIndex];
    
    // Capture positions BEFORE any updates
    const startPosition = token.position;
    let endPosition: number;
    
    if (startPosition === -1 && dice === 6) {
      endPosition = 0;
    } else if (startPosition >= 0 && startPosition < 57) {
      endPosition = startPosition + dice;
      if (endPosition > 57) {
        console.warn(`[LUDO] Move would exceed 57, skipping`);
        return;
      }
    } else {
      console.warn(`[LUDO] Invalid move: pos=${startPosition}, dice=${dice}`);
      return;
    }
    
    // Validate move distance
    const expectedDistance = startPosition === -1 ? 1 : (endPosition - startPosition);
    const actualDice = startPosition === -1 ? 6 : dice;
    
    console.log(`[LUDO MOVE] ${player.color} Token#${tokenIndex}: ${startPosition} -> ${endPosition} (dice=${dice}, distance=${expectedDistance})`);
    
    if (startPosition >= 0 && expectedDistance !== dice) {
      console.error(`[LUDO BUG] Distance mismatch! dice=${dice} but distance=${expectedDistance}`);
    }
    
    // Animate with locked positions
    animateMove(playerIndex, tokenIndex, startPosition, endPosition, () => {
      // After animation: handle captures
      setPlayers(prevPlayers => {
        const newPlayers = prevPlayers.map(p => ({
          ...p,
          tokens: p.tokens.map(t => ({ ...t })),
        }));
        
        // Verify final position
        const movedToken = newPlayers[playerIndex].tokens[tokenIndex];
        if (movedToken.position !== endPosition) {
          console.error(`[LUDO FIX] Correcting ${movedToken.position} -> ${endPosition}`);
          newPlayers[playerIndex].tokens[tokenIndex].position = endPosition;
        }
        
        // Check captures (only on main track)
        if (endPosition >= 0 && endPosition < 52) {
          const movingPlayer = newPlayers[playerIndex];
          newPlayers.forEach((otherPlayer, opi) => {
            if (opi !== playerIndex) {
              otherPlayer.tokens.forEach((otherToken, oti) => {
                if (otherToken.position >= 0 && otherToken.position < 52) {
                  const otherAbsPos = (otherToken.position + otherPlayer.startPosition) % 52;
                  const myAbsPos = (endPosition + movingPlayer.startPosition) % 52;
                  if (otherAbsPos === myAbsPos) {
                    newPlayers[opi].tokens[oti] = { ...otherToken, position: -1 };
                    console.log(`[LUDO CAPTURE] ${movingPlayer.color} captured ${otherPlayer.color} token#${oti}`);
                    playSfx('ludo_capture');
                    toast({
                      title: "Captured!",
                      description: `${movingPlayer.color} captured ${otherPlayer.color}'s token!`,
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
  }, [animateMove, playSfx]);

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
  // Advance turn after a move
  const advanceTurn = useCallback((diceRolled: number) => {
    // Wait for animation to complete before checking winner and changing turn
    const checkAndAdvance = () => {
      setPlayers(current => {
        const winner = checkWinner(current);
        if (winner) {
          setGameOver(winner);
          playSfx(winner === 'gold' ? 'ludo_win' : 'ludo_lose');
        } else {
          // Only advance turn if dice wasn't 6
          setCurrentPlayerIndex(prev => diceRolled === 6 ? prev : (prev + 1) % 4);
        }
        return current;
      });
    };
    
    // Add delay after animation completes
    setTimeout(checkAndAdvance, 200);
  }, [checkWinner, playSfx]);

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
        
        // Use ref to get current player state
        const currentPlayerData = playersRef.current[currentPlayerIndexRef.current];
        const movable = getMovableTokens(currentPlayerData, finalValue);
        setMovableTokens(movable);
        
        console.log(`[LUDO DICE] Player ${currentPlayerData.color} rolled ${finalValue}, movable tokens: [${movable.join(', ')}]`);
        
        if (movable.length === 0) {
          toast({
            title: "No valid moves",
            description: `${currentPlayerData.isAI ? 'AI' : 'You'} cannot move any token.`,
            duration: 1500,
          });
          setTimeout(() => {
            setDiceValue(null);
            setMovableTokens([]);
            setCurrentPlayerIndex(prev => (prev + 1) % 4);
          }, 1000);
        } else if (movable.length === 1 && currentPlayerData.isAI) {
          // AI auto-moves when only one option
          setTimeout(() => {
            const playerIdx = currentPlayerIndexRef.current;
            moveToken(playerIdx, movable[0], finalValue);
            setDiceValue(null);
            setMovableTokens([]);
            
            // Wait for animation (numSteps * 150ms + buffer) then advance turn
            const numSteps = playersRef.current[playerIdx].tokens[movable[0]].position === -1 ? 1 : finalValue;
            setTimeout(() => advanceTurn(finalValue), numSteps * 150 + 300);
          }, 500);
        }
      }
    }, 100);
  }, [isRolling, diceValue, isAnimating, getMovableTokens, moveToken, advanceTurn, playSfx]);

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
    const token = currentPlayer.tokens[tokenIndex];
    const numSteps = token.position === -1 ? 1 : currentDice;
    
    moveToken(currentPlayerIndex, tokenIndex, currentDice);
    setDiceValue(null);
    setMovableTokens([]);
    
    // Wait for animation to complete then advance turn
    setTimeout(() => advanceTurn(currentDice), numSteps * 150 + 300);
  }, [isAnimating, currentPlayerIndex, currentPlayer, diceValue, isRolling, movableTokens, moveToken, advanceTurn]);

  // AI turn - trigger dice roll
  useEffect(() => {
    if (currentPlayer.isAI && !gameOver && diceValue === null && !isRolling && !isAnimating) {
      const delay = difficulty === "easy" ? 800 : difficulty === "medium" ? 500 : 300;
      const timeout = setTimeout(rollDice, delay);
      return () => clearTimeout(timeout);
    }
  }, [currentPlayer.isAI, gameOver, diceValue, isRolling, isAnimating, rollDice, difficulty]);

  // AI move selection - when multiple tokens can move
  useEffect(() => {
    if (currentPlayer.isAI && diceValue !== null && !isRolling && !isAnimating && movableTokens.length > 1) {
      const delay = difficulty === "easy" ? 600 : difficulty === "medium" ? 400 : 200;
      
      const timeout = setTimeout(() => {
        let chosenToken: number;
        const currentPlayerData = playersRef.current[currentPlayerIndexRef.current];
        
        if (difficulty === "easy") {
          chosenToken = movableTokens[Math.floor(Math.random() * movableTokens.length)];
        } else {
          // Prioritize tokens already on board over those in home
          const tokens = movableTokens.map(i => ({ index: i, token: currentPlayerData.tokens[i] }));
          tokens.sort((a, b) => {
            if (a.token.position === -1 && b.token.position !== -1) return 1;
            if (b.token.position === -1 && a.token.position !== -1) return -1;
            return b.token.position - a.token.position;
          });
          chosenToken = tokens[0].index;
        }
        
        const currentDice = diceValue;
        const token = currentPlayerData.tokens[chosenToken];
        const numSteps = token.position === -1 ? 1 : currentDice;
        const playerIdx = currentPlayerIndexRef.current;
        
        moveToken(playerIdx, chosenToken, currentDice);
        setDiceValue(null);
        setMovableTokens([]);
        
        // Wait for animation then advance turn
        setTimeout(() => advanceTurn(currentDice), numSteps * 150 + 300);
      }, delay);
      
      return () => clearTimeout(timeout);
    }
  }, [currentPlayer.isAI, diceValue, isRolling, isAnimating, movableTokens, difficulty, moveToken, advanceTurn]);

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
