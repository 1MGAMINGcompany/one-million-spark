/**
 * Missed turns tracking utility for ranked games
 * 
 * @deprecated This file is kept for backward compatibility only.
 * Strike tracking is now handled server-side in the `maybe_apply_turn_timeout` RPC.
 * The `game_sessions.missed_turns` JSONB column stores strike counts per wallet.
 * 
 * Only `clearRoom` is still used for localStorage cleanup on game start.
 * The `incMissed`, `resetMissed`, and `getMissed` functions are no longer
 * used for enforcement - the server is the single source of truth.
 *
 * IMPORTANT: Uses normalizeWallet() (trim only) - Solana Base58 is case-sensitive!
 * Never use toLowerCase() on wallet addresses.
 */
import { normalizeWallet } from "./walletUtils";

const PREFIX = "missedTurns";

function getKey(roomPda: string, wallet: string): string {
  return `${PREFIX}:${roomPda.trim()}:${normalizeWallet(wallet)}`;
}

/**
 * Get the current missed turn count for a player in a room
 */
export function getMissed(roomPda: string, wallet: string): number {
  try {
    const key = getKey(roomPda, wallet);
    const val = localStorage.getItem(key);
    return val ? parseInt(val, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Increment the missed turn count for a player in a room
 * Returns the new count after incrementing
 */
export function incMissed(roomPda: string, wallet: string): number {
  const current = getMissed(roomPda, wallet);
  const newVal = current + 1;
  try {
    localStorage.setItem(getKey(roomPda, wallet), String(newVal));
  } catch {
    // localStorage unavailable, continue silently
  }
  return newVal;
}

/**
 * Reset the missed turn count for a player in a room (on successful move)
 */
export function resetMissed(roomPda: string, wallet: string): void {
  try {
    localStorage.removeItem(getKey(roomPda, wallet));
  } catch {
    // localStorage unavailable, continue silently
  }
}

/**
 * Clear all missed turn entries for a room (on game end)
 */
export function clearRoom(roomPda: string): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${PREFIX}:${roomPda.trim()}:`)) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // localStorage unavailable, continue silently
  }
}
