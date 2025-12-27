/**
 * Match history and head-to-head tracking utilities
 */

import { supabase } from "@/integrations/supabase/client";

interface LogMatchParams {
  roomPda: string;
  originRoomPda?: string;
  isRematch: boolean;
  gameType: string;
  maxPlayers: number;
  stakeLamports: number;
  creatorWallet: string;
}

interface UpdateH2HParams {
  playerA: string;
  playerB: string;
  winner: string;
  gameType: string;
  roomPda: string;
}

/**
 * Log a match when a room is created
 */
export async function logMatchCreated(params: LogMatchParams): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('matches')
      .insert({
        room_pda: params.roomPda,
        origin_room_pda: params.originRoomPda || null,
        is_rematch: params.isRematch,
        game_type: params.gameType,
        max_players: params.maxPlayers,
        stake_lamports: params.stakeLamports,
        creator_wallet: params.creatorWallet,
        status: 'created',
      });

    if (error) {
      console.error('[MatchHistory] Failed to log match:', error);
      return { ok: false, error: error.message };
    }

    console.log('[MatchHistory] Match logged:', params.roomPda);
    return { ok: true };
  } catch (err: any) {
    console.error('[MatchHistory] Error logging match:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Update match status when game is finalized
 */
export async function logMatchFinalized(
  roomPda: string, 
  winnerWallet: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('matches')
      .update({
        winner_wallet: winnerWallet,
        status: 'finalized',
        finalized_at: new Date().toISOString(),
      })
      .eq('room_pda', roomPda);

    if (error) {
      console.error('[MatchHistory] Failed to update match finalized:', error);
      return { ok: false, error: error.message };
    }

    console.log('[MatchHistory] Match finalized:', roomPda);
    return { ok: true };
  } catch (err: any) {
    console.error('[MatchHistory] Error updating match:', err);
    return { ok: false, error: err.message };
  }
}

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
 * Update head-to-head stats after a game is finalized
 * Only call this AFTER on-chain finalize confirms
 */
export async function updateH2HStats(params: UpdateH2HParams): Promise<{ ok: boolean; error?: string }> {
  try {
    const { a, b, swapped } = normalizePlayerOrder(params.playerA, params.playerB);
    const winnerIsA = swapped ? params.winner === params.playerB : params.winner === params.playerA;
    
    // First, try to fetch existing h2h record
    const { data: existing, error: fetchError } = await supabase
      .from('h2h')
      .select('*')
      .eq('player_a_wallet', a)
      .eq('player_b_wallet', b)
      .eq('game_type', params.gameType)
      .maybeSingle();

    if (fetchError) {
      console.error('[H2H] Failed to fetch existing record:', fetchError);
      return { ok: false, error: fetchError.message };
    }

    if (existing) {
      // Update existing record
      const newAWins = winnerIsA ? existing.a_wins + 1 : existing.a_wins;
      const newBWins = winnerIsA ? existing.b_wins : existing.b_wins + 1;
      
      // Calculate streak
      let newStreakOwner = params.winner;
      let newStreak = 1;
      
      if (existing.current_streak_owner === params.winner) {
        // Continuing streak
        newStreak = existing.current_streak + 1;
      }

      const { error: updateError } = await supabase
        .from('h2h')
        .update({
          a_wins: newAWins,
          b_wins: newBWins,
          total_games: existing.total_games + 1,
          last_winner: params.winner,
          current_streak_owner: newStreakOwner,
          current_streak: newStreak,
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('[H2H] Failed to update record:', updateError);
        return { ok: false, error: updateError.message };
      }

      console.log('[H2H] Updated h2h stats:', { a, b, gameType: params.gameType, winner: params.winner });
    } else {
      // Insert new record
      const { error: insertError } = await supabase
        .from('h2h')
        .insert({
          player_a_wallet: a,
          player_b_wallet: b,
          game_type: params.gameType,
          a_wins: winnerIsA ? 1 : 0,
          b_wins: winnerIsA ? 0 : 1,
          total_games: 1,
          last_winner: params.winner,
          current_streak_owner: params.winner,
          current_streak: 1,
        });

      if (insertError) {
        console.error('[H2H] Failed to insert record:', insertError);
        return { ok: false, error: insertError.message };
      }

      console.log('[H2H] Created new h2h record:', { a, b, gameType: params.gameType, winner: params.winner });
    }

    return { ok: true };
  } catch (err: any) {
    console.error('[H2H] Error updating stats:', err);
    return { ok: false, error: err.message };
  }
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
