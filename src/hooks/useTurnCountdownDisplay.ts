/**
 * Display-only countdown timer for turn-based games.
 * 
 * Calculates remaining time from server truth (turn_started_at + turn_time_seconds).
 * Ticks locally every second for smooth UI without polling the database.
 * 
 * Use this hook for DISPLAY purposes - it shows the ACTIVE player's remaining time
 * on BOTH devices (not just the player whose turn it is).
 * 
 * For ENFORCEMENT (triggering timeout callbacks), use useTurnTimer instead.
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface UseTurnCountdownDisplayOptions {
  /** ISO timestamp when current turn started (from DB) */
  turnStartedAt: string | null | undefined;
  /** Turn time limit in seconds */
  turnTimeSeconds: number;
  /** Whether display is enabled */
  enabled: boolean;
}

interface UseTurnCountdownDisplayResult {
  /** Remaining time for current turn, or null if not active */
  displayRemainingTime: number | null;
  /** Low time warning (<=30s) */
  isLowTime: boolean;
  /** Critical time (<=10s) */
  isCriticalTime: boolean;
}

export function useTurnCountdownDisplay(options: UseTurnCountdownDisplayOptions): UseTurnCountdownDisplayResult {
  const { turnStartedAt, turnTimeSeconds, enabled } = options;
  
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to calculate remaining time from timestamp
  const calculateRemaining = useCallback((): number | null => {
    if (!enabled || !turnStartedAt || turnTimeSeconds <= 0) {
      return null;
    }
    
    const turnStartMs = new Date(turnStartedAt).getTime();
    if (isNaN(turnStartMs)) {
      return null;
    }
    
    const elapsedSecs = Math.floor((Date.now() - turnStartMs) / 1000);
    const remaining = Math.max(0, turnTimeSeconds - elapsedSecs);
    return remaining;
  }, [enabled, turnStartedAt, turnTimeSeconds]);

  // Clear interval helper
  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Main effect: calculate and tick
  useEffect(() => {
    if (!enabled || !turnStartedAt || turnTimeSeconds <= 0) {
      clearTimer();
      setRemainingTime(null);
      return;
    }

    // Immediate calculation
    const initial = calculateRemaining();
    setRemainingTime(initial);

    // Tick every second
    intervalRef.current = setInterval(() => {
      const current = calculateRemaining();
      setRemainingTime(current);
    }, 1000);

    return clearTimer;
  }, [enabled, turnStartedAt, turnTimeSeconds, calculateRemaining, clearTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  const isLowTime = remainingTime !== null && remainingTime <= 30;
  const isCriticalTime = remainingTime !== null && remainingTime <= 10;

  return {
    displayRemainingTime: remainingTime,
    isLowTime,
    isCriticalTime,
  };
}
