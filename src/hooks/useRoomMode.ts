/**
 * Hook to get the authoritative room mode from the database
 * 
 * IMPORTANT: The database (game_sessions.mode) is the ONLY source of truth.
 * We do NOT use localStorage for mode decisions - this prevents cross-device mismatches.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseRoomModeOptions {
  /** If stake > 0, treat as ranked while loading (prevents timer hiding during fetch) */
  stakeFromChain?: number;
}

interface UseRoomModeResult {
  mode: 'casual' | 'ranked' | 'private';
  /** True for both 'ranked' AND 'private' - enforces rules gate, stake, forfeit */
  isRanked: boolean;
  turnTimeSeconds: number;
  isLoaded: boolean;
}

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 800;

export function useRoomMode(roomPda: string | undefined, options?: UseRoomModeOptions): UseRoomModeResult {
  const [mode, setMode] = useState<'casual' | 'ranked' | 'private'>('casual');
  const [turnTimeSeconds, setTurnTimeSeconds] = useState(60);
  const [isLoaded, setIsLoaded] = useState(false);
  const [fetchAttempts, setFetchAttempts] = useState(0);
  
  // If stake > 0, assume ranked while loading (prevents timer from hiding during DB fetch)
  const stakeFromChain = options?.stakeFromChain ?? 0;
  const assumeRankedWhileLoading = stakeFromChain > 0 && !isLoaded;

  useEffect(() => {
    if (!roomPda) {
      setIsLoaded(true);
      return;
    }

    const fetchModeFromDB = async () => {
      try {
        console.log("[useRoomMode] Fetching mode from DB via Edge Function, attempt:", fetchAttempts + 1);
        
        // Use Edge Function instead of direct table access (RLS locked)
        const { data: resp, error } = await supabase.functions.invoke("game-session-get", {
          body: { roomPda },
        });

        if (error) {
          console.warn("[useRoomMode] Edge function error:", error);
          setIsLoaded(true);
          return;
        }

        const session = resp?.session;
        if (!session) {
          // No data found - game_session might not be created yet
          if (fetchAttempts < MAX_RETRIES) {
            console.log("[useRoomMode] No game_session found, will retry in", RETRY_DELAY_MS, "ms");
            setTimeout(() => setFetchAttempts(prev => prev + 1), RETRY_DELAY_MS);
            return;
          }
          console.log("[useRoomMode] Max retries reached, defaulting to casual");
          setIsLoaded(true);
          return;
        }

        const dbMode = (session.mode as 'casual' | 'ranked' | 'private') || 'casual';
        const dbTurnTime = session.turn_time_seconds || 60;

        console.log("[useRoomMode] DB mode fetched:", { dbMode, dbTurnTime });

        setMode(dbMode);
        setTurnTimeSeconds(dbTurnTime);
        setIsLoaded(true);
      } catch (err) {
        console.error("[useRoomMode] Failed to fetch mode from DB:", err);
        setIsLoaded(true);
      }
    };

    fetchModeFromDB();
  }, [roomPda, fetchAttempts]);

  console.log("[useRoomMode] Current state:", { roomPda: roomPda?.slice(0, 8), mode, isLoaded, fetchAttempts, assumeRankedWhileLoading });

  // If stake exists on-chain but mode not yet loaded, assume ranked (safe default)
  // This ensures timer displays immediately instead of hiding during DB fetch
  const effectiveIsRanked = assumeRankedWhileLoading || mode === 'ranked' || mode === 'private';

  return {
    mode,
    // Private rooms use ranked enforcement (stake, rules gate, forfeit) but skip ELO
    isRanked: effectiveIsRanked,
    turnTimeSeconds,
    isLoaded,
  };
}
