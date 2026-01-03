/**
 * Ludo Game Engine - Pure TypeScript, No React Dependencies
 * 
 * This is a deterministic state machine that handles all game logic.
 * It can be used for both AI and multiplayer modes.
 * 
 * Rules implemented:
 * - Roll 6 to leave BASE
 * - Move exact dice steps clockwise on TRACK
 * - Enter HOME_PATH after completing track circuit
 * - Exact roll required for FINISHED
 * - Capture opponent tokens (except on safe squares)
 * - Bonus turn on rolling 6
 * - Three consecutive 6s = forfeit turn
 */

import {
  GameState,
  GamePhase,
  Player,
  Token,
  TokenState,
  Move,
  MoveResult,
  PlayerColor,
  TRACK_SIZE,
  HOME_PATH_SIZE,
  TOKENS_PER_PLAYER,
  START_POSITIONS,
  SAFE_SQUARES,
  createInitialState,
} from './types';

import { getAbsoluteTrackPosition } from './board';

/**
 * Deep clone game state to ensure immutability
 */
function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Roll the dice and compute legal moves
 */
export function rollDice(state: GameState): { 
  newState: GameState; 
  diceValue: number;
  legalMoves: Move[];
  turnForfeited: boolean;
} {
  if (state.phase !== 'WAITING_ROLL') {
    throw new Error(`Cannot roll dice in phase: ${state.phase}`);
  }
  
  const diceValue = Math.floor(Math.random() * 6) + 1;
  const newState = cloneState(state);
  
  newState.diceValue = diceValue;
  
  // Check for three consecutive 6s
  if (diceValue === 6) {
    newState.consecutiveSixes += 1;
    
    if (newState.consecutiveSixes >= 3) {
      // Forfeit turn - move to next player
      newState.consecutiveSixes = 0;
      newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
      newState.phase = 'WAITING_ROLL';
      newState.diceValue = null;
      newState.legalMoves = [];
      
      return { newState, diceValue, legalMoves: [], turnForfeited: true };
    }
  } else {
    newState.consecutiveSixes = 0;
  }
  
  // Compute legal moves
  const legalMoves = computeLegalMoves(newState, newState.currentPlayerIndex, diceValue);
  newState.legalMoves = legalMoves;
  newState.phase = 'ROLLED';
  
  return { newState, diceValue, legalMoves, turnForfeited: false };
}

/**
 * Compute all legal moves for current player with given dice value
 */
export function computeLegalMoves(
  state: GameState,
  playerIndex: number,
  diceValue: number
): Move[] {
  const player = state.players[playerIndex];
  const moves: Move[] = [];
  
  for (let tokenIndex = 0; tokenIndex < TOKENS_PER_PLAYER; tokenIndex++) {
    const token = player.tokens[tokenIndex];
    const move = computeTokenMove(state, playerIndex, tokenIndex, diceValue);
    
    if (move !== null) {
      moves.push(move);
    }
  }
  
  return moves;
}

/**
 * Compute move for a specific token, returns null if not legal
 */
function computeTokenMove(
  state: GameState,
  playerIndex: number,
  tokenIndex: number,
  diceValue: number
): Move | null {
  const player = state.players[playerIndex];
  const token = player.tokens[tokenIndex];
  
  switch (token.state) {
    case 'BASE':
      return computeBaseMove(state, playerIndex, tokenIndex, diceValue);
    
    case 'TRACK':
      return computeTrackMove(state, playerIndex, tokenIndex, diceValue);
    
    case 'HOME_PATH':
      return computeHomePathMove(state, playerIndex, tokenIndex, diceValue);
    
    case 'FINISHED':
      return null; // Cannot move finished tokens
    
    default:
      return null;
  }
}

/**
 * Compute move for token in BASE
 */
function computeBaseMove(
  state: GameState,
  playerIndex: number,
  tokenIndex: number,
  diceValue: number
): Move | null {
  // Can only leave base on a 6
  if (diceValue !== 6) {
    return null;
  }
  
  const player = state.players[playerIndex];
  const startPos = START_POSITIONS[player.color];
  
  // Check if own token is on start position
  const ownTokenOnStart = player.tokens.some(
    (t, i) => i !== tokenIndex && t.state === 'TRACK' && t.position === startPos
  );
  
  if (ownTokenOnStart) {
    return null; // Cannot move to square occupied by own token
  }
  
  // Check for capture
  const capture = findCaptureOnPosition(state, playerIndex, startPos);
  
  return {
    tokenIndex,
    fromState: 'BASE',
    fromPosition: null,
    toState: 'TRACK',
    toPosition: startPos,
    isCapture: capture !== null,
    capturedToken: capture ?? undefined,
  };
}

