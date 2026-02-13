import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseRoomRealtimeAlertOptions {
  roomPda: string | null;
  enabled?: boolean;
  onOpponentJoined: (session: any) => void;
}

/**
 * Subscribes to Supabase Realtime for instant "opponent joined" detection.
 * Fires when game_sessions.status_int transitions from 1 (waiting) → 2 (active).
 * This supplements the existing 5-second on-chain polling with sub-500ms latency.
 */
export function useRoomRealtimeAlert({
  roomPda,
  enabled = true,
  onOpponentJoined,
}: UseRoomRealtimeAlertOptions) {
  const firedRef = useRef(false);
  const callbackRef = useRef(onOpponentJoined);
  callbackRef.current = onOpponentJoined;

  useEffect(() => {
    if (!roomPda || !enabled) return;
    firedRef.current = false;

    console.log("[RealtimeAlert] Subscribing to room:", roomPda.slice(0, 8));

    const channel = supabase
      .channel(`room-alert-${roomPda}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_sessions",
          filter: `room_pda=eq.${roomPda}`,
        },
        (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;

          // Detect waiting → active transition
          if (
            !firedRef.current &&
            oldRow?.status_int === 1 &&
            newRow?.status_int === 2
          ) {
            firedRef.current = true;
            console.log("[RealtimeAlert] 🎮 Opponent joined! (realtime)", roomPda.slice(0, 8));
            callbackRef.current(newRow);
          }
        }
      )
      .subscribe();

    return () => {
      console.log("[RealtimeAlert] Unsubscribing from room:", roomPda.slice(0, 8));
      supabase.removeChannel(channel);
    };
  }, [roomPda, enabled]);
}
