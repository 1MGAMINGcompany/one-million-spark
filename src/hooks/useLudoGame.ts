/**
 * React Hook for Ludo Game
 * 
 * Wraps the pure LudoEngine for React consumption.
 * Handles animations as a separate concern.
 * Works for both AI and multiplayer modes.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  GameState,
  Move,
  MoveResult,
  PlayerColor,
  createInitialState,
} from '@/lib/ludo/types';
import {
  rollDice as engineRollDice,
  executeMove as engineExecuteMove,
  advanceTurn as engineAdvanceTurn,
  skipTurn as engineSkipTurn,
  getCurrentPlayer,
} from '@/lib/ludo/engine';
import { selectAIMove, getAIDelay, Difficulty } from '@/lib/ludo/ai';

export interface LudoGameOptions {
  playerCount?: number;
  humanPlayerIndex?: number;
  difficulty?: Difficulty;
  onStateChange?: (state: GameState) => void;
  onDiceRolled?: (value: number) => void;
  onTokenMoved?: (move: Move) => void;
  onCapture?: (captured: { playerIndex: number; tokenIndex: number }) => void;
  onTurnChange?: (playerIndex: number) => void;
  onGameOver?: (winner: PlayerColor) => void;
}

export interface AnimatingMove {
  move: Move;
  result: MoveResult;
}

export function useLudoGame(options: LudoGameOptions = {}) {
  const {
    playerCount = 4,
    humanPlayerIndex = 0,
    difficulty = 'medium',
    onStateChange,
    onDiceRolled,
    onTokenMoved,
    onCapture,
    onTurnChange,
    onGameOver,
  } = options;

  // Game state
  const [gameState, setGameState] = useState<GameState>(() => 
    createInitialState(playerCount, humanPlayerIndex)
  );
  
  // Animation state (separate from game logic)
  const [animatingMove, setAnimatingMove] = useState<AnimatingMove | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  
  // Refs for callbacks to avoid stale closures
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  
  const pendingBonusTurn = useRef(false);
  
  // Update state and notify
  const updateState = useCallback((newState: GameState) => {
    setGameState(newState);
    onStateChange?.(newState);
  }, [onStateChange]);
  
  // Roll dice action
  const rollDice = useCallback(() => {
    const state = gameStateRef.current;
    
    if (state.phase !== 'WAITING_ROLL') {
      console.warn('Cannot roll: not waiting for roll');
      return;
    }
    
    setIsRolling(true);
    
    // Simulate dice animation delay
    setTimeout(() => {
      const { newState, diceValue, legalMoves, turnForfeited } = engineRollDice(state);
      
      setIsRolling(false);
      updateState(newState);
      onDiceRolled?.(diceValue);
      
      if (turnForfeited) {
        console.log('Three 6s! Turn forfeited.');
        onTurnChange?.(newState.currentPlayerIndex);
      }
    }, 500);
  }, [updateState, onDiceRolled, onTurnChange]);
  
  // Select token to move
  const selectToken = useCallback((tokenIndex: number) => {
    const state = gameStateRef.current;
    
    if (state.phase !== 'ROLLED') {
      console.warn('Cannot select token: not waiting for move');
      return;
    }
    
    const move = state.legalMoves.find(m => m.tokenIndex === tokenIndex);
    if (!move) {
      console.warn('Not a legal move for this token');
      return;
    }
    
    // Execute move
    const result = engineExecuteMove(state, move);
    
    // Store bonus turn flag
    pendingBonusTurn.current = result.bonusTurn;
    
    // Start animation
    setAnimatingMove({ move, result });
    updateState(result.newState);
    
    onTokenMoved?.(move);
    
    if (result.captured) {
      onCapture?.(result.captured);
    }
    
    if (result.gameWon) {
      onGameOver?.(result.newState.winner!);
    }
  }, [updateState, onTokenMoved, onCapture, onGameOver]);
  
  // Called when animation completes
  const onMoveAnimationComplete = useCallback(() => {
    const state = gameStateRef.current;
    
    if (state.phase !== 'ANIMATING') {
      return;
    }
    
    const bonusTurn = pendingBonusTurn.current;
    pendingBonusTurn.current = false;
    
    const newState = engineAdvanceTurn(state, bonusTurn);
    
    setAnimatingMove(null);
    updateState(newState);
    
    if (!bonusTurn) {
      onTurnChange?.(newState.currentPlayerIndex);
    }
  }, [updateState, onTurnChange]);
  
  // Skip turn when no legal moves
  const skipCurrentTurn = useCallback(() => {
    const state = gameStateRef.current;
    
    if (state.phase !== 'ROLLED' || state.legalMoves.length > 0) {
      return;
    }
    
    const newState = engineSkipTurn(state);
    updateState(newState);
    
    const prevPlayer = state.currentPlayerIndex;
    if (newState.currentPlayerIndex !== prevPlayer) {
      onTurnChange?.(newState.currentPlayerIndex);
    }
  }, [updateState, onTurnChange]);
  
  // Reset game
  const resetGame = useCallback(() => {
    const newState = createInitialState(playerCount, humanPlayerIndex);
    setAnimatingMove(null);
    setIsRolling(false);
    pendingBonusTurn.current = false;
    updateState(newState);
  }, [playerCount, humanPlayerIndex, updateState]);
  
  // AI turn handling
  useEffect(() => {
    const state = gameState;
    
    // Don't act if game is over or animating
    if (state.phase === 'GAME_OVER' || state.phase === 'ANIMATING' || isRolling) {
      return;
    }
    
    const currentPlayer = getCurrentPlayer(state);
    
    // Only act for AI players
    if (!currentPlayer.isAI) {
      return;
    }
    
    const delays = getAIDelay(difficulty);
    
    if (state.phase === 'WAITING_ROLL') {
      // AI rolls dice
      const timeout = setTimeout(() => {
        rollDice();
      }, delays.roll);
      
      return () => clearTimeout(timeout);
    }
    
    if (state.phase === 'ROLLED') {
      if (state.legalMoves.length === 0) {
        // No legal moves, skip turn
        const timeout = setTimeout(() => {
          skipCurrentTurn();
        }, delays.move);
        
        return () => clearTimeout(timeout);
      }
      
      // AI selects a move
      const timeout = setTimeout(() => {
        const move = selectAIMove(state, difficulty);
        if (move) {
          selectToken(move.tokenIndex);
        }
      }, delays.move);
      
      return () => clearTimeout(timeout);
    }
  }, [gameState, isRolling, difficulty, rollDice, selectToken, skipCurrentTurn]);
  
  // Derived state
  const currentPlayer = getCurrentPlayer(gameState);
  const isHumanTurn = !currentPlayer.isAI && 
                      (gameState.phase === 'WAITING_ROLL' || gameState.phase === 'ROLLED');
  const canRoll = gameState.phase === 'WAITING_ROLL' && !currentPlayer.isAI;
  const canMove = gameState.phase === 'ROLLED' && 
                  !currentPlayer.isAI && 
                  gameState.legalMoves.length > 0;
  const movableTokenIndices = gameState.legalMoves.map(m => m.tokenIndex);
  
  return {
    // State
    gameState,
    currentPlayer,
    diceValue: gameState.diceValue,
    winner: gameState.winner,
    phase: gameState.phase,
    isGameOver: gameState.phase === 'GAME_OVER',
    
    // UI state
    isRolling,
    animatingMove,
    isHumanTurn,
    canRoll,
    canMove,
    movableTokenIndices,
    
    // Actions
    rollDice,
    selectToken,
    onMoveAnimationComplete,
    resetGame,
    
    // For multiplayer sync
    setGameState: updateState,
  };
}
