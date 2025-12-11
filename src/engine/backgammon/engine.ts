// Backgammon game engine implementation

import type { GameEngine, GameResult, PlayerId } from '../core/types';
import type { BackgammonState, BackgammonMove } from './types';

// Direction of movement for each player
const PLAYER_DIRECTION: Record<PlayerId, number> = {
  'PLAYER_1': -1, // Moves from high index to low (toward 0)
  'PLAYER_2': 1,  // Moves from low index to high (toward 23)
};

// Home board ranges
const HOME_BOARD: Record<PlayerId, { start: number; end: number }> = {
  'PLAYER_1': { start: 0, end: 5 },   // Points 1-6 (indices 0-5)
  'PLAYER_2': { start: 18, end: 23 }, // Points 19-24 (indices 18-23)
};

// Entry point calculation for bar moves
function getEntryPoint(die: number, player: PlayerId): number {
  if (player === 'PLAYER_1') {
    // Player 1 enters from opponent's home (indices 18-23)
    return 24 - die; // die 1 -> 23, die 6 -> 18
  } else {
    // Player 2 enters from opponent's home (indices 0-5)
    return die - 1; // die 1 -> 0, die 6 -> 5
  }
}

// Check if a point can be landed on by the player
function canLandOn(board: number[], pointIndex: number, player: PlayerId): boolean {
  if (pointIndex < 0 || pointIndex > 23) return false;
  const value = board[pointIndex];
  if (player === 'PLAYER_1') {
    // Player 1 uses positive values, can land if >=  -1 (empty, own, or single opponent)
    return value >= -1;
  } else {
    // Player 2 uses negative values, can land if <= 1
    return value <= 1;
  }
}

// Check if player has a checker at the point
function hasCheckerAt(board: number[], pointIndex: number, player: PlayerId): boolean {
  const value = board[pointIndex];
  return player === 'PLAYER_1' ? value > 0 : value < 0;
}

// Check if all checkers are in home board (can bear off)
function canBearOff(state: BackgammonState, player: PlayerId): boolean {
  if (state.bar[player] > 0) return false;
  
  const home = HOME_BOARD[player];
  
  for (let i = 0; i < 24; i++) {
    const isInHome = i >= home.start && i <= home.end;
    if (!isInHome && hasCheckerAt(state.board, i, player)) {
      return false;
    }
  }
  return true;
}

// Get the furthest checker from bearing off point
function getFurthestChecker(board: number[], player: PlayerId): number {
  if (player === 'PLAYER_1') {
    // Player 1 bears off toward index -1, so furthest is highest index with their checker
    for (let i = 5; i >= 0; i--) {
      if (board[i] > 0) return i;
    }
  } else {
    // Player 2 bears off toward index 24, so furthest is lowest index in home with their checker
    for (let i = 18; i <= 23; i++) {
      if (board[i] < 0) return i;
    }
  }
  return -1;
}

// Generate legal moves from the bar
function generateBarMoves(state: BackgammonState, player: PlayerId): BackgammonMove[] {
  const moves: BackgammonMove[] = [];
  const usedDice = new Set<number>();
  
  for (const die of state.dice) {
    // Avoid duplicate moves for same die value (doubles)
    const key = die;
    if (usedDice.has(key)) continue;
    
    const target = getEntryPoint(die, player);
    if (canLandOn(state.board, target, player)) {
      moves.push({ from: 'BAR', to: target, dieUsed: die });
      usedDice.add(key);
    }
  }
  
  return moves;
}

// Generate legal moves from a board point
function generatePointMoves(
  state: BackgammonState,
  fromIndex: number,
  player: PlayerId
): BackgammonMove[] {
  const moves: BackgammonMove[] = [];
  if (!hasCheckerAt(state.board, fromIndex, player)) return moves;
  
  const direction = PLAYER_DIRECTION[player];
  const usedDice = new Set<string>();
  
  for (const die of state.dice) {
    const targetIndex = fromIndex + (die * direction);
    const moveKey = `${fromIndex}-${die}`;
    if (usedDice.has(moveKey)) continue;
    
    // Check for bearing off
    if (player === 'PLAYER_1' && targetIndex < 0) {
      if (canBearOff(state, player)) {
        // Exact bear off or furthest checker with larger die
        const furthest = getFurthestChecker(state.board, player);
        if (targetIndex === -1 || fromIndex === furthest) {
          moves.push({ from: fromIndex, to: 'OFF', dieUsed: die });
          usedDice.add(moveKey);
        }
      }
      continue;
    }
    
    if (player === 'PLAYER_2' && targetIndex > 23) {
      if (canBearOff(state, player)) {
        const furthest = getFurthestChecker(state.board, player);
        if (targetIndex === 24 || fromIndex === furthest) {
          moves.push({ from: fromIndex, to: 'OFF', dieUsed: die });
          usedDice.add(moveKey);
        }
      }
      continue;
    }
    
    // Regular move
    if (targetIndex >= 0 && targetIndex <= 23 && canLandOn(state.board, targetIndex, player)) {
      moves.push({ from: fromIndex, to: targetIndex, dieUsed: die });
      usedDice.add(moveKey);
    }
  }
  
  return moves;
}

/**
 * Backgammon Game Engine implementation
 */
