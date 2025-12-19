// Backgammon AI wrapper using the unified engine

import type { PlayerId } from '../core/types';
import type { Difficulty } from '../core/ai';
import { createAiEngine } from '../core/ai';
import { backgammonEngine } from './engine';
import type { BackgammonState, BackgammonMove } from './types';

// Difficulty configurations - improved for better AI play
const DIFFICULTY_CONFIG: Record<Difficulty, { maxDepth: number; randomness: number }> = {
  'EASY': { maxDepth: 2, randomness: 60 },     // Some randomness, basic lookahead
  'MEDIUM': { maxDepth: 3, randomness: 15 },   // Less randomness, good depth
  'HARD': { maxDepth: 4, randomness: 0 },      // No randomness, deeper search
};

const aiEngine = createAiEngine<BackgammonState, BackgammonMove>();

/**
 * Choose the best move for the AI player.
 * @param state Current game state
 * @param player The AI player
 * @param difficulty AI difficulty level
 * @returns The chosen move, or null if no legal moves
 */
export async function chooseBackgammonMove(
  state: BackgammonState,
  player: PlayerId,
  difficulty: Difficulty
): Promise<BackgammonMove | null> {
  const config = DIFFICULTY_CONFIG[difficulty];
  
  return aiEngine.chooseMove(
    backgammonEngine,
    state,
    player,
    {
      difficulty,
      maxDepth: config.maxDepth,
      maxMillis: 3000, // 3 second time limit
      randomness: config.randomness,
    }
  );
}

// Re-export types for convenience
export type { BackgammonState, BackgammonMove } from './types';
export type { Difficulty } from '../core/ai';
