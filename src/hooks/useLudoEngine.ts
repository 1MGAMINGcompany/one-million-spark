import { useState, useCallback, useRef, useEffect } from "react";
import { Player, PlayerColor, Token, initializePlayers, TRACK_SIZE, SAFE_SQUARES } from "@/components/ludo/ludoTypes";

// ============ GAME CONSTANTS ============
const FINISH_POSITION = 62;
const MAIN_TRACK_END = 55;

// ============ GAME PHASES (State Machine) ============
export type GamePhase = 
  | 'WAITING_FOR_ROLL'    // Current player needs to roll
  | 'ROLLING'             // Dice animation in progress
  | 'WAITING_FOR_MOVE'    // Player must select a token to move
  | 'ANIMATING'           // Token animation in progress
  | 'GAME_OVER';          // Winner determined

// Export for LudoGame.tsx backwards compatibility
export interface LudoMove {
  playerIndex: number;
  tokenIndex: number;
  diceValue: number;
  startPosition: number;
  endPosition: number;
}

export interface LudoCaptureEvent {
  capturedColor: PlayerColor;
  capturingColor: PlayerColor;
  position: [number, number];
  tokenId?: number;
  fromPosition?: number;
}

interface UseLudoEngineOptions {
  onSoundPlay?: (sound: string) => void;
  onToast?: (title: string, description: string, variant?: "default" | "destructive") => void;
}

