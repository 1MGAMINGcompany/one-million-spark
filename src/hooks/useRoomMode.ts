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

export function useRoomMode(roomPda: string | undefined): UseRoomModeResult {
  const [mode, setMode] = useState<'casual' | 'ranked'>('casual');
  const [turnTimeSeconds, setTurnTimeSeconds] = useState(60);
  const [stakeLamports, setStakeLamports] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

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

    // Step 2: Fetch from database (authoritative source)
    const fetchModeFromDB = async () => {
      try {
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

        if (data) {
          const dbMode = (data.mode as 'casual' | 'ranked') || 'casual';
          const dbTurnTime = data.turn_time_seconds || 60;

          // If DB has different mode, update state and sync to localStorage
          if (dbMode !== localData.mode || dbTurnTime !== localData.turnTimeSeconds) {
            console.log("[useRoomMode] DB mode differs from local, syncing:", {
              local: localData.mode,
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
        }

        setIsLoaded(true);
      } catch (err) {
        console.error("[useRoomMode] Failed to fetch mode from DB:", err);
        setIsLoaded(true);
      }
    };

    fetchModeFromDB();
  }, [roomPda]);

  return {
    mode,
    isRanked: mode === 'ranked',
    turnTimeSeconds,
    stakeLamports,
    isLoaded,
  };
}
