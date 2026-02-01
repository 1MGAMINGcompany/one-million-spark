/**
 * Game Session Status Constants
 * 
 * Use status_int for ALL logic gates.
 * status text is for display/backward compatibility only.
 * Edge functions always write BOTH columns.
 */

export const GAME_STATUS = {
  WAITING: 1,
  ACTIVE: 2,
  FINISHED: 3,
} as const;

export type GameStatusInt = typeof GAME_STATUS[keyof typeof GAME_STATUS];

/**
 * Check if a game session is finished (status_int === 3)
 */
export function isGameFinished(statusInt: number | undefined): boolean {
  return statusInt === GAME_STATUS.FINISHED;
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