/**
 * Compute move for token on TRACK
 */
function computeTrackMove(
  state: GameState,
  playerIndex: number,
  tokenIndex: number,
  diceValue: number
): Move | null {
  const player = state.players[playerIndex];
  const token = player.tokens[tokenIndex];
  
  if (token.position === null) {
    throw new Error('TRACK token must have position');
  }
  
  // Calculate distance traveled from start
  const startPos = START_POSITIONS[player.color];
  let distanceFromStart = token.position - startPos;
  if (distanceFromStart < 0) {
    distanceFromStart += TRACK_SIZE;
  }
  
  const newDistanceFromStart = distanceFromStart + diceValue;
  
  // Check if entering home path
  // Player must travel 51 cells on track before entering home path (cell 52 = home path entry)
  // HOME_PATH has 6 cells (positions 0-5), FINISHED is position 6
  if (newDistanceFromStart >= TRACK_SIZE) {
    // Entering or moving through home path
    const homePathPosition = newDistanceFromStart - TRACK_SIZE;
    
    if (homePathPosition > HOME_PATH_SIZE) {
      // Overshooting - would go past FINISHED
      return null;
    }
    
    if (homePathPosition === HOME_PATH_SIZE) {
      // Exact roll to finish (landed on position 6 = FINISHED)
      return {
        tokenIndex,
        fromState: 'TRACK',
        fromPosition: token.position,
        toState: 'FINISHED',
        toPosition: null,
        isCapture: false,
      };
    }
    
    // Landing on HOME_PATH (positions 0-5)
    // Check if own token in home path position
    const ownTokenInPath = player.tokens.some(
      (t, i) => i !== tokenIndex && t.state === 'HOME_PATH' && t.position === homePathPosition
    );
    
    if (ownTokenInPath) {
      return null;
    }
    
    return {
      tokenIndex,
      fromState: 'TRACK',
      fromPosition: token.position,
      toState: 'HOME_PATH',
      toPosition: homePathPosition,
      isCapture: false,
    };
  }
  
  // Normal track movement
  const newPosition = (token.position + diceValue) % TRACK_SIZE;
  
  // Check if own token on destination
  const ownTokenOnDest = player.tokens.some(
    (t, i) => i !== tokenIndex && t.state === 'TRACK' && t.position === newPosition
  );
  
  if (ownTokenOnDest) {
    return null;
  }
  
  // Check for capture
  const capture = findCaptureOnPosition(state, playerIndex, newPosition);
  
  return {
    tokenIndex,
    fromState: 'TRACK',
    fromPosition: token.position,
    toState: 'TRACK',
    toPosition: newPosition,
    isCapture: capture !== null,
    capturedToken: capture ?? undefined,
  };
}

/**
 * Compute move for token in HOME_PATH
 * HOME_PATH positions: 0-5 (6 cells)
 * FINISHED = conceptually position 6
 */
function computeHomePathMove(
  state: GameState,
  playerIndex: number,
  tokenIndex: number,
  diceValue: number
): Move | null {
  const player = state.players[playerIndex];
  const token = player.tokens[tokenIndex];
  
  if (token.position === null) {
    throw new Error('HOME_PATH token must have position');
  }
  
  const newPosition = token.position + diceValue;
  
  // Check for overshoot (past FINISHED)
  if (newPosition > HOME_PATH_SIZE) {
    return null;
  }
  
  // Check for exact finish
  if (newPosition === HOME_PATH_SIZE) {
    // Exact roll to finish! (e.g., from position 4, roll 2, land on position 6 = FINISHED)
    return {
      tokenIndex,
      fromState: 'HOME_PATH',
      fromPosition: token.position,
      toState: 'FINISHED',
      toPosition: null,
      isCapture: false,
    };
  }
  
  // Normal HOME_PATH movement (newPosition is 0-5)
  // Check if own token on destination
  const ownTokenOnDest = player.tokens.some(
    (t, i) => i !== tokenIndex && t.state === 'HOME_PATH' && t.position === newPosition
  );
  
  if (ownTokenOnDest) {
    return null;
  }
  
  return {
    tokenIndex,
    fromState: 'HOME_PATH',
    fromPosition: token.position,
    toState: 'HOME_PATH',
    toPosition: newPosition,
    isCapture: false,
  };
}

