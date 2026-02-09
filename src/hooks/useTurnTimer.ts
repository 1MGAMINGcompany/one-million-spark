/**
 * Hook to manage turn timer enforcement for ranked games
 * 
 * Server-anchored: remaining time is always derived from `turnStartedAt` timestamp,
 * making it immune to polling resets and keeping both players perfectly in sync.
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface UseTurnTimerOptions {
  /** Turn time limit in seconds */
  turnTimeSeconds: number;
  /** Whether the timer is active (game started, ranked mode, etc.) */
  enabled: boolean;
  /** Whether it's currently this player's turn */
  isMyTurn: boolean;
  /** Server timestamp when the current turn started (ISO string) */
  turnStartedAt: string | null;
  /** Callback when time expires on my turn (auto-forfeit) */
  onTimeExpired?: () => void;
  /** Room ID for logging */
  roomId?: string;
}

interface UseTurnTimerResult {
  /** Remaining time in seconds */
  remainingTime: number;
  /** Whether timer is in low time warning zone (<=30s) */
  isLowTime: boolean;
  /** Whether timer is in critical zone (<=10s) */
  isCriticalTime: boolean;
  /** Reset the timer (no-op, kept for API compat) */
  resetTimer: () => void;
  /** Pause the timer (no-op, kept for API compat) */
  pauseTimer: () => void;
  /** Resume the timer (no-op, kept for API compat) */
  resumeTimer: () => void;
  /** Whether timer is currently paused */
  isPaused: boolean;
}

export function useTurnTimer(options: UseTurnTimerOptions): UseTurnTimerResult {
  const { turnTimeSeconds, enabled, isMyTurn, turnStartedAt, onTimeExpired, roomId } = options;
  
  const [remainingTime, setRemainingTime] = useState(turnTimeSeconds);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasExpiredRef = useRef(false);

  // Clear interval helper
  const clearTimerInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // No-op methods kept for API compatibility
  const resetTimer = useCallback(() => {}, []);
  const pauseTimer = useCallback(() => {}, []);
  const resumeTimer = useCallback(() => {}, []);

  // Reset expiry flag when turnStartedAt changes (new turn)
  useEffect(() => {
    if (turnStartedAt) {
      hasExpiredRef.current = false;
    }
  }, [turnStartedAt]);

  // Main timer effect: compute remaining from server timestamp
  useEffect(() => {
    clearTimerInterval();

    if (!enabled || !turnStartedAt) {
      // No active timer - show full time
      setRemainingTime(turnTimeSeconds);
      return;
    }

    const turnStartMs = new Date(turnStartedAt).getTime();

    // Compute immediately
    const computeRemaining = () => {
      const elapsed = (Date.now() - turnStartMs) / 1000;
      const remaining = Math.max(0, turnTimeSeconds - elapsed);
      setRemainingTime(Math.ceil(remaining));

      if (remaining <= 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        clearTimerInterval();
        console.log(`[useTurnTimer] Time expired for room ${roomId}!`);
        setTimeout(() => onTimeExpired?.(), 0);
      }
    };

    computeRemaining();

    // Tick every second
    intervalRef.current = setInterval(computeRemaining, 1000);

    return () => clearTimerInterval();
  }, [enabled, turnStartedAt, turnTimeSeconds, onTimeExpired, roomId, clearTimerInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimerInterval();
  }, [clearTimerInterval]);

  const isLowTime = remainingTime <= 30;
  const isCriticalTime = remainingTime <= 10;

  return {
    remainingTime,
    isLowTime,
    isCriticalTime,
    resetTimer,
    pauseTimer,
    resumeTimer,
    isPaused: false,
  };
}

// Default turn time for ranked games (in seconds)
export const DEFAULT_RANKED_TURN_TIME = 60;
