// Core game engine types shared across all games

export type PlayerId = 'PLAYER_1' | 'PLAYER_2';

export interface GameResult {
  finished: boolean;
  winner?: PlayerId;
  reason?: string;
}

/**
 * Generic game engine interface that all games must implement.
 * S = State type, M = Move type
 */
export interface GameEngine<S, M> {
  /** Generate all legal moves for the given player in the current state */
  generateMoves(state: S, player: PlayerId): M[];
  
  /** Apply a move to the state and return the new state (immutable) */
  applyMove(state: S, move: M): S;
  
  /** Check if the game is finished and who won */
  getResult(state: S): GameResult;
  
  /** Evaluate the state from the perspective of the given player (higher = better) */
  evaluateState(state: S, player: PlayerId): number;
}
