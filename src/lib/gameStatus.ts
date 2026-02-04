/**
 * Game Session Status Constants
 * 
 * Use status_int for ALL logic gates.
 * status text is for display/backward compatibility only.
 * Edge functions always write BOTH columns.
 * 
 * TERMINAL INVARIANTS (P0 MONEY SAFETY):
 * - FINISHED (3): winner_wallet REQUIRED, game_over_at REQUIRED
 * - VOID (4): winner_wallet MUST BE null, game_over_at REQUIRED (settlement failed)
 * - CANCELLED (5): winner_wallet MUST BE null, game_over_at REQUIRED (room closed before active)
 */

export const GAME_STATUS = {
  WAITING: 1,
  ACTIVE: 2,
  FINISHED: 3,
  VOID: 4,
  CANCELLED: 5,
} as const;

export type GameStatusInt = typeof GAME_STATUS[keyof typeof GAME_STATUS];

/**
 * Check if a game session is finished (status_int === 3)
 * INVARIANT: winner_wallet and game_over_at must be set
 */
export function isGameFinished(statusInt: number | undefined): boolean {
  return statusInt === GAME_STATUS.FINISHED;
}

/**
 * Check if a game session is void (status_int === 4) - settlement failed
 * INVARIANT: winner_wallet must be null, game_over_at must be set
 */
export function isGameVoid(statusInt: number | undefined): boolean {
  return statusInt === GAME_STATUS.VOID;
}

/**
 * Check if a game session is cancelled (status_int === 5) - room closed before active
 * INVARIANT: winner_wallet must be null, game_over_at must be set
 */
export function isGameCancelled(statusInt: number | undefined): boolean {
  return statusInt === GAME_STATUS.CANCELLED;
}

/**
 * Check if a game session is terminal (finished, void, or cancelled)
 * No further state transitions allowed after terminal.
 */
export function isGameTerminal(statusInt: number | undefined): boolean {
  return (
    statusInt === GAME_STATUS.FINISHED ||
    statusInt === GAME_STATUS.VOID ||
    statusInt === GAME_STATUS.CANCELLED
  );
}

/**
 * Check if a game session is active (status_int === 2)
 */
export function isGameActive(statusInt: number | undefined): boolean {
  return statusInt === GAME_STATUS.ACTIVE;
}

/**
 * Check if a game session is waiting (status_int === 1)
 */
export function isGameWaiting(statusInt: number | undefined): boolean {
  return statusInt === GAME_STATUS.WAITING;
}

/**
 * Validate terminal state invariants
 * Returns error message if invalid, null if valid
 */
export function validateTerminalState(
  statusInt: number | undefined,
  winnerWallet: string | null | undefined,
  gameOverAt: string | null | undefined
): string | null {
  if (statusInt === GAME_STATUS.FINISHED) {
    if (!winnerWallet) {
      return 'FINISHED (3) requires winner_wallet to be set';
    }
    if (!gameOverAt) {
      return 'FINISHED (3) requires game_over_at to be set';
    }
  }
  
  if (statusInt === GAME_STATUS.VOID || statusInt === GAME_STATUS.CANCELLED) {
    if (winnerWallet) {
      return `${statusInt === GAME_STATUS.VOID ? 'VOID (4)' : 'CANCELLED (5)'} requires winner_wallet to be null`;
    }
    if (!gameOverAt) {
      return `${statusInt === GAME_STATUS.VOID ? 'VOID (4)' : 'CANCELLED (5)'} requires game_over_at to be set`;
    }
  }
  
  return null;
}
