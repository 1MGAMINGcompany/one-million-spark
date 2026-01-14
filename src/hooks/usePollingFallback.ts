/**
 * Polling Fallback Hook
 * 
 * When realtime drops (especially in wallet browsers), this polls the server
 * for session state and moves to keep the game in sync.
 * 
 * Features:
 * - Polls every 1500ms in wallet browsers OR when realtime is down > 2s
 * - Incremental move fetching (after_created_at)
 * - Stops automatically when game ends
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";

interface PollResult {
  session: any | null;
  moves: any[];
  success: boolean;
}

interface UsePollingFallbackOptions {
  roomPda: string | undefined;
  enabled: boolean;
  realtimeConnected: boolean;
  gameEnded: boolean;
  onSessionUpdate?: (session: any) => void;
  onNewMoves?: (moves: any[]) => void;
  onPollSuccess?: () => void;
}

const POLL_INTERVAL_MS = 1500;
const REALTIME_DOWN_THRESHOLD_MS = 2000;

export function usePollingFallback({
  roomPda,
  enabled,
  realtimeConnected,
  gameEnded,
  onSessionUpdate,
  onNewMoves,
  onPollSuccess,
}: UsePollingFallbackOptions) {
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState(0);
  const [pollCount, setPollCount] = useState(0);
  
  const lastMoveCreatedAt = useRef<string | null>(null);
  const realtimeDownSince = useRef<number | null>(null);
  const inWalletBrowser = isWalletInAppBrowser();

  // Track realtime status
  useEffect(() => {
    if (realtimeConnected) {
      realtimeDownSince.current = null;
    } else if (realtimeDownSince.current === null) {
      realtimeDownSince.current = Date.now();
    }
  }, [realtimeConnected]);

  // Determine if polling should be active
  const shouldPoll = useCallback(() => {
    if (!enabled || !roomPda || gameEnded) return false;
    
    // Always poll in wallet browsers
    if (inWalletBrowser) return true;
    
    // Poll if realtime has been down for > 2 seconds
    if (!realtimeConnected && realtimeDownSince.current) {
      const downDuration = Date.now() - realtimeDownSince.current;
      if (downDuration > REALTIME_DOWN_THRESHOLD_MS) return true;
    }
    
    return false;
  }, [enabled, roomPda, gameEnded, inWalletBrowser, realtimeConnected]);

  // Perform a single poll
  const doPoll = useCallback(async (): Promise<PollResult> => {
    if (!roomPda) {
      return { session: null, moves: [], success: false };
    }

    try {
      // Fetch session
      const { data: sessionResp, error: sessionError } = await supabase.functions.invoke(
        "game-session-get",
        { body: { roomPda } }
      );

      if (sessionError) {
        console.warn("[PollingFallback] Session fetch error:", sessionError);
        return { session: null, moves: [], success: false };
      }

      const session = sessionResp?.session || null;

      // Fetch moves (incremental)
      const { data: movesResp, error: movesError } = await supabase.functions.invoke(
        "get-moves",
        { 
          body: { 
            roomPda,
            afterCreatedAt: lastMoveCreatedAt.current || undefined,
          } 
        }
      );

      if (movesError) {
        console.warn("[PollingFallback] Moves fetch error:", movesError);
        // Still return session even if moves fail
        return { session, moves: [], success: true };
      }

      const moves = movesResp?.moves || [];

      // Update last move timestamp for incremental fetching
      if (moves.length > 0) {
        const latestMove = moves[moves.length - 1];
        if (latestMove.created_at) {
          lastMoveCreatedAt.current = latestMove.created_at;
        }
      }

      return { session, moves, success: true };
    } catch (e) {
      console.error("[PollingFallback] Poll error:", e);
      return { session: null, moves: [], success: false };
    }
  }, [roomPda]);

  // Polling effect
  useEffect(() => {
    if (!shouldPoll()) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    console.log("[PollingFallback] Starting polling", {
      inWalletBrowser,
      realtimeConnected,
      roomPda: roomPda?.slice(0, 8),
    });

    const poll = async () => {
      const result = await doPoll();
      setLastPollTime(Date.now());
      setPollCount((c) => c + 1);

      if (result.success) {
        onPollSuccess?.();

        if (result.session) {
          onSessionUpdate?.(result.session);
        }

        if (result.moves.length > 0) {
          console.log("[PollingFallback] New moves:", result.moves.length);
          onNewMoves?.(result.moves);
        }
      }
    };

    // Initial poll
    poll();

    // Set up interval
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  }, [shouldPoll, doPoll, onSessionUpdate, onNewMoves, onPollSuccess, inWalletBrowser, realtimeConnected, roomPda]);

  // Reset when room changes
  useEffect(() => {
    lastMoveCreatedAt.current = null;
    setPollCount(0);
  }, [roomPda]);

  return {
    isPolling,
    lastPollTime,
    pollCount,
    inWalletBrowser,
  };
}
