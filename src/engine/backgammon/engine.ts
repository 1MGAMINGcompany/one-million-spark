// Backgammon game engine implementation - FULL PRODUCTION RULES
// Deterministic, server-style validation

import type { GameEngine, GameResult, PlayerId } from '../core/types';
import type { BackgammonState, BackgammonMove } from './types';

// ============= CONSTANTS =============

// Direction of movement for each player
const PLAYER_DIRECTION: Record<PlayerId, number> = {
  'PLAYER_1': -1, // Moves from high index to low (toward 0, bears off at -1)
  'PLAYER_2': 1,  // Moves from low index to high (toward 23, bears off at 24)
};

// Home board ranges (where player must have all checkers to bear off)
const HOME_BOARD: Record<PlayerId, { start: number; end: number }> = {
  'PLAYER_1': { start: 0, end: 5 },   // Points 1-6 (indices 0-5)
  'PLAYER_2': { start: 18, end: 23 }, // Points 19-24 (indices 18-23)
};

// ============= HELPER FUNCTIONS =============

// Calculate bar entry point based on die value
function getEntryPoint(die: number, player: PlayerId): number {
  if (player === 'PLAYER_1') {
    // Player 1 enters opponent's home (indices 18-23)
    // die 1 → index 23, die 6 → index 18
    return 24 - die;
  } else {
    // Player 2 enters opponent's home (indices 0-5)
    // die 1 → index 0, die 6 → index 5
    return die - 1;
  }
}

