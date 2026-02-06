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
  const { turnTimeSeconds, enabled, isMyTurn, onTimeExpired, roomId } = options;
  
  const [remainingTime, setRemainingTime] = useState(turnTimeSeconds);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasExpiredRef = useRef(false);
  
  // Store turnTimeSeconds in ref to avoid stale closures in resetTimer
  const turnTimeSecondsRef = useRef(turnTimeSeconds);
  useEffect(() => {
    turnTimeSecondsRef.current = turnTimeSeconds;
  }, [turnTimeSeconds]);

  // Verbose state logging for debugging timer issues
  useEffect(() => {
    console.log(`[useTurnTimer] State: enabled=${enabled}, isMyTurn=${isMyTurn}, isPaused=${isPaused}, remaining=${remainingTime}s, turnTime=${turnTimeSeconds}s, roomId=${roomId?.slice(0, 8) || "none"}`);
  }, [enabled, isMyTurn, isPaused, remainingTime, turnTimeSeconds, roomId]);

  // Clear interval helper
  const clearTimerInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Reset timer to full time (uses ref to avoid stale closure)
  const resetTimer = useCallback(() => {
    clearTimerInterval();
    setRemainingTime(turnTimeSecondsRef.current);
    hasExpiredRef.current = false;
    console.log(`[useTurnTimer] Timer reset to ${turnTimeSecondsRef.current}s for room ${roomId}`);
  }, [roomId, clearTimerInterval]);

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

  // Reset timer when turn changes (isMyTurn changes)
  useEffect(() => {
    if (enabled) {
      resetTimer();
    }
  }, [isMyTurn, enabled, resetTimer]);

  // Sync remaining time when turnTimeSeconds prop changes (DB data loaded)
  // Only update if timer isn't actively counting down
  useEffect(() => {
    if (enabled && !intervalRef.current) {
      setRemainingTime(turnTimeSeconds);
      console.log(`[useTurnTimer] turnTimeSeconds prop changed to ${turnTimeSeconds}s, synced remainingTime`);
    }
  }, [turnTimeSeconds, enabled]);

  // Main timer countdown effect
  useEffect(() => {
    if (!enabled || isPaused || !isMyTurn) {
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
  }, [enabled, isPaused, isMyTurn, onTimeExpired, roomId, clearTimerInterval]);

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
