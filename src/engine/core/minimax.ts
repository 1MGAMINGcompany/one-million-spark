// Generic minimax/negamax with alpha-beta pruning

import type { GameEngine, PlayerId } from './types';
import type { AiConfig } from './ai';

function getOpponent(player: PlayerId): PlayerId {
  return player === 'PLAYER_1' ? 'PLAYER_2' : 'PLAYER_1';
}

interface MoveScore<M> {
  move: M;
  score: number;
}

/**
 * Negamax with alpha-beta pruning.
 * Returns the evaluation score for the current player.
 */
function negamax<S, M>(
  engine: GameEngine<S, M>,
  state: S,
  player: PlayerId,
  depth: number,
  alpha: number,
  beta: number,
  startTime: number,
  maxMillis: number
): number {
  // Check time limit
  if (maxMillis > 0 && Date.now() - startTime > maxMillis) {
    return engine.evaluateState(state, player);
  }

  const result = engine.getResult(state);
  if (result.finished) {
    if (result.winner === player) return 10000 + depth; // Win sooner is better
    if (result.winner === getOpponent(player)) return -10000 - depth; // Lose later is better
    return 0; // Draw
  }

  if (depth === 0) {
    return engine.evaluateState(state, player);
  }

  const moves = engine.generateMoves(state, player);
  if (moves.length === 0) {
    // No moves available, evaluate current position
    return engine.evaluateState(state, player);
  }

  let bestScore = -Infinity;

  for (const move of moves) {
    const newState = engine.applyMove(state, move);
    // Negamax: negate the score from opponent's perspective
    const score = -negamax(
      engine,
      newState,
      getOpponent(player),
      depth - 1,
      -beta,
      -alpha,
      startTime,
      maxMillis
    );

    bestScore = Math.max(bestScore, score);
    alpha = Math.max(alpha, score);

    if (alpha >= beta) {
      break; // Beta cutoff
    }
  }

  return bestScore;
}

/**
 * Choose the best move using negamax with alpha-beta pruning.
 * Supports configurable depth, time limit, and randomness.
 */
export async function chooseBestMove<S, M>(
  engine: GameEngine<S, M>,
  state: S,
  player: PlayerId,
  config: AiConfig
): Promise<M | null> {
  const moves = engine.generateMoves(state, player);
  
  if (moves.length === 0) {
    return null;
  }

  if (moves.length === 1) {
    return moves[0];
  }

  // Get config values with defaults
  const maxDepth = config.maxDepth ?? 3;
  const maxMillis = config.maxMillis ?? 5000;
  const randomness = config.randomness ?? 0;

  const startTime = Date.now();
  const moveScores: MoveScore<M>[] = [];

  for (const move of moves) {
    const newState = engine.applyMove(state, move);
    const score = -negamax(
      engine,
      newState,
      getOpponent(player),
      maxDepth - 1,
      -Infinity,
      Infinity,
      startTime,
      maxMillis
    );
    moveScores.push({ move, score });
  }

  // Sort by score descending
  moveScores.sort((a, b) => b.score - a.score);

  const bestScore = moveScores[0].score;

  // If randomness > 0, choose randomly among moves within randomness threshold
  if (randomness > 0) {
    const threshold = bestScore - randomness;
    const goodMoves = moveScores.filter(ms => ms.score >= threshold);
    const randomIndex = Math.floor(Math.random() * goodMoves.length);
    return goodMoves[randomIndex].move;
  }

  return moveScores[0].move;
}