// Check if a point can be landed on
function canLandOn(board: number[], pointIndex: number, player: PlayerId): boolean {
  if (pointIndex < 0 || pointIndex > 23) return false;
  const value = board[pointIndex];
  if (player === 'PLAYER_1') {
    // Player 1 uses positive values, can land if >= -1 (empty, own, or single opponent)
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
  // Must have no checkers on bar
  if (state.bar[player] > 0) return false;
  
  const home = HOME_BOARD[player];
  
  // All checkers must be in home board
  for (let i = 0; i < 24; i++) {
    const isInHome = i >= home.start && i <= home.end;
    if (!isInHome && hasCheckerAt(state.board, i, player)) {
      return false;
    }
  }
  return true;
}

// Get the furthest checker from bearing off point (for overshoot rule)
function getFurthestChecker(board: number[], player: PlayerId): number {
  if (player === 'PLAYER_1') {
    // Player 1 bears off toward index -1, furthest is highest index in home
    for (let i = 5; i >= 0; i--) {
      if (board[i] > 0) return i;
    }
  } else {
    // Player 2 bears off toward index 24, furthest is lowest index in home
    for (let i = 18; i <= 23; i++) {
      if (board[i] < 0) return i;
    }
  }
  return -1;
}

// ============= MOVE GENERATION =============

// Generate legal moves from the bar
function generateBarMoves(state: BackgammonState, player: PlayerId): BackgammonMove[] {
  const moves: BackgammonMove[] = [];
  const usedDice = new Set<number>();
  
  for (const die of state.dice) {
    if (usedDice.has(die)) continue;
    
    const target = getEntryPoint(die, player);
    if (canLandOn(state.board, target, player)) {
      moves.push({ from: 'BAR', to: target, dieUsed: die });
      usedDice.add(die);
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
        // Exact bear off (targetIndex === -1) or overshoot with furthest checker
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

// ============= GAME ENGINE =============

export const backgammonEngine: GameEngine<BackgammonState, BackgammonMove> = {
  generateMoves(state: BackgammonState, player: PlayerId): BackgammonMove[] {
    // BAR RULE: If player has checkers on bar, must move from bar first
    if (state.bar[player] > 0) {
      return generateBarMoves(state, player);
    }
    
    // Generate all legal moves from board points
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
    
    // Remove used die from dice array
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
      // Check for HIT (single opponent checker = blot)
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
    // Check for winner
    if (state.borneOff['PLAYER_1'] === 15) {
      const loserBorneOff = state.borneOff['PLAYER_2'];
      const loserBar = state.bar['PLAYER_2'];
      let loserInWinnerHome = false;
      for (let i = 0; i <= 5; i++) {
        if (state.board[i] < 0) { loserInWinnerHome = true; break; }
      }
      
      let reason = 'Single game';
      if (loserBorneOff === 0) {
        if (loserBar > 0 || loserInWinnerHome) {
          reason = 'Backgammon (3x)';
        } else {
          reason = 'Gammon (2x)';
        }
      }
      return { finished: true, winner: 'PLAYER_1', reason };
    }
    
    if (state.borneOff['PLAYER_2'] === 15) {
      const loserBorneOff = state.borneOff['PLAYER_1'];
      const loserBar = state.bar['PLAYER_1'];
      let loserInWinnerHome = false;
      for (let i = 18; i <= 23; i++) {
        if (state.board[i] > 0) { loserInWinnerHome = true; break; }
      }
      
      let reason = 'Single game';
      if (loserBorneOff === 0) {
        if (loserBar > 0 || loserInWinnerHome) {
          reason = 'Backgammon (3x)';
        } else {
          reason = 'Gammon (2x)';
        }
      }
      return { finished: true, winner: 'PLAYER_2', reason };
    }
    
    return { finished: false };
  },

  evaluateState(state: BackgammonState, player: PlayerId): number {
    const opponent: PlayerId = player === 'PLAYER_1' ? 'PLAYER_2' : 'PLAYER_1';
    
    let score = 0;
    
    // ===== PHASE 1: WINNING/LOSING BONUSES =====
    // Borne off checkers are extremely valuable
    score += state.borneOff[player] * 150;
    score -= state.borneOff[opponent] * 150;
    
    // Checkers on bar are very punishing
    score -= state.bar[player] * 80;
    score += state.bar[opponent] * 80;
    
    // ===== PHASE 2: PIP COUNT (race position) =====
    let playerPips = 0;
    let opponentPips = 0;
    
    for (let i = 0; i < 24; i++) {
      const value = state.board[i];
      if (value > 0) {
        // PLAYER_1 checkers - distance from bearing off is (i + 1)
        const pips = (i + 1) * value;
        if (player === 'PLAYER_1') playerPips += pips;
        else opponentPips += pips;
      } else if (value < 0) {
        // PLAYER_2 checkers - distance from bearing off is (24 - i)
        const pips = (24 - i) * Math.abs(value);
        if (player === 'PLAYER_2') playerPips += pips;
        else opponentPips += pips;
      }
    }
    
    // Add bar checkers to pip count (25 pips from bearing off)
    playerPips += state.bar[player] * 25;
    opponentPips += state.bar[opponent] * 25;
    
    // Lower pip count is better - this is a PRIMARY factor
    score -= playerPips * 0.8;
    score += opponentPips * 0.8;
    
    // ===== PHASE 3: POSITION QUALITY =====
    const playerHome = HOME_BOARD[player];
    const opponentHome = HOME_BOARD[opponent];
    
    // Bonus for made points (2+ checkers = safe, can't be hit)
    // More valuable in home board and blocking positions
    for (let i = 0; i < 24; i++) {
      const value = state.board[i];
      const absValue = Math.abs(value);
      const isPlayerChecker = (player === 'PLAYER_1' && value > 0) || (player === 'PLAYER_2' && value < 0);
      const isOpponentChecker = !isPlayerChecker && absValue > 0;
      
      if (isPlayerChecker && absValue >= 2) {
        // Made point bonus
        let pointValue = 12;
        
        // Extra bonus for home board points
        if (i >= playerHome.start && i <= playerHome.end) {
          pointValue += 8;
        }
        
        // Extra bonus for blocking opponent's entry points (indices 0-5 for P1, 18-23 for P2)
        if (i >= opponentHome.start && i <= opponentHome.end) {
          pointValue += 15; // Blocking their home is very strong
        }
        
        // Prime bonus: consecutive made points are very valuable
        // Check if adjacent points are also made
        if (i > 0) {
          const prevValue = state.board[i - 1];
          const prevIsMade = (player === 'PLAYER_1' && prevValue >= 2) || (player === 'PLAYER_2' && prevValue <= -2);
          if (prevIsMade) pointValue += 10;
        }
        if (i < 23) {
          const nextValue = state.board[i + 1];
          const nextIsMade = (player === 'PLAYER_1' && nextValue >= 2) || (player === 'PLAYER_2' && nextValue <= -2);
          if (nextIsMade) pointValue += 10;
        }
        
        score += pointValue;
      }
      
      // Penalty for blots (single checkers that can be hit)
      if (isPlayerChecker && absValue === 1) {
        let blotPenalty = 15;
        
        // Higher penalty if in opponent's home board (more likely to be hit)
        if (i >= opponentHome.start && i <= opponentHome.end) {
          blotPenalty += 20;
        }
        
        // Higher penalty early in the game when opponent has more checkers behind
        const checkersAhead = player === 'PLAYER_1' 
          ? state.board.slice(i + 1).reduce((sum, v) => sum + (v < 0 ? Math.abs(v) : 0), 0)
          : state.board.slice(0, i).reduce((sum, v) => sum + (v > 0 ? v : 0), 0);
        
        if (checkersAhead > 3) {
          blotPenalty += checkersAhead * 2;
        }
        
        score -= blotPenalty;
      }
      
      // Bonus for having opponent on the bar (they must re-enter)
      if (state.bar[opponent] > 0) {
        // Extra bonus for blocking entry points
        if (i >= opponentHome.start && i <= opponentHome.end) {
          if (isPlayerChecker && absValue >= 2) {
            score += 20; // Blocking entry while opponent is on bar is huge
          }
        }
      }
    }
    
    // ===== PHASE 4: RACE ADVANTAGE =====
    // If we're ahead in the race and can avoid contact, that's good
    const pipDifference = opponentPips - playerPips;
    if (pipDifference > 20) {
      // We're significantly ahead, value safety more
      score += 25;
    }
    
    // ===== PHASE 5: BEARING OFF READINESS =====
    // Bonus for having all checkers in home board (ready to bear off)
    if (canBearOff(state, player)) {
      score += 50;
    }
    
    return score;
  },
};

// ============= HELPERS =============

// Convert engine move to legacy format
export function toLegacyMove(move: BackgammonMove): { from: number; to: number; dieValue: number } {
  return {
    from: move.from === 'BAR' ? -1 : move.from,
    to: move.to === 'OFF' ? -2 : move.to,
    dieValue: move.dieUsed,
  };
}

// Initial board setup (standard backgammon)
export function getInitialBackgammonState(startingPlayer: PlayerId = 'PLAYER_1'): BackgammonState {
  const board = Array(24).fill(0);
  
  // PLAYER_1 (positive) - moves from 24→1 (high to low index)
  // 2 on point 24 (index 23)
  board[23] = 2;
  // 5 on point 13 (index 12)
  board[12] = 5;
  // 3 on point 8 (index 7)
  board[7] = 3;
  // 5 on point 6 (index 5)
  board[5] = 5;
  
  // PLAYER_2 (negative) - moves from 1→24 (low to high index)
  // 2 on point 1 (index 0)
  board[0] = -2;
  // 5 on point 12 (index 11)
  board[11] = -5;
  // 3 on point 17 (index 16)
  board[16] = -3;
  // 5 on point 19 (index 18)
  board[18] = -5;
  
  return {
    board,
    bar: { 'PLAYER_1': 0, 'PLAYER_2': 0 },
    borneOff: { 'PLAYER_1': 0, 'PLAYER_2': 0 },
    dice: [],
    currentPlayer: startingPlayer,
  };
}
