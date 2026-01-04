/**
 * Hook to get the authoritative room mode from the database
 * 
 * IMPORTANT: The database (game_sessions.mode) is the ONLY source of truth.
 * We do NOT use localStorage for mode decisions - this prevents cross-device mismatches.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseRoomModeResult {
  mode: 'casual' | 'ranked';
  isRanked: boolean;
  turnTimeSeconds: number;
  isLoaded: boolean;
}

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 800;

export function useRoomMode(roomPda: string | undefined): UseRoomModeResult {
  const [mode, setMode] = useState<'casual' | 'ranked'>('casual');
  const [turnTimeSeconds, setTurnTimeSeconds] = useState(60);
  const [isLoaded, setIsLoaded] = useState(false);
  const [fetchAttempts, setFetchAttempts] = useState(0);

  useEffect(() => {
    if (!roomPda) {
      setIsLoaded(true);
      return;
    }

    const fetchModeFromDB = async () => {
      try {
        console.log("[useRoomMode] Fetching mode from DB, attempt:", fetchAttempts + 1);
        
        const { data, error } = await supabase
          .from("game_sessions")
          .select("mode, turn_time_seconds")
          .eq("room_pda", roomPda)
          .maybeSingle();

        if (error) {
          console.warn("[useRoomMode] DB query error:", error);
          setIsLoaded(true);
          return;
        }

        if (!data) {
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

        const dbMode = (data.mode as 'casual' | 'ranked') || 'casual';
        const dbTurnTime = data.turn_time_seconds || 60;

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

  console.log("[useRoomMode] Current state:", { roomPda: roomPda?.slice(0, 8), mode, isLoaded, fetchAttempts });

  return {
    mode,
    isRanked: mode === 'ranked',
    turnTimeSeconds,
    isLoaded,
  };
}
