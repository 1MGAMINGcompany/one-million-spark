/**
 * Session Refetch Utility (Phase 1)
 * 
 * Centralizes game session and moves refetch logic for recovery scenarios.
 * Phase 1: Fetches data only, does NOT apply to game engines.
 */

import { supabase } from "@/integrations/supabase/client";

export interface RefetchResult {
  session: any | null;
  moves: any[];
  success: boolean;
}

/**
 * Refetch game session and moves from server.
 * Phase 1: Returns raw data without applying to game engine.
 */
export async function refetchGameSession(roomPda: string): Promise<RefetchResult> {
  if (!roomPda) {
    console.warn("[SessionRefetch] No roomPda provided");
    return { session: null, moves: [], success: false };
  }

  console.log("[SessionRefetch] Refetching session for:", roomPda.slice(0, 8));

  try {
    // Fetch session and moves in parallel
    const [sessionResp, movesResp] = await Promise.all([
      supabase.functions.invoke("game-session-get", { 
        body: { roomPda } 
      }),
      supabase.functions.invoke("get-moves", { 
        body: { roomPda } 
      }),
    ]);

    const session = sessionResp.data?.session ?? null;
    const moves = movesResp.data?.moves ?? [];

    console.log("[SessionRefetch] Results:", {
      sessionOk: !sessionResp.error,
      sessionStatus: session?.status,
      movesCount: moves.length,
      sessionError: sessionResp.error?.message,
      movesError: movesResp.error?.message,
    });

    // Consider success if at least session fetch worked
    const success = !sessionResp.error && session !== null;

    return {
      session,
      moves,
      success,
    };
  } catch (e) {
    console.error("[SessionRefetch] Error:", e);
    return { session: null, moves: [], success: false };
  }
}
