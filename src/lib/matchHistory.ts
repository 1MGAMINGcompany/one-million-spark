/**
 * Match history and head-to-head tracking utilities
 * 
 * IMPORTANT: All write operations (matches, h2h, player_profiles) are handled
 * by the record_match_result SECURITY DEFINER RPC function. Direct client-side
 * writes are blocked by RLS policies. This module only provides read utilities.
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Normalize player order for consistent h2h records
 * Always stores player_a < player_b lexicographically
 */
function normalizePlayerOrder(playerA: string, playerB: string): { a: string; b: string; swapped: boolean } {
  if (playerA.toLowerCase() < playerB.toLowerCase()) {
    return { a: playerA, b: playerB, swapped: false };
  }
  return { a: playerB, b: playerA, swapped: true };
}

/**
 * Get head-to-head stats between two players
 */
export async function getH2HStats(
  playerA: string, 
  playerB: string, 
  gameType?: string
): Promise<{ 
  ok: boolean; 
  data?: { 
    aWins: number; 
    bWins: number; 
    totalGames: number; 
    lastWinner: string | null;
    streakOwner: string | null;
    streak: number;
  }; 
  error?: string 
}> {
  try {
    const { a, b, swapped } = normalizePlayerOrder(playerA, playerB);
    
    let query = supabase
      .from('h2h')
      .select('*')
      .eq('player_a_wallet', a)
      .eq('player_b_wallet', b);
    
    if (gameType) {
      query = query.eq('game_type', gameType);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data) {
      return { 
        ok: true, 
        data: { 
          aWins: 0, 
          bWins: 0, 
          totalGames: 0, 
          lastWinner: null,
          streakOwner: null,
          streak: 0,
        } 
      };
    }

    // Return wins in the original player order
    return {
      ok: true,
      data: {
        aWins: swapped ? data.b_wins : data.a_wins,
        bWins: swapped ? data.a_wins : data.b_wins,
        totalGames: data.total_games,
        lastWinner: data.last_winner,
        streakOwner: data.current_streak_owner,
        streak: data.current_streak,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
