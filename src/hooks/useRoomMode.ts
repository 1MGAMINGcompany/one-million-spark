/**
 * Hook to get the authoritative room mode from the database
 * 
 * This fixes the issue where Player 2 sees "casual" mode because their
 * localStorage doesn't have the mode data that Player 1 set when creating the room.
 * 
 * The database (game_sessions.mode) is the authoritative source.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getRoomModeData, RoomModeData } from "@/hooks/useGameSessionPersistence";

interface UseRoomModeResult {
  mode: 'casual' | 'ranked';
  isRanked: boolean;
  turnTimeSeconds: number;
  stakeLamports: number;
  isLoaded: boolean;
}

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 800;

export function useRoomMode(roomPda: string | undefined): UseRoomModeResult {
  const [mode, setMode] = useState<'casual' | 'ranked'>('casual');
  const [turnTimeSeconds, setTurnTimeSeconds] = useState(60);
  const [stakeLamports, setStakeLamports] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [fetchAttempts, setFetchAttempts] = useState(0);

  useEffect(() => {
    if (!roomPda) {
      setIsLoaded(true);
      return;
    }

    // Step 1: Immediately use localStorage if available (instant feedback)
    const localData = getRoomModeData(roomPda);
    setMode(localData.mode);
    setTurnTimeSeconds(localData.turnTimeSeconds);
    setStakeLamports(localData.stakeLamports);
    
    // If we have local data with ranked mode, we can trust it immediately
    if (localData.mode === 'ranked') {
      console.log("[useRoomMode] Local mode is ranked, trusting it immediately");
      setIsLoaded(true);
    }

    // Step 2: Fetch from database (authoritative source)
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
          // Retry if we haven't reached max attempts
          if (fetchAttempts < MAX_RETRIES) {
            console.log("[useRoomMode] No game_session found, will retry in", RETRY_DELAY_MS, "ms");
            setTimeout(() => setFetchAttempts(prev => prev + 1), RETRY_DELAY_MS);
            return;
          }
          console.log("[useRoomMode] Max retries reached, no game_session found");
          setIsLoaded(true);
          return;
        }

        const dbMode = (data.mode as 'casual' | 'ranked') || 'casual';
        const dbTurnTime = data.turn_time_seconds || 60;

        console.log("[useRoomMode] DB mode fetched:", { dbMode, dbTurnTime, localMode: localData.mode });

        // If DB has different mode, update state and sync to localStorage
        if (dbMode !== mode || dbTurnTime !== turnTimeSeconds) {
          console.log("[useRoomMode] DB mode differs from current, updating:", {
            current: mode,
            db: dbMode,
          });

          setMode(dbMode);
          setTurnTimeSeconds(dbTurnTime);

          // Sync to localStorage for future reads
          const updatedData: RoomModeData = {
            mode: dbMode,
            turnTimeSeconds: dbTurnTime,
            stakeLamports: localData.stakeLamports, // Keep stake from local (comes from on-chain)
          };
          localStorage.setItem(`room_mode_${roomPda}`, JSON.stringify(updatedData));
        }

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
    stakeLamports,
    isLoaded,
  };
}
