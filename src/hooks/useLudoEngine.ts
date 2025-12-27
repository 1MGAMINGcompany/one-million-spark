import { useState, useCallback, useRef, useEffect } from "react";
import { Player, PlayerColor, Token, initializePlayers, TRACK_SIZE, SAFE_SQUARES } from "@/components/ludo/ludoTypes";

// Constants for game positions
// Position -1 = in home base (not on board yet)
// Position 0-55 = on main track (56 cells for full lap)
// Position 56-61 = in home column (6 cells leading to center)
// Position 62 = finished (reached home/center)
const FINISH_POSITION = 62;

export interface LudoMove {
  playerIndex: number;
  tokenIndex: number;
  diceValue: number;
  startPosition: number;
  endPosition: number;
}

export interface LudoCaptureEvent {
  id: string;
  color: PlayerColor;
  tokenId: number;
  fromPosition: number;
  startTime: number;
}

interface UseLudoEngineOptions {
  onSoundPlay?: (sound: string) => void;
  onToast?: (title: string, description: string, variant?: "default" | "destructive") => void;
}

export function useLudoEngine(options: UseLudoEngineOptions = {}) {
  const { onSoundPlay, onToast } = options;
  
  const [players, setPlayers] = useState<Player[]>(() => initializePlayers());
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [gameOver, setGameOver] = useState<PlayerColor | null>(null);
  const [movableTokens, setMovableTokens] = useState<number[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [turnSignal, setTurnSignal] = useState(0); // Increments on every turn to force re-renders
  const [captureEvent, setCaptureEvent] = useState<LudoCaptureEvent | null>(null);
  
  // Use refs to avoid stale closures and prevent double execution
  const playersRef = useRef(players);
  const currentPlayerIndexRef = useRef(currentPlayerIndex);
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  const diceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const moveInProgressRef = useRef(false);
  const consumedDiceRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { currentPlayerIndexRef.current = currentPlayerIndex; }, [currentPlayerIndex]);

  const currentPlayer = players[currentPlayerIndex];

  // Calculate valid moves for a player given a dice roll
  // IMPORTANT: Position logic in Ludo:
  // - Position -1: token is in home base
  // - Position 0-54: token is on main track (relative to player's start)  
  // - Position 55: last position on main track before home column entry
  // - Position 56-61: home column (6 cells)
  // - Position 62: finished (home/center)
  // Note: Each player has 56 cells to travel (0-55 on track, then 56-61 in home column)
  const HOME_COLUMN_START = 56; // Position where home column begins
  const HOME_COLUMN_END = 61;   // Last position in home column
  const FINISH_POS = 62;        // Finished position
  
  const getMovableTokens = useCallback((player: Player, dice: number): number[] => {
    const movable: number[] = [];
    player.tokens.forEach((token, index) => {
      if (token.position === -1 && dice === 6) {
        // Can leave home base with a 6
        movable.push(index);
      } else if (token.position >= 0 && token.position < FINISH_POS) {
        const newPos = token.position + dice;
        // Token on main track (0-51) or in home column (52-57)
        // Must land exactly on FINISH_POS (58), cannot overshoot
        if (newPos <= FINISH_POS) {
          movable.push(index);
        }
      }
    });
    return movable;
  }, []);

  // Calculate end position for a move - pure function, no side effects
  const calculateEndPosition = useCallback((token: Token, dice: number): number | null => {
    const FINISH_POS = 62;
    
    if (token.position === -1 && dice === 6) {
      return 0; // Leave home base, enter at position 0
    } else if (token.position >= 0 && token.position < FINISH_POS) {
      const newPos = token.position + dice;
      // Must land exactly on finish (62), cannot overshoot
      if (newPos <= FINISH_POS) {
        return newPos;
      }
    }
    return null; // Invalid move
  }, []);

  // Animate movement step by step with STRICT position control
  const animateMovement = useCallback((
    playerIndex: number,
    tokenIndex: number,
    startPos: number,
    endPos: number,
    diceUsed: number,
    onComplete: () => void
  ) => {
    // Clear any pending animation
    if (animationRef.current) {
      clearTimeout(animationRef.current);
      animationRef.current = null;
    }
    
    if (!isMountedRef.current) return;
    
    setIsAnimating(true);
    
    // CRITICAL: Calculate steps based on dice used, not position difference
    // For leaving home (-1 to 0), dice 6 is used but only 1 visual step needed
    const totalSteps = startPos === -1 ? 1 : diceUsed;
    
    // Precompute ALL positions to ensure exactness
    const positions: number[] = [];
    if (startPos === -1) {
      positions.push(0); // Just enter the board
    } else {
      for (let i = 1; i <= totalSteps; i++) {
        positions.push(startPos + i);
      }
    }
    
    // Verify final position matches expected
    const expectedFinal = positions[positions.length - 1];
    if (expectedFinal !== endPos) {
      console.error(`[LUDO ENGINE] Position mismatch! Calculated ${expectedFinal}, expected ${endPos}`);
    }
    
    console.log(`[LUDO ENGINE] Animating: ${startPos} -> ${endPos}, dice=${diceUsed}, steps=${totalSteps}, path=[${positions.join(',')}]`);
    
    let stepIndex = 0;
    
    const performStep = () => {
      if (!isMountedRef.current) {
        setIsAnimating(false);
        return;
      }
      
      const stepPosition = positions[stepIndex];
      stepIndex++;
      
      console.log(`[LUDO ENGINE] Step ${stepIndex}/${totalSteps}: pos=${stepPosition}`);
      onSoundPlay?.('ludo_move');
      
      // Update token position for this step
      setPlayers(prev => prev.map((p, pIdx) => ({
        ...p,
        tokens: p.tokens.map((t, tIdx) => {
          if (pIdx === playerIndex && tIdx === tokenIndex) {
            return { ...t, position: stepPosition };
          }
          return t;
        })
      })));
      
      if (stepIndex >= totalSteps) {
        // Animation complete - FORCE exact final position
        animationRef.current = setTimeout(() => {
          if (!isMountedRef.current) {
            setIsAnimating(false);
            return;
          }
          
          setPlayers(prev => prev.map((p, pIdx) => ({
            ...p,
            tokens: p.tokens.map((t, tIdx) => {
              if (pIdx === playerIndex && tIdx === tokenIndex) {
                console.log(`[LUDO ENGINE] Final position enforced: ${endPos}`);
                return { ...t, position: endPos };
              }
              return t;
            })
          })));
          
          setIsAnimating(false);
          onComplete();
        }, 50);
      } else {
        // Schedule next step
        animationRef.current = setTimeout(performStep, 150);
      }
    };
    
    // Start animation after brief delay
    animationRef.current = setTimeout(performStep, 100);
  }, [onSoundPlay]);

  // Execute a move with animation - LOCKS to prevent double execution
  const executeMove = useCallback((
    playerIndex: number,
    tokenIndex: number,
    dice: number,
    onComplete?: () => void
  ): boolean => {
    // CRITICAL: Prevent double execution
    if (moveInProgressRef.current) {
      console.warn(`[LUDO ENGINE] Move already in progress, ignoring`);
      return false;
    }
    
    // Lock immediately
    moveInProgressRef.current = true;
    consumedDiceRef.current = dice;
    
    const player = playersRef.current[playerIndex];
    const token = player.tokens[tokenIndex];
    const startPos = token.position;
    const endPos = calculateEndPosition(token, dice);
    
    if (endPos === null) {
      console.warn(`[LUDO ENGINE] Invalid move: player=${playerIndex}, token=${tokenIndex}, dice=${dice}`);
      moveInProgressRef.current = false;
      consumedDiceRef.current = null;
      return false;
    }
    
    // Validate the distance matches dice (except for home exit which uses 6 to move to position 0)
    if (startPos >= 0) {
      const expectedDistance = endPos - startPos;
      if (expectedDistance !== dice) {
        console.error(`[LUDO ENGINE] Distance mismatch! Dice=${dice}, but ${startPos} -> ${endPos} = ${expectedDistance} steps`);
        moveInProgressRef.current = false;
        consumedDiceRef.current = null;
        return false;
      }
    }
    
    console.log(`[LUDO ENGINE] Move: ${player.color} token#${tokenIndex} from ${startPos} to ${endPos} (dice=${dice})`);
    
    // Pass dice value to animation for strict step counting
    animateMovement(playerIndex, tokenIndex, startPos, endPos, dice, () => {
      // After animation: check captures
      setPlayers(prev => {
        const newPlayers = prev.map(p => ({
          ...p,
          tokens: p.tokens.map(t => ({ ...t }))
        }));
        
        // Verify final position is correct
        const actualPos = newPlayers[playerIndex].tokens[tokenIndex].position;
        if (actualPos !== endPos) {
          console.warn(`[LUDO ENGINE] Position correction: ${actualPos} -> ${endPos}`);
          newPlayers[playerIndex].tokens[tokenIndex].position = endPos;
        }
        
        // Check for captures (only on main track, positions 0-55)
        // Home column (56-61) and finish (62) are safe
        const MAIN_TRACK_END = 55;
        if (endPos >= 0 && endPos <= MAIN_TRACK_END) {
          const movingPlayer = newPlayers[playerIndex];
          // Calculate absolute position on the 56-cell track
          const myAbsPos = (endPos + movingPlayer.startPosition) % TRACK_SIZE;
          
          // Check if landing on a safe square (colored starting squares)
          const isLandingOnSafeSquare = SAFE_SQUARES.includes(myAbsPos);
          
          if (!isLandingOnSafeSquare) {
            // Only capture if NOT on a safe square
            newPlayers.forEach((otherPlayer, opi) => {
              if (opi !== playerIndex) {
                otherPlayer.tokens.forEach((otherToken, oti) => {
                  if (otherToken.position >= 0 && otherToken.position <= MAIN_TRACK_END) {
                    // Calculate the other token's absolute position
                    const otherAbsPos = (otherToken.position + otherPlayer.startPosition) % TRACK_SIZE;
                    
                    console.log(`[LUDO ENGINE] Checking capture: my abs=${myAbsPos}, other ${otherPlayer.color} token#${oti} abs=${otherAbsPos}`);
                    
                    if (otherAbsPos === myAbsPos) {
                      // CAPTURE! Trigger animation before setting position
                      const capturedPosition = otherToken.position;
                      const capturedColor = otherPlayer.color;
                      const capturedTokenId = oti;
                      
                      // Emit capture event for animation
                      setCaptureEvent({
                        id: `${Date.now()}-${capturedColor}-${capturedTokenId}`,
                        color: capturedColor,
                        tokenId: capturedTokenId,
                        fromPosition: capturedPosition,
                        startTime: Date.now(),
                      });
                      
                      // Send token back to home base
                      newPlayers[opi].tokens[oti].position = -1;
                      console.log(`[LUDO ENGINE] Capture: ${movingPlayer.color} captured ${otherPlayer.color} token#${oti} at absolute position ${myAbsPos}`);
                      onSoundPlay?.('ludo_capture');
                      onToast?.("Captured!", `${movingPlayer.color} captured ${otherPlayer.color}'s token!`);
                    }
                  }
                });
              }
            });
          } else {
            console.log(`[LUDO ENGINE] Landing on safe square ${myAbsPos}, no capture possible`);
          }
        }
        
        return newPlayers;
      });
      
      // Release lock after animation completes
      moveInProgressRef.current = false;
      consumedDiceRef.current = null;
      
      onComplete?.();
    });
    
    return true;
  }, [calculateEndPosition, animateMovement, onSoundPlay, onToast]);

  // Check for winner - all 4 tokens at position 62 (finished)
  const checkWinner = useCallback((playersToCheck: Player[]): PlayerColor | null => {
    for (const player of playersToCheck) {
      if (player.tokens.every(t => t.position === FINISH_POSITION)) {
        return player.color;
      }
    }
    return null;
  }, []);

  // Advance to next turn - returns true if same player gets bonus turn (rolled 6)
  const advanceTurn = useCallback((diceRolled: number): boolean => {
    const currentPlayers = playersRef.current;
    const winner = checkWinner(currentPlayers);
    
    if (winner) {
      setGameOver(winner);
      onSoundPlay?.(winner === 'gold' ? 'ludo_win' : 'ludo_lose');
      return false;
    }
    
    const isBonusTurn = diceRolled === 6;
    
    // Only advance turn if dice wasn't 6
    if (!isBonusTurn) {
      setCurrentPlayerIndex(prev => (prev + 1) % 4);
    } else {
      console.log(`[LUDO ENGINE] Bonus turn! Rolled 6, same player continues.`);
    }
    
    setDiceValue(null);
    setMovableTokens([]);
    // CRITICAL: Always increment turnSignal to trigger re-renders for next turn
    setTurnSignal(prev => prev + 1);
    
    return isBonusTurn;
  }, [checkWinner, onSoundPlay]);

  // Roll dice
  const rollDice = useCallback((onRollComplete?: (dice: number, movable: number[]) => void) => {
    if (isRolling || diceValue !== null || isAnimating) return;
    
    // Clear any existing dice interval
    if (diceIntervalRef.current) {
      clearInterval(diceIntervalRef.current);
      diceIntervalRef.current = null;
    }
    
    setIsRolling(true);
    onSoundPlay?.('ludo_dice');
    
    let rolls = 0;
    const maxRolls = 10;
    
    diceIntervalRef.current = setInterval(() => {
      if (!isMountedRef.current) {
        if (diceIntervalRef.current) {
          clearInterval(diceIntervalRef.current);
          diceIntervalRef.current = null;
        }
        return;
      }
      
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      rolls++;
      
      if (rolls >= maxRolls) {
        if (diceIntervalRef.current) {
          clearInterval(diceIntervalRef.current);
          diceIntervalRef.current = null;
        }
        const finalValue = Math.floor(Math.random() * 6) + 1;
        setDiceValue(finalValue);
        setIsRolling(false);
        
        const currentPlayerData = playersRef.current[currentPlayerIndexRef.current];
        const movable = getMovableTokens(currentPlayerData, finalValue);
        setMovableTokens(movable);
        
        console.log(`[LUDO ENGINE] Rolled ${finalValue}, movable: [${movable.join(', ')}]`);
        
        onRollComplete?.(finalValue, movable);
      }
    }, 100);
  }, [isRolling, diceValue, isAnimating, getMovableTokens, onSoundPlay]);

  // Apply an external move (from opponent)
  const applyExternalMove = useCallback((move: LudoMove) => {
    console.log(`[LUDO ENGINE] External move: player=${move.playerIndex}, token=${move.tokenIndex}, to=${move.endPosition}`);
    
    onSoundPlay?.('ludo_move');
    
    // Directly set position without animation for opponent moves
    setPlayers(prev => prev.map((p, pIdx) => ({
      ...p,
      tokens: p.tokens.map((t, tIdx) => {
        if (pIdx === move.playerIndex && tIdx === move.tokenIndex) {
          return { ...t, position: move.endPosition };
        }
        return t;
      })
    })));
    
    // Advance turn after brief delay
    setTimeout(() => {
      if (move.diceValue !== 6) {
        setCurrentPlayerIndex(prev => (prev + 1) % 4);
      }
      setDiceValue(null);
      setMovableTokens([]);
    }, 300);
  }, [onSoundPlay]);

  // Reset game
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
    setTurnSignal(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (animationRef.current) {
        clearTimeout(animationRef.current);
        animationRef.current = null;
      }
      if (diceIntervalRef.current) {
        clearInterval(diceIntervalRef.current);
        diceIntervalRef.current = null;
      }
    };
  }, []);

  // Clear capture event after animation completes
  const clearCaptureEvent = useCallback(() => {
    setCaptureEvent(null);
  }, []);

  return {
    // State
    players,
    currentPlayerIndex,
    currentPlayer,
    diceValue,
    isRolling,
    gameOver,
    movableTokens,
    isAnimating,
    turnSignal,
    captureEvent,
    
    // Actions
    rollDice,
    executeMove,
    applyExternalMove,
    advanceTurn,
    resetGame,
    getMovableTokens,
    calculateEndPosition,
    clearCaptureEvent,
    
    // Setters for external control
    setCurrentPlayerIndex,
    setDiceValue,
    setMovableTokens,
    setGameOver,
  };
}
