/**
 * Ludo AI - Move Selection Logic
 * 
 * Uses the same engine as human players - no cheating!
 * 
 * Easy: Random moves
 * Medium: 50% random, 50% priority-based
 * Hard: Score-based with safety, blocking, and strategic evaluation
 */

import { GameState, Move, Token, TRACK_SIZE, HOME_PATH_SIZE, SAFE_SQUARES, START_POSITIONS } from './types';

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
    // Fall through to priority-based selection
    return selectPriorityMove(state);
  }
  
  // Hard: Full score-based evaluation
  return selectScoredMove(state);
}

/** Simple priority-based selection (used by medium) */
function selectPriorityMove(state: GameState): Move {
  const { legalMoves, currentPlayerIndex, players } = state;
  const player = players[currentPlayerIndex];
  
  // Priority 1: Finish a token
  const finishMove = legalMoves.find(m => m.toState === 'FINISHED');
  if (finishMove) return finishMove;
  
  // Priority 2: Capture opponent
  const captureMove = legalMoves.find(m => m.isCapture);
  if (captureMove) return captureMove;
  
  // Priority 3: Move token closest to finish
  const progressMoves = legalMoves
    .filter(m => m.fromState === 'TRACK' || m.fromState === 'HOME_PATH')
    .map(m => ({ move: m, progress: calculateProgress(player.tokens[m.tokenIndex], m) }))
    .sort((a, b) => b.progress - a.progress);
  
  if (progressMoves.length > 0) return progressMoves[0].move;
  
  // Priority 4: Bring token out of BASE
  const baseMove = legalMoves.find(m => m.fromState === 'BASE');
  if (baseMove) return baseMove;
  
  return legalMoves[Math.floor(Math.random() * legalMoves.length)];
}

/** Score-based move selection with safety + blocking (hard mode) */
function selectScoredMove(state: GameState): Move {
  const { legalMoves, currentPlayerIndex, players } = state;
  const player = players[currentPlayerIndex];
  
  // Collect all opponent track positions
  const opponentPositions: number[] = [];
  for (let i = 0; i < players.length; i++) {
    if (i === currentPlayerIndex) continue;
    for (const token of players[i].tokens) {
      if (token.state === 'TRACK') {
        opponentPositions.push(token.position);
      }
    }
  }
  
  let bestMove = legalMoves[0];
  let bestScore = -Infinity;
  
  for (const move of legalMoves) {
    let score = 0;
    
    // === FINISHING (highest priority) ===
    if (move.toState === 'FINISHED') {
      score += 1000;
    }
    
    // === CAPTURE (very valuable) ===
    if (move.isCapture) {
      score += 500;
      // Extra value for capturing tokens that are far along
      if (move.toPosition !== undefined) {
        score += 50; // Sending them back to base is always good
      }
    }
    
    // === ENTERING HOME PATH (safe + progress) ===
    if (move.toState === 'HOME_PATH') {
      score += 200 + (move.toPosition ?? 0) * 30;
    }
    
    // === LEAVING BASE ===
    if (move.fromState === 'BASE') {
      // Value leaving base, especially if we have few tokens on track
      const tokensOnTrack = player.tokens.filter(t => t.state === 'TRACK').length;
      score += tokensOnTrack < 2 ? 150 : 80;
    }
    
    // === PROGRESS (advance toward finish) ===
    if (move.toState === 'TRACK' && move.toPosition !== undefined) {
      const token = player.tokens[move.tokenIndex];
      score += calculateProgress(token, move) * 2;
    }
    
    // === SAFETY EVALUATION ===
    if (move.toState === 'TRACK' && move.toPosition !== undefined) {
      const targetPos = move.toPosition;
      
      // Check if landing position is vulnerable to capture
      // (opponent within 1-6 steps behind us)
      let dangerScore = 0;
      for (const oppPos of opponentPositions) {
        const dist = ((targetPos - oppPos) % TRACK_SIZE + TRACK_SIZE) % TRACK_SIZE;
        const reverseDist = ((oppPos - targetPos) % TRACK_SIZE + TRACK_SIZE) % TRACK_SIZE;
        
        // If opponent is 1-6 steps behind, we're in danger
        if (reverseDist >= 1 && reverseDist <= 6) {
          dangerScore += 80;
        }
      }
      score -= dangerScore;
      
      // Check if landing on a safe square
      if (SAFE_SQUARES.includes(targetPos)) {
        score += 30;
      }
    }
    
    // === BLOCKING STRATEGY ===
    if (move.toState === 'TRACK' && move.toPosition !== undefined) {
      const targetPos = move.toPosition;
      // Bonus for landing near opponent tokens (threatening capture next turn)
      for (const oppPos of opponentPositions) {
        const dist = ((oppPos - targetPos) % TRACK_SIZE + TRACK_SIZE) % TRACK_SIZE;
        if (dist >= 1 && dist <= 6) {
          score += 40; // We threaten this opponent
        }
      }
    }
    
    // === SPREAD LOGIC ===
    // Slight bonus for not stacking tokens on the same position
    if (move.toState === 'TRACK' && move.toPosition !== undefined) {
      const friendlyOnSameSquare = player.tokens.filter(
        (t, idx) => idx !== move.tokenIndex && t.state === 'TRACK' && t.position === move.toPosition
      ).length;
      if (friendlyOnSameSquare > 0) {
        score -= 20; // Slight penalty for stacking
      }
    }
    
    // === AVOID MOVING FROM SAFE TO UNSAFE ===
    if (move.fromState === 'TRACK') {
      const fromToken = player.tokens[move.tokenIndex];
      const fromPos = fromToken.position;
      // If currently safe (no nearby opponents), penalize moving to danger
      let wasInDanger = false;
      for (const oppPos of opponentPositions) {
        const reverseDist = ((oppPos - fromPos) % TRACK_SIZE + TRACK_SIZE) % TRACK_SIZE;
        if (reverseDist >= 1 && reverseDist <= 6) {
          wasInDanger = true;
          break;
        }
      }
      if (wasInDanger) {
        score += 15; // Bonus for escaping danger
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  
  return bestMove;
}

/**
 * Calculate progress score for a token (higher = closer to finish)
 */
function calculateProgress(token: Token, move: Move): number {
  if (move.toState === 'FINISHED') {
    return 100;
  }
  
  if (move.toState === 'HOME_PATH') {
    return TRACK_SIZE + (move.toPosition ?? 0);
  }
  
  if (move.toState === 'TRACK') {
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
