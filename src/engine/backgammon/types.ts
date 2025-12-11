// Backgammon-specific types for the unified engine

import type { PlayerId } from '../core/types';

export interface BackgammonState {
  /** Board positions: positive = PLAYER_1 checkers, negative = PLAYER_2 checkers */
  board: number[];
  /** Checkers on the bar for each player */
  bar: Record<PlayerId, number>;
  /** Checkers that have been borne off */
  borneOff: Record<PlayerId, number>;
  /** Remaining dice values for the current turn */
  dice: number[];
  /** Current player whose turn it is */
  currentPlayer: PlayerId;
}

export interface BackgammonMove {
  /** Source: 'BAR' for bar entry, or 0-23 for board position */
  from: 'BAR' | number;
  /** Destination: 0-23 for board, or 'OFF' for bearing off */
  to: number | 'OFF';
  /** The die value used for this move */
  dieUsed: number;
}
