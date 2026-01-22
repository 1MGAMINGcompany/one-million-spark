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
  /** Wallet whose turn is currently active (for watchdog enforcement) */
  activeTurnWallet?: string | null;
  /** Callback when time expires on my turn (auto-forfeit) */
  onTimeExpired?: (timedOutWallet?: string | null) => void;
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
  const { turnTimeSeconds, enabled, isMyTurn, activeTurnWallet, onTimeExpired, roomId } = options;
  
  const [remainingTime, setRemainingTime] = useState(turnTimeSeconds);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasExpiredRef = useRef(false);
  const lastTurnKeyRef = useRef<string>("");

  // Clear interval helper
  const clearTimerInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Reset timer to full time
  const resetTimer = useCallback(() => {
    clearTimerInterval();
    setRemainingTime(turnTimeSeconds);
    hasExpiredRef.current = false;
    console.log(`[useTurnTimer] Timer reset to ${turnTimeSeconds}s for room ${roomId}`);
  }, [turnTimeSeconds, roomId, clearTimerInterval]);

  // Pause timer
  const pauseTimer = useCallback(() => {
    clearTimerInterval();
    setIsPaused(true);
    console.log(`[useTurnTimer] Timer paused at ${remainingTime}s`);
  }, [remainingTime, clearTimerInterval]);

  // Resume timer
  const resumeTimer = useCallback(() => {
    setIsPaused(false);
    console.log(`[useTurnTimer] Timer resumed at ${remainingTime}s`);
  }, [remainingTime]);

  // Reset timer only when ACTIVE TURN truly changes (prevents reset-loops on desktop)
  useEffect(() => {
    if (!enabled) return;

    const key = `${activeTurnWallet || "none"}:${turnTimeSeconds}`;
    if (key === lastTurnKeyRef.current) return;

    lastTurnKeyRef.current = key;
    resetTimer();
  }, [enabled, activeTurnWallet, turnTimeSeconds, resetTimer]);

  // Main timer countdown effect
  useEffect(() => {
    if (!enabled || isPaused || turnTimeSeconds <= 0) {
      clearTimerInterval();
      return;
    }

    // Start countdown
    intervalRef.current = setInterval(() => {
      setRemainingTime((prev) => {
        const newTime = prev - 1;
        
        // Check for expiration
        if (newTime <= 0 && !hasExpiredRef.current) {
          hasExpiredRef.current = true;
          console.log(`[useTurnTimer] Time expired for room ${roomId}!`);
          
          // Clear interval before callback to prevent multiple calls
          clearTimerInterval();
          
          // Trigger callback on next tick to avoid state update during render
          setTimeout(() => {
            onTimeExpired?.();
          }, 0);
          
          return 0;
        }
        
        return Math.max(0, newTime);
      });
    }, 1000);

    return () => {
      clearTimerInterval();
    };
  }, [enabled, isPaused, isMyTurn, onTimeExpired, roomId, clearTimerInterval, turnTimeSeconds]);

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
