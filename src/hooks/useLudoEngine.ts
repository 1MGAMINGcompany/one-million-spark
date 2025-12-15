import { useState, useCallback, useRef, useEffect } from "react";
import { Player, PlayerColor, Token, initializePlayers } from "@/components/ludo/ludoTypes";

export interface LudoMove {
  playerIndex: number;
  tokenIndex: number;
  diceValue: number;
  startPosition: number;
  endPosition: number;
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
  
  // Use refs to avoid stale closures and prevent double execution
  const playersRef = useRef(players);
  const currentPlayerIndexRef = useRef(currentPlayerIndex);
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  const moveInProgressRef = useRef(false);
  const consumedDiceRef = useRef<number | null>(null);
  
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { currentPlayerIndexRef.current = currentPlayerIndex; }, [currentPlayerIndex]);

  const currentPlayer = players[currentPlayerIndex];

  // Calculate valid moves for a player given a dice roll
  const getMovableTokens = useCallback((player: Player, dice: number): number[] => {
    const movable: number[] = [];
    player.tokens.forEach((token, index) => {
      if (token.position === -1 && dice === 6) {
        movable.push(index);
      } else if (token.position >= 0 && token.position < 57) {
        const newPos = token.position + dice;
        if (newPos <= 57) {
          movable.push(index);
        }
      }
    });
    return movable;
  }, []);

  // Calculate end position for a move - pure function, no side effects
  const calculateEndPosition = useCallback((token: Token, dice: number): number | null => {
    if (token.position === -1 && dice === 6) {
      return 0; // Leave home
    } else if (token.position >= 0 && token.position < 57) {
      const newPos = token.position + dice;
      if (newPos <= 57) {
        return newPos;
      }
    }
    return null; // Invalid move
  }, []);

  // Animate movement step by step with guaranteed correct final position
  const animateMovement = useCallback((
    playerIndex: number,
    tokenIndex: number,
    startPos: number,
    endPos: number,
    onComplete: () => void
  ) => {
    // Clear any pending animation
    if (animationRef.current) {
      clearTimeout(animationRef.current);
    }
    
    setIsAnimating(true);
    
    // For leaving home (-1 to 0), it's a single step
    const totalSteps = startPos === -1 ? 1 : Math.abs(endPos - startPos);
    let currentStep = 0;
    
    console.log(`[LUDO ENGINE] Animating: ${startPos} -> ${endPos}, ${totalSteps} steps`);
    
    const performStep = () => {
      currentStep++;
      
      // Calculate intermediate position
      let stepPosition: number;
      if (startPos === -1) {
        stepPosition = 0;
      } else {
        stepPosition = startPos + currentStep;
      }
      
      console.log(`[LUDO ENGINE] Step ${currentStep}/${totalSteps}: pos=${stepPosition}`);
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
      
      if (currentStep >= totalSteps) {
        // Animation complete - force exact final position
        setPlayers(prev => prev.map((p, pIdx) => ({
          ...p,
          tokens: p.tokens.map((t, tIdx) => {
            if (pIdx === playerIndex && tIdx === tokenIndex) {
              console.log(`[LUDO ENGINE] Final position: ${endPos}`);
              return { ...t, position: endPos };
            }
            return t;
          })
        })));
        
        setIsAnimating(false);
        onComplete();
      } else {
        // Schedule next step
        animationRef.current = setTimeout(performStep, 150);
      }
    };
    
    // Start animation
    animationRef.current = setTimeout(performStep, 150);
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
    
    // Validate the distance matches dice
    const expectedDistance = startPos === -1 ? 1 : (endPos - startPos);
    if (startPos >= 0 && expectedDistance !== dice) {
      console.error(`[LUDO ENGINE] Distance mismatch! Expected ${dice}, got ${expectedDistance}`);
      moveInProgressRef.current = false;
      consumedDiceRef.current = null;
      return false;
    }
    
    console.log(`[LUDO ENGINE] Move: ${player.color} token#${tokenIndex} from ${startPos} to ${endPos} (dice=${dice})`);
    
    animateMovement(playerIndex, tokenIndex, startPos, endPos, () => {
      // After animation: check captures
      setPlayers(prev => {
        const newPlayers = prev.map(p => ({
          ...p,
          tokens: p.tokens.map(t => ({ ...t }))
        }));
        
        // Verify final position is correct
        if (newPlayers[playerIndex].tokens[tokenIndex].position !== endPos) {
          console.warn(`[LUDO ENGINE] Correcting position to ${endPos}`);
          newPlayers[playerIndex].tokens[tokenIndex].position = endPos;
        }
        
        // Check for captures (only on main track, positions 0-51)
        if (endPos >= 0 && endPos < 52) {
          const movingPlayer = newPlayers[playerIndex];
          const myAbsPos = (endPos + movingPlayer.startPosition) % 52;
          
          newPlayers.forEach((otherPlayer, opi) => {
            if (opi !== playerIndex) {
              otherPlayer.tokens.forEach((otherToken, oti) => {
                if (otherToken.position >= 0 && otherToken.position < 52) {
                  const otherAbsPos = (otherToken.position + otherPlayer.startPosition) % 52;
                  if (otherAbsPos === myAbsPos) {
                    newPlayers[opi].tokens[oti].position = -1;
                    console.log(`[LUDO ENGINE] Capture: ${movingPlayer.color} captured ${otherPlayer.color} token#${oti}`);
                    onSoundPlay?.('ludo_capture');
                    onToast?.("Captured!", `${movingPlayer.color} captured ${otherPlayer.color}'s token!`);
                  }
                }
              });
            }
          });
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

  // Check for winner
  const checkWinner = useCallback((playersToCheck: Player[]): PlayerColor | null => {
    for (const player of playersToCheck) {
      if (player.tokens.every(t => t.position === 57)) {
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
    
    setIsRolling(true);
    onSoundPlay?.('ludo_dice');
    
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
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
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
    
    // Actions
    rollDice,
    executeMove,
    applyExternalMove,
    advanceTurn,
    resetGame,
    getMovableTokens,
    calculateEndPosition,
    
    // Setters for external control
    setCurrentPlayerIndex,
    setDiceValue,
    setMovableTokens,
    setGameOver,
  };
}
