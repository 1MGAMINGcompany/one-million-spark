/**
 * Ludo AI - Move Selection Logic
 * 
 * Uses the same engine as human players - no cheating!
 * 
 * Priority order (based on difficulty):
 * 1. Finish a token if possible
 * 2. Capture opponent if possible
 * 3. Move token closest to finish
 * 4. Bring token out of BASE on 6
 * 5. Random legal move
 */

import { GameState, Move, Token, TRACK_SIZE, HOME_PATH_SIZE } from './types';

export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Select the best move for AI based on difficulty
 */
export function selectAIMove(
  state: GameState,
  difficulty: Difficulty
): Move | null {
  const { legalMoves, currentPlayerIndex, players } = state;
  
  if (legalMoves.length === 0) {
    return null;
  }
  
  if (legalMoves.length === 1) {
    return legalMoves[0];
  }
  
  // Easy: Random move
  if (difficulty === 'easy') {
    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
  }
  
  // Medium: Some strategy
  if (difficulty === 'medium') {
    // 50% chance to use strategy, 50% random
    if (Math.random() < 0.5) {
      return legalMoves[Math.floor(Math.random() * legalMoves.length)];
    }
  }
  
  // Hard / Medium (strategy): Use priority system
  const player = players[currentPlayerIndex];
  
  // Priority 1: Finish a token
  const finishMove = legalMoves.find(m => m.toState === 'FINISHED');
  if (finishMove) {
    return finishMove;
  }
  
  // Priority 2: Capture opponent
  const captureMove = legalMoves.find(m => m.isCapture);
  if (captureMove) {
    return captureMove;
  }
  
  // Priority 3: Move token closest to finish (highest progress)
  const progressMoves = legalMoves
    .filter(m => m.fromState === 'TRACK' || m.fromState === 'HOME_PATH')
    .map(m => ({
      move: m,
      progress: calculateProgress(player.tokens[m.tokenIndex], m),
    }))
    .sort((a, b) => b.progress - a.progress);
  
  if (progressMoves.length > 0) {
    return progressMoves[0].move;
  }
  
  // Priority 4: Bring token out of BASE
  const baseMove = legalMoves.find(m => m.fromState === 'BASE');
  if (baseMove) {
    return baseMove;
  }
  
  // Fallback: Random
  return legalMoves[Math.floor(Math.random() * legalMoves.length)];
}

/**
 * Calculate progress score for a token (higher = closer to finish)
 */
function calculateProgress(token: Token, move: Move): number {
  // Track position = 0-51 (52 cells)
  // Home path position = 0-5 (6 cells)
  // Finished = 58 (max)
  
  if (move.toState === 'FINISHED') {
    return 100; // Max priority
  }
  
  if (move.toState === 'HOME_PATH') {
    // Home path positions 0-5 = progress 52-57
    return TRACK_SIZE + (move.toPosition ?? 0);
  }
  
  if (move.toState === 'TRACK') {
    // Track position relative to finish (higher is better)
    return move.toPosition ?? 0;
  }
  
  return 0;
}

/**
 * Get AI thinking delay based on difficulty
 */
export function getAIDelay(difficulty: Difficulty): { roll: number; move: number } {
  switch (difficulty) {
    case 'easy':
      return { roll: 800, move: 600 };
    case 'medium':
      return { roll: 600, move: 500 };
    case 'hard':
      return { roll: 400, move: 300 };
    default:
      return { roll: 600, move: 500 };
  }
}
