// AI configuration and factory for game AI engines

import type { GameEngine, PlayerId } from './types';
import { chooseBestMove } from './minimax';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface AiConfig {
  difficulty: Difficulty;
  maxDepth?: number;
  maxMillis?: number;
  randomness?: number;
}

export interface AiEngine<S, M> {
  chooseMove(
    engine: GameEngine<S, M>,
    state: S,
    player: PlayerId,
    config: AiConfig
  ): Promise<M | null>;
}

/**
 * Factory function to create an AI engine for any game.
 * Uses minimax with alpha-beta pruning internally.
 */
export function createAiEngine<S, M>(): AiEngine<S, M> {
  return {
    async chooseMove(
      engine: GameEngine<S, M>,
      state: S,
      player: PlayerId,
      config: AiConfig
    ): Promise<M | null> {
      return chooseBestMove(engine, state, player, config);
    }
  };
}
