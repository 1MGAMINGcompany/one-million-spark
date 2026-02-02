/**
 * Hook to manage turn timer enforcement for ranked games
 * 
 * Tracks remaining time per turn and triggers auto-forfeit when time expires.
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface UseTurnTimerOptions {
  /** Turn time limit in seconds */
  turnTimeSeconds: number;
  /** Whether the timer is active (game started, ranked mode, etc.) */
  enabled: boolean;
  /** Whether it's currently this player's turn */
  isMyTurn: boolean;
  /** Callback when time expires on my turn (auto-forfeit) */
  onTimeExpired?: () => void;
  /** Room ID for logging */
  roomId?: string;
  /** ISO timestamp when current turn started (from DB). If provided, timer becomes DB-authoritative. */
  turnStartedAt?: string | null;
}

interface UseTurnTimerResult {
  /** Remaining time in seconds */
  remainingTime: number;
  /** Whether timer is in low time warning zone (<=30s) */
  isLowTime: boolean;
  /** Whether timer is in critical zone (<=10s) */
  isCriticalTime: boolean;
  /** Reset the timer (call when turn changes) */
  resetTimer: () => void;
  /** Pause the timer */
  pauseTimer: () => void;
  /** Resume the timer */
  resumeTimer: () => void;
  /** Whether timer is currently paused */
  isPaused: boolean;
}

export function useTurnTimer(options: UseTurnTimerOptions): UseTurnTimerResult {
  const { turnTimeSeconds, enabled, isMyTurn, onTimeExpired, roomId, turnStartedAt } = options;
  
  const [remainingTime, setRemainingTime] = useState(turnTimeSeconds);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasExpiredRef = useRef(false);

  // Helper: calculate remaining time from server timestamp (DB-authoritative mode)
  const calculateRemainingFromServer = useCallback((): number => {
    if (!turnStartedAt) return turnTimeSeconds;

    const startMs = new Date(turnStartedAt).getTime();
    if (isNaN(startMs)) return turnTimeSeconds;

    const elapsedSecs = Math.floor((Date.now() - startMs) / 1000);
    return Math.max(0, turnTimeSeconds - elapsedSecs);
  }, [turnStartedAt, turnTimeSeconds]);

  // Clear interval helper
  const clearTimerInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Reset timer (legacy: full time; DB-authoritative: snap to server remaining)
  const resetTimer = useCallback(() => {
    clearTimerInterval();
    hasExpiredRef.current = false;

    if (turnStartedAt) {
      setRemainingTime(calculateRemainingFromServer());
      console.log(
        `[useTurnTimer] Timer snap to server remaining for room ${roomId} (turnStartedAt=${turnStartedAt.slice(0, 19)})`
      );
      return;
    }

    setRemainingTime(turnTimeSeconds);
    console.log(`[useTurnTimer] Timer reset to ${turnTimeSeconds}s for room ${roomId}`);
  }, [turnTimeSeconds, roomId, clearTimerInterval, turnStartedAt, calculateRemainingFromServer]);

  // Pause timer
  const pauseTimer = useCallback(() => {
    clearTimerInterval();
    setIsPaused(true);
    console.log(`[useTurnTimer] Timer paused for room ${roomId}`);
  }, [clearTimerInterval, roomId]);

  // Resume timer
  const resumeTimer = useCallback(() => {
    setIsPaused(false);
    console.log(`[useTurnTimer] Timer resumed for room ${roomId}`);
  }, [roomId]);

  // Reset timer when it becomes MY turn OR when DB announces a new turnStartedAt
  useEffect(() => {
    if (enabled && isMyTurn) {
      resetTimer();
    }
  }, [isMyTurn, enabled, turnStartedAt, resetTimer]);

  // Main timer countdown effect
  useEffect(() => {
    if (!enabled || isPaused || !isMyTurn) {
      clearTimerInterval();
      return;
    }

    // Avoid multiple intervals
    clearTimerInterval();

    intervalRef.current = setInterval(() => {
      // DB-authoritative mode: recompute from timestamp every tick
      if (turnStartedAt) {
        const newTime = calculateRemainingFromServer();
        setRemainingTime(newTime);

        if (newTime <= 0 && !hasExpiredRef.current) {
          hasExpiredRef.current = true;
          console.log(`[useTurnTimer] Time expired for room ${roomId}!`);
          clearTimerInterval();
          setTimeout(() => {
            onTimeExpired?.();
          }, 0);
        }
        return;
      }

      // Legacy mode: decrement safely with functional update
      setRemainingTime((prev) => {
        const next = Math.max(0, prev - 1);

        if (next <= 0 && !hasExpiredRef.current) {
          hasExpiredRef.current = true;
          console.log(`[useTurnTimer] Time expired for room ${roomId}!`);
          clearTimerInterval();
          setTimeout(() => {
            onTimeExpired?.();
          }, 0);
        }

        return next;
      });
    }, 1000);

    return () => {
      clearTimerInterval();
    };
  }, [
    enabled,
    isPaused,
    isMyTurn,
    onTimeExpired,
    roomId,
    turnStartedAt,
    calculateRemainingFromServer,
    clearTimerInterval,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimerInterval();
    };
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
    isPaused,
  };
}

// Default turn time for ranked games (in seconds)
export const DEFAULT_RANKED_TURN_TIME = 60;