export const backgammonEngine: GameEngine<BackgammonState, BackgammonMove> = {
  generateMoves(state: BackgammonState, player: PlayerId): BackgammonMove[] {
    // If player has checkers on bar, they must move from bar first
    if (state.bar[player] > 0) {
      return generateBarMoves(state, player);
    }
    
    // Otherwise, generate all legal moves from board points
    const allMoves: BackgammonMove[] = [];
    for (let i = 0; i < 24; i++) {
      allMoves.push(...generatePointMoves(state, i, player));
    }
    return allMoves;
  },

  applyMove(state: BackgammonState, move: BackgammonMove): BackgammonState {
    const newBoard = [...state.board];
    const newBar = { ...state.bar };
    const newBorneOff = { ...state.borneOff };
    const newDice = state.dice.filter((d, i) => {
      // Remove first occurrence of used die
      const idx = state.dice.indexOf(move.dieUsed);
      return i !== idx;
    });
    
    // Actually remove the die properly
    const diceArray = [...state.dice];
    const dieIndex = diceArray.indexOf(move.dieUsed);
    if (dieIndex > -1) diceArray.splice(dieIndex, 1);
    
    const player = state.currentPlayer;
    const opponent: PlayerId = player === 'PLAYER_1' ? 'PLAYER_2' : 'PLAYER_1';
    const playerSign = player === 'PLAYER_1' ? 1 : -1;
    const opponentSign = -playerSign;
    
    // Remove checker from source
    if (move.from === 'BAR') {
      newBar[player]--;
    } else {
      newBoard[move.from] -= playerSign;
    }
    
    // Place checker at destination
    if (move.to === 'OFF') {
      newBorneOff[player]++;
    } else {
      // Check for hit (single opponent checker)
      if (newBoard[move.to] === opponentSign) {
        newBoard[move.to] = 0;
        newBar[opponent]++;
      }
      newBoard[move.to] += playerSign;
    }
    
    return {
      board: newBoard,
      bar: newBar,
      borneOff: newBorneOff,
      dice: diceArray,
      currentPlayer: player,
    };
  },

  getResult(state: BackgammonState): GameResult {
    if (state.borneOff['PLAYER_1'] === 15) {
      return { finished: true, winner: 'PLAYER_1', reason: 'All checkers borne off' };
    }
    if (state.borneOff['PLAYER_2'] === 15) {
      return { finished: true, winner: 'PLAYER_2', reason: 'All checkers borne off' };
    }
    return { finished: false };
  },

  evaluateState(state: BackgammonState, player: PlayerId): number {
    const opponent: PlayerId = player === 'PLAYER_1' ? 'PLAYER_2' : 'PLAYER_1';
    
    let score = 0;
    
    // Borne off checkers are very valuable
    score += state.borneOff[player] * 100;
    score -= state.borneOff[opponent] * 100;
    
    // Checkers on bar are very bad
    score -= state.bar[player] * 50;
    score += state.bar[opponent] * 50;
    
    // Calculate pip count (lower is better for own, higher for opponent)
    const playerDirection = PLAYER_DIRECTION[player];
    let playerPips = 0;
    let opponentPips = 0;
    
    for (let i = 0; i < 24; i++) {
      const value = state.board[i];
      if (value > 0) {
        // PLAYER_1 checkers
        const pips = (i + 1) * value; // Distance from bearing off
        if (player === 'PLAYER_1') {
          playerPips += pips;
        } else {
          opponentPips += pips;
        }
      } else if (value < 0) {
        // PLAYER_2 checkers
        const pips = (24 - i) * Math.abs(value);
        if (player === 'PLAYER_2') {
          playerPips += pips;
        } else {
          opponentPips += pips;
        }
      }
    }
    
    // Lower pip count is better
    score -= playerPips * 0.5;
    score += opponentPips * 0.5;
    
    // Bonus for made points (2+ checkers = safe)
    for (let i = 0; i < 24; i++) {
      const value = state.board[i];
      if (player === 'PLAYER_1' && value >= 2) {
        score += 5;
      } else if (player === 'PLAYER_2' && value <= -2) {
        score += 5;
      }
    }
    
    // Penalty for blots (single checkers that can be hit)
    for (let i = 0; i < 24; i++) {
      const value = state.board[i];
      if (player === 'PLAYER_1' && value === 1) {
        score -= 10;
      } else if (player === 'PLAYER_2' && value === -1) {
        score -= 10;
      }
    }
    
    return score;
  },
};

// Helper to convert legacy state to engine state
export function toLegacyMove(move: BackgammonMove): { from: number; to: number; dieValue: number } {
  return {
    from: move.from === 'BAR' ? -1 : move.from,
    to: move.to === 'OFF' ? -2 : move.to, // Use -2 for player bear off (matches legacy)
    dieValue: move.dieUsed,
  };
}

// Initial board setup
export function getInitialBackgammonState(startingPlayer: PlayerId = 'PLAYER_1'): BackgammonState {
  const board = Array(24).fill(0);
  // PLAYER_1 (positive) - moves from 24->1 (high to low index)
  board[23] = 2;  // Point 24
  board[12] = 5;  // Point 13
  board[7] = 3;   // Point 8
  board[5] = 5;   // Point 6
  // PLAYER_2 (negative) - moves from 1->24 (low to high index)
  board[0] = -2;  // Point 1
  board[11] = -5; // Point 12
  board[16] = -3; // Point 17
  board[18] = -5; // Point 19
  
  return {
    board,
    bar: { 'PLAYER_1': 0, 'PLAYER_2': 0 },
    borneOff: { 'PLAYER_1': 0, 'PLAYER_2': 0 },
    dice: [],
    currentPlayer: startingPlayer,
  };
}
