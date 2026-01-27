/**
 * Hook to detect when opponent's turn timer has expired.
 * 
 * Polls the database to check if opponent has timed out, enabling the waiting
 * player to claim the timeout and advance the game even if the opponent goes offline.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface UseOpponentTimeoutOptions {
  /** Room PDA to check */
  roomPda: string;
  /** Whether detection is enabled */
  enabled: boolean;
  /** Whether it's currently my turn (if true, no need to poll) */
  isMyTurn: boolean;
  /** Turn time in seconds */
  turnTimeSeconds: number;
  /** My wallet address */
  myWallet: string;
  /** Callback when opponent timeout is detected */
  onOpponentTimeout: (missedCount: number) => void;
  /** Callback when auto-forfeit should trigger (3 misses) */
  onAutoForfeit?: () => void;
}

interface UseOpponentTimeoutResult {
  /** Number of consecutive missed turns by opponent */
  opponentMissedCount: number;
  /** Whether we're currently checking for timeout */
  isChecking: boolean;
  /** Reset missed count (call when opponent makes a valid move) */
  resetMissedCount: () => void;
}

const POLL_INTERVAL_MS = 2500; // Poll every 2.5 seconds
const MAX_MISSES_BEFORE_FORFEIT = 3;
const GRACE_PERIOD_SECONDS = 3; // Allow 3 second grace for network latency

export function useOpponentTimeoutDetection(
  options: UseOpponentTimeoutOptions
): UseOpponentTimeoutResult {
  const {
    roomPda,
    enabled,
    isMyTurn,
    turnTimeSeconds,
    myWallet,
    onOpponentTimeout,
    onAutoForfeit,
  } = options;

  const [opponentMissedCount, setOpponentMissedCount] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  
  // Refs to prevent stale closures and duplicate processing
  const lastProcessedTurnStartRef = useRef<string | null>(null);
  const processingTimeoutRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const resetMissedCount = useCallback(() => {
    setOpponentMissedCount(0);
    lastProcessedTurnStartRef.current = null;
    console.log("[OpponentTimeout] Missed count reset");
  }, []);

  // Check for opponent timeout
  const checkOpponentTimeout = useCallback(async () => {
    if (!enabled || !roomPda || isMyTurn || processingTimeoutRef.current) {
      return;
    }

    try {
      setIsChecking(true);

      // Fetch current session state via edge function
      const { data, error } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });

      if (error || !data?.session) {
        console.warn("[OpponentTimeout] Failed to fetch session:", error);
        return;
      }

      const session = data.session;
      const {
        current_turn_wallet,
        turn_started_at,
        turn_time_seconds,
        status,
      } = session;

      // Skip if game is finished or it's my turn
      if (status === "finished") {
        return;
      }

      // Skip if it's my turn (current_turn_wallet matches my wallet)
      if (current_turn_wallet?.toLowerCase() === myWallet?.toLowerCase()) {
        return;
      }

      // Skip if no turn started yet
      if (!turn_started_at) {
        return;
      }

      // Calculate if opponent has timed out
      const turnStartTime = new Date(turn_started_at).getTime();
      const effectiveTurnTime = turn_time_seconds || turnTimeSeconds;
      const expiryTime = turnStartTime + (effectiveTurnTime * 1000);
      const now = Date.now();
      const graceExpiryTime = expiryTime + (GRACE_PERIOD_SECONDS * 1000);

      // Check if we already processed this specific turn start
      // FIX: Include current_turn_wallet in key to prevent duplicate processing after turn switches
      const turnStartKey = `${turn_started_at}|${current_turn_wallet}`;
      if (lastProcessedTurnStartRef.current === turnStartKey) {
        return; // Already processed this timeout
      }

      // Only trigger if past grace period
      if (now > graceExpiryTime) {
        processingTimeoutRef.current = true;
        lastProcessedTurnStartRef.current = turnStartKey;

        const newMissedCount = opponentMissedCount + 1;
        setOpponentMissedCount(newMissedCount);

        console.log(
          `[OpponentTimeout] Opponent timeout detected! Miss #${newMissedCount}, turn_started_at: ${turn_started_at}`
        );

        // Show toast notification
        toast({
          title: `Opponent missed their turn (${newMissedCount}/${MAX_MISSES_BEFORE_FORFEIT})`,
          description:
            newMissedCount >= MAX_MISSES_BEFORE_FORFEIT
              ? "Auto-forfeit triggered!"
              : "Turn switches to you.",
          variant: newMissedCount >= MAX_MISSES_BEFORE_FORFEIT ? "destructive" : "default",
        });

        // Trigger appropriate callback
        if (newMissedCount >= MAX_MISSES_BEFORE_FORFEIT && onAutoForfeit) {
          onAutoForfeit();
        } else {
          onOpponentTimeout(newMissedCount);
        }

        // Reset processing flag after a delay to prevent rapid re-processing
        setTimeout(() => {
          processingTimeoutRef.current = false;
        }, 5000);
      }
    } catch (err) {
      console.error("[OpponentTimeout] Error checking timeout:", err);
    } finally {
      setIsChecking(false);
    }
  }, [
    enabled,
    roomPda,
    isMyTurn,
    myWallet,
    turnTimeSeconds,
    opponentMissedCount,
    onOpponentTimeout,
    onAutoForfeit,
  ]);

  // Polling effect
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only poll when it's opponent's turn and enabled
    if (!enabled || isMyTurn || !roomPda) {
      return;
    }

    // Initial check
    checkOpponentTimeout();

    // Set up polling interval
    intervalRef.current = setInterval(checkOpponentTimeout, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, isMyTurn, roomPda, checkOpponentTimeout]);

  // Reset processing ref when turn changes
  useEffect(() => {
    if (isMyTurn) {
      processingTimeoutRef.current = false;
    }
  }, [isMyTurn]);

  return {
    opponentMissedCount,
    isChecking,
    resetMissedCount,
  };
}