/**
 * Find if there's an opponent token to capture at given track position
 * Returns null if safe square or no opponent token
 */
function findCaptureOnPosition(
  state: GameState,
  playerIndex: number,
  trackPosition: number
): { playerIndex: number; tokenIndex: number } | null {
  // Safe squares - no captures allowed
  if (SAFE_SQUARES.includes(trackPosition)) {
    return null;
  }
  
  // Check all other players
  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    
    const opponent = state.players[pi];
    for (let ti = 0; ti < opponent.tokens.length; ti++) {
      const token = opponent.tokens[ti];
      if (token.state === 'TRACK' && token.position === trackPosition) {
        return { playerIndex: pi, tokenIndex: ti };
      }
    }
  }
  
  return null;
}

/**
 * Execute a move and return new state
 */
export function executeMove(state: GameState, move: Move): MoveResult {
  if (state.phase !== 'ROLLED') {
    throw new Error(`Cannot execute move in phase: ${state.phase}`);
  }
  
  // Validate move is legal
  const isLegal = state.legalMoves.some(
    m => m.tokenIndex === move.tokenIndex && 
         m.toState === move.toState && 
         m.toPosition === move.toPosition
  );
  
  if (!isLegal) {
    throw new Error('Illegal move');
  }
  
  const newState = cloneState(state);
  const player = newState.players[newState.currentPlayerIndex];
  const token = player.tokens[move.tokenIndex];
  
  // Execute the move
  token.state = move.toState;
  token.position = move.toPosition;
  
  // Handle capture
  let captured: { playerIndex: number; tokenIndex: number } | null = null;
  if (move.isCapture && move.capturedToken) {
    captured = move.capturedToken;
    const capturedPlayer = newState.players[captured.playerIndex];
    const capturedToken = capturedPlayer.tokens[captured.tokenIndex];
    capturedToken.state = 'BASE';
    capturedToken.position = null;
  }
  
  // Check for win
  const finished = move.toState === 'FINISHED';
  const allFinished = player.tokens.every(t => t.state === 'FINISHED');
  
  if (allFinished) {
    newState.winner = player.color;
    newState.phase = 'GAME_OVER';
    
    return {
      newState,
      move,
      captured,
      finished,
      bonusTurn: false,
      gameWon: true,
    };
  }
  
  // Determine if bonus turn (rolled 6)
  const bonusTurn = newState.diceValue === 6;
  
  // Set phase to animating (UI will call advanceTurn after animation)
  newState.phase = 'ANIMATING';
  
  return {
    newState,
    move,
    captured,
    finished,
    bonusTurn,
    gameWon: false,
  };
}

/**
 * Advance to next turn after animation completes
 */
export function advanceTurn(state: GameState, bonusTurn: boolean): GameState {
  if (state.phase !== 'ANIMATING') {
    throw new Error(`Cannot advance turn in phase: ${state.phase}`);
  }
  
  const newState = cloneState(state);
  
  if (bonusTurn) {
    // Same player rolls again
    newState.phase = 'WAITING_ROLL';
    newState.diceValue = null;
    newState.legalMoves = [];
  } else {
    // Next player
    newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
    newState.phase = 'WAITING_ROLL';
    newState.diceValue = null;
    newState.legalMoves = [];
    newState.consecutiveSixes = 0;
  }
  
  return newState;
}

/**
 * Skip turn when no legal moves available
 */
export function skipTurn(state: GameState): GameState {
  if (state.phase !== 'ROLLED') {
    throw new Error(`Cannot skip turn in phase: ${state.phase}`);
  }
  
  if (state.legalMoves.length > 0) {
    throw new Error('Cannot skip turn when legal moves exist');
  }
  
  const newState = cloneState(state);
  
  // Check if bonus turn (rolled 6 but no moves)
  if (newState.diceValue === 6) {
    // Same player rolls again
    newState.phase = 'WAITING_ROLL';
    newState.diceValue = null;
    newState.legalMoves = [];
  } else {
    // Next player
    newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
    newState.phase = 'WAITING_ROLL';
    newState.diceValue = null;
    newState.legalMoves = [];
    newState.consecutiveSixes = 0;
  }
  
  return newState;
}

/**
 * Get current player
 */
export function getCurrentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

/**
 * Check if it's a specific player's turn
 */
export function isPlayerTurn(state: GameState, playerIndex: number): boolean {
  return state.currentPlayerIndex === playerIndex && 
         (state.phase === 'WAITING_ROLL' || state.phase === 'ROLLED');
}

// Re-export for convenience
export { createInitialState };