export function useLudoEngine(options: UseLudoEngineOptions = {}) {
  const { onSoundPlay, onToast } = options;
  
  // ============ CORE STATE ============
  const [players, setPlayers] = useState<Player[]>(() => initializePlayers());
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [phase, setPhase] = useState<GamePhase>('WAITING_FOR_ROLL');
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [movableTokens, setMovableTokens] = useState<number[]>([]);
  const [winner, setWinner] = useState<PlayerColor | null>(null);
  const [consecutiveSixes, setConsecutiveSixes] = useState(0);
  const [captureEvent, setCaptureEvent] = useState<LudoCaptureEvent | null>(null);
  const [gameId, setGameId] = useState(0); // Increments on reset
  const [eliminatedPlayers, setEliminatedPlayers] = useState<Set<number>>(new Set());
  const [turnSignal, setTurnSignal] = useState(0); // For backwards compatibility

  // Animation refs
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  const diceIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ============ DERIVED STATE ============
  const currentPlayer = players[currentPlayerIndex];

  // ============ PURE HELPER FUNCTIONS ============
  
  // Calculate which tokens can move with given dice
  const getMovableTokens = useCallback((player: Player, dice: number): number[] => {
    const movable: number[] = [];
    player.tokens.forEach((token, index) => {
      if (token.position === -1 && dice === 6) {
        // Can leave home base with a 6
        movable.push(index);
      } else if (token.position >= 0 && token.position < FINISH_POSITION) {
        const newPos = token.position + dice;
        // Must land exactly on finish, cannot overshoot
        if (newPos <= FINISH_POSITION) {
          movable.push(index);
        }
      }
    });
    return movable;
  }, []);

  // Calculate end position for a move
  const calculateEndPosition = useCallback((token: Token, dice: number): number | null => {
    if (token.position === -1 && dice === 6) {
      return 0; // Leave home base
    } else if (token.position >= 0 && token.position < FINISH_POSITION) {
      const newPos = token.position + dice;
      if (newPos <= FINISH_POSITION) {
        return newPos;
      }
    }
    return null;
  }, []);

  // Check if any player has won
  const checkWinner = useCallback((playersToCheck: Player[]): PlayerColor | null => {
    for (const player of playersToCheck) {
      if (player.tokens.every(t => t.position === FINISH_POSITION)) {
        return player.color;
      }
    }
    return null;
  }, []);

  // ============ ACTIONS ============

  // Roll the dice - with optional callback for backwards compatibility
  const rollDice = useCallback((onRollComplete?: (dice: number, movable: number[]) => void) => {
    if (phase !== 'WAITING_FOR_ROLL') {
      console.log(`[LUDO] Cannot roll: phase is ${phase}`);
      return;
    }

    setPhase('ROLLING');
    onSoundPlay?.('ludo_dice');

    let rolls = 0;
    const maxRolls = 10;

    diceIntervalRef.current = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      rolls++;

      if (rolls >= maxRolls) {
        clearInterval(diceIntervalRef.current!);
        diceIntervalRef.current = null;

        const finalValue = Math.floor(Math.random() * 6) + 1;
        setDiceValue(finalValue);

        console.log(`[LUDO] ${players[currentPlayerIndex].color} rolled ${finalValue}`);

        // Check for three consecutive sixes
        if (finalValue === 6) {
          const newCount = consecutiveSixes + 1;
          setConsecutiveSixes(newCount);
          
          if (newCount >= 3) {
            console.log(`[LUDO] Three sixes! Turn forfeited.`);
            onToast?.("Three Sixes!", "Turn forfeited - three 6s in a row!");
            setConsecutiveSixes(0);
            setDiceValue(null);
            setMovableTokens([]);
            setCurrentPlayerIndex(prev => (prev + 1) % 4);
            setTurnSignal(prev => prev + 1);
            setPhase('WAITING_FOR_ROLL');
            onRollComplete?.(finalValue, []);
            return;
          }
        } else {
          setConsecutiveSixes(0);
        }

        // Calculate movable tokens
        const movable = getMovableTokens(players[currentPlayerIndex], finalValue);
        setMovableTokens(movable);

        console.log(`[LUDO] Movable tokens: [${movable.join(', ')}]`);

        // Call the callback if provided (for backwards compatibility)
        onRollComplete?.(finalValue, movable);

        if (movable.length === 0) {
          // No valid moves - auto advance
          onToast?.("No moves available", "No tokens can move with this roll");
          setTimeout(() => {
            setDiceValue(null);
            if (finalValue === 6) {
              setPhase('WAITING_FOR_ROLL');
            } else {
              setConsecutiveSixes(0);
              setCurrentPlayerIndex(prev => (prev + 1) % 4);
              setTurnSignal(prev => prev + 1);
              setPhase('WAITING_FOR_ROLL');
            }
          }, 800);
        } else {
          setPhase('WAITING_FOR_MOVE');
        }
      }
    }, 80);
  }, [phase, players, currentPlayerIndex, consecutiveSixes, getMovableTokens, onSoundPlay, onToast]);

  // Select a token to move
  const selectToken = useCallback((tokenIndex: number) => {
    if (phase !== 'WAITING_FOR_MOVE') {
      console.log(`[LUDO] Cannot select: phase is ${phase}`);
      return false;
    }

    if (!movableTokens.includes(tokenIndex)) {
      console.log(`[LUDO] Token ${tokenIndex} not movable`);
      return false;
    }

    if (diceValue === null) {
      console.log(`[LUDO] No dice value`);
      return false;
    }

    const player = players[currentPlayerIndex];
    const token = player.tokens[tokenIndex];
    const endPos = calculateEndPosition(token, diceValue);

    if (endPos === null) {
      console.log(`[LUDO] Invalid move calculation`);
      return false;
    }

    const startPos = token.position;
    const dice = diceValue;

    console.log(`[LUDO] Moving ${player.color} token#${tokenIndex}: ${startPos} -> ${endPos}`);

    setPhase('ANIMATING');
    setMovableTokens([]);

    // Animate the move step by step
    const totalSteps = startPos === -1 ? 1 : dice;
    const positions: number[] = [];
    
    if (startPos === -1) {
      positions.push(0);
    } else {
      for (let i = 1; i <= totalSteps; i++) {
        positions.push(startPos + i);
      }
    }

    let stepIndex = 0;

    const performStep = () => {
      const stepPosition = positions[stepIndex];
      stepIndex++;

      onSoundPlay?.('ludo_move');

      // Update token position
      setPlayers(prev => prev.map((p, pIdx) => ({
        ...p,
        tokens: p.tokens.map((t, tIdx) => {
          if (pIdx === currentPlayerIndex && tIdx === tokenIndex) {
            return { ...t, position: stepPosition };
          }
          return t;
        })
      })));

      if (stepIndex >= totalSteps) {
        // Animation complete - handle captures and check winner
        animationRef.current = setTimeout(() => {
          handleMoveComplete(currentPlayerIndex, tokenIndex, endPos, dice);
        }, 100);
      } else {
        animationRef.current = setTimeout(performStep, 150);
      }
    };

    animationRef.current = setTimeout(performStep, 100);
    return true;
  }, [phase, movableTokens, diceValue, players, currentPlayerIndex, calculateEndPosition, onSoundPlay]);

  // Execute move - backwards compatible wrapper
  const executeMove = useCallback((
    playerIndex: number,
    tokenIndex: number,
    dice: number,
    onComplete?: () => void
  ): boolean => {
    // Store callback for when move completes
    if (onComplete) {
      moveCompleteCallbackRef.current = onComplete;
    }
    return selectToken(tokenIndex);
  }, [selectToken]);

  // Ref for move complete callback (backwards compatibility)
  const moveCompleteCallbackRef = useRef<(() => void) | null>(null);

  // Handle move completion (captures, winner check, turn advance)
  const handleMoveComplete = useCallback((playerIndex: number, tokenIndex: number, endPos: number, dice: number) => {
    setPlayers(prev => {
      const newPlayers = prev.map(p => ({
        ...p,
        tokens: p.tokens.map(t => ({ ...t }))
      }));

      // Ensure exact position
      newPlayers[playerIndex].tokens[tokenIndex].position = endPos;

      // Check for captures (only on main track 0-55, not in home column or finish)
      if (endPos >= 0 && endPos <= MAIN_TRACK_END) {
        const movingPlayer = newPlayers[playerIndex];
        const myAbsPos = (endPos + movingPlayer.startPosition) % TRACK_SIZE;
        const isLandingOnSafeSquare = SAFE_SQUARES.includes(myAbsPos);

        if (!isLandingOnSafeSquare) {
          newPlayers.forEach((otherPlayer, opi) => {
            if (opi !== playerIndex) {
              otherPlayer.tokens.forEach((otherToken, oti) => {
                if (otherToken.position >= 0 && otherToken.position <= MAIN_TRACK_END) {
                  const otherAbsPos = (otherToken.position + otherPlayer.startPosition) % TRACK_SIZE;

                  if (otherAbsPos === myAbsPos) {
                    // CAPTURE!
                    setCaptureEvent({
                      capturedColor: otherPlayer.color,
                      capturingColor: movingPlayer.color,
                      position: [7, 7], // Center placeholder, animation uses fromPosition
                      tokenId: oti,
                      fromPosition: otherToken.position,
                    });
                    newPlayers[opi].tokens[oti].position = -1;
                    console.log(`[LUDO] CAPTURE: ${movingPlayer.color} captured ${otherPlayer.color} token#${oti}`);
                    onSoundPlay?.('ludo_capture');
                    onToast?.("Captured!", `${movingPlayer.color} captured ${otherPlayer.color}'s token!`);
                  }
                }
              });
            }
          });
        }
      }

      // Check for winner
      const winnerColor = checkWinner(newPlayers);
      if (winnerColor) {
        setWinner(winnerColor);
        setPhase('GAME_OVER');
        onSoundPlay?.(winnerColor === 'gold' ? 'ludo_win' : 'ludo_lose');
        console.log(`[LUDO] WINNER: ${winnerColor}`);
      }

      return newPlayers;
    });

    // Call the move complete callback if set (backwards compatibility)
    if (moveCompleteCallbackRef.current) {
      const callback = moveCompleteCallbackRef.current;
      moveCompleteCallbackRef.current = null;
      setTimeout(() => callback(), 50);
      return; // Let the callback handle turn advancement
    }

    // If no callback, handle turn advancement ourselves
    setTimeout(() => {
      if (winner) return;

      setDiceValue(null);

      // Rolled 6 = bonus turn (same player), otherwise next player
      if (dice === 6) {
        console.log(`[LUDO] Bonus turn! Rolled 6, ${players[playerIndex].color} goes again.`);
        setPhase('WAITING_FOR_ROLL');
      } else {
        setConsecutiveSixes(0);
        setCurrentPlayerIndex(prev => (prev + 1) % 4);
        setTurnSignal(prev => prev + 1);
        setPhase('WAITING_FOR_ROLL');
      }
    }, 200);
  }, [checkWinner, onSoundPlay, onToast, winner, players]);

  // Advance turn - backwards compatible
  const advanceTurn = useCallback((diceRolled: number): boolean => {
    const isBonusTurn = diceRolled === 6;
    
    if (!isBonusTurn) {
      setCurrentPlayerIndex(prev => (prev + 1) % 4);
    }
    
    setDiceValue(null);
    setMovableTokens([]);
    setConsecutiveSixes(isBonusTurn ? consecutiveSixes : 0);
    setTurnSignal(prev => prev + 1);
    setPhase('WAITING_FOR_ROLL');
    
    return isBonusTurn;
  }, [consecutiveSixes]);

  // Apply external move - backwards compatible stub
  const applyExternalMove = useCallback((move: LudoMove): boolean => {
    console.log('[LUDO] applyExternalMove called (stub):', move);
    return true;
  }, []);

  // Eliminate player - backwards compatible
  const eliminatePlayer = useCallback((playerIndex: number) => {
    setEliminatedPlayers(prev => new Set([...prev, playerIndex]));
  }, []);

  // Clear capture event after animation
  const clearCaptureEvent = useCallback(() => {
    setCaptureEvent(null);
  }, []);

  // Reset the game
  const resetGame = useCallback(() => {
    // Clear any pending timeouts
    if (animationRef.current) {
      clearTimeout(animationRef.current);
      animationRef.current = null;
    }
    if (diceIntervalRef.current) {
      clearInterval(diceIntervalRef.current);
      diceIntervalRef.current = null;
    }

    setPlayers(initializePlayers());
    setCurrentPlayerIndex(0);
    setPhase('WAITING_FOR_ROLL');
    setDiceValue(null);
    setMovableTokens([]);
    setWinner(null);
    setConsecutiveSixes(0);
    setCaptureEvent(null);
    setEliminatedPlayers(new Set());
    setTurnSignal(0);
    setGameId(prev => prev + 1);
    moveCompleteCallbackRef.current = null;

    console.log('[LUDO] Game reset');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) clearTimeout(animationRef.current);
      if (diceIntervalRef.current) clearInterval(diceIntervalRef.current);
    };
  }, []);

  return {
    // State
    players,
    currentPlayerIndex,
    currentPlayer,
    phase,
    diceValue,
    movableTokens,
    winner,
    captureEvent,
    gameId,
    
    // Backwards compatibility exports
    turnSignal,
    eliminatedPlayers,
    gameOver: winner, // Alias
    isRolling: phase === 'ROLLING',
    isAnimating: phase === 'ANIMATING',
    
    // Actions
    rollDice,
    selectToken,
    executeMove,
    applyExternalMove,
    advanceTurn,
    resetGame,
    eliminatePlayer,
    clearCaptureEvent,
    
    // Setters for backwards compatibility
    setDiceValue,
    setMovableTokens,
    setCurrentPlayerIndex,
  };
}
