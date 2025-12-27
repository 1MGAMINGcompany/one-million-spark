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

// ============================================
// Player Profile Updates
// ============================================

interface UpdatePlayerProfileParams {
  wallet: string;
  isWinner: boolean;
  gameType: string;
  potSolWon?: number; // SOL amount won (only for winner)
}

/**
 * Update a single player's profile after game finalization
 * Creates profile if it doesn't exist
 */
async function updateSinglePlayerProfile(params: UpdatePlayerProfileParams): Promise<{ ok: boolean; error?: string }> {
  const { wallet, isWinner, gameType, potSolWon = 0 } = params;
  const now = new Date().toISOString();

  try {
    // First, try to fetch existing profile
    const { data: existing, error: fetchError } = await supabase
      .from('player_profiles')
      .select('*')
      .eq('wallet', wallet)
      .maybeSingle();

    if (fetchError) {
      console.error('[PlayerProfile] Failed to fetch profile:', fetchError);
      return { ok: false, error: fetchError.message };
    }

    if (existing) {
      // Update existing profile
      const newGamesPlayed = existing.games_played + 1;
      const newWins = isWinner ? existing.wins + 1 : existing.wins;
      const newLosses = isWinner ? existing.losses : existing.losses + 1;
      const newCurrentStreak = isWinner ? existing.current_streak + 1 : 0;
      const newLongestStreak = Math.max(existing.longest_streak, newCurrentStreak);
      const newTotalSolWon = isWinner 
        ? Number(existing.total_sol_won) + potSolWon 
        : Number(existing.total_sol_won);
      const newBiggestPotWon = isWinner 
        ? Math.max(Number(existing.biggest_pot_won), potSolWon) 
        : Number(existing.biggest_pot_won);

      // Calculate favorite game (simple: track in a separate query or use most recent)
      // For now, we'll update favorite_game based on frequency from matches table
      const favoriteGame = await calculateFavoriteGame(wallet) || gameType;

      const { error: updateError } = await supabase
        .from('player_profiles')
        .update({
          games_played: newGamesPlayed,
          wins: newWins,
          losses: newLosses,
          current_streak: newCurrentStreak,
          longest_streak: newLongestStreak,
          total_sol_won: newTotalSolWon,
          biggest_pot_won: newBiggestPotWon,
          favorite_game: favoriteGame,
          last_game_at: now,
        })
        .eq('wallet', wallet);

      if (updateError) {
        console.error('[PlayerProfile] Failed to update profile:', updateError);
        return { ok: false, error: updateError.message };
      }

      console.log('[PlayerProfile] Updated profile:', { wallet: wallet.slice(0, 8), isWinner });
    } else {
      // Insert new profile
      const { error: insertError } = await supabase
        .from('player_profiles')
        .insert({
          wallet,
          games_played: 1,
          wins: isWinner ? 1 : 0,
          losses: isWinner ? 0 : 1,
          current_streak: isWinner ? 1 : 0,
          longest_streak: isWinner ? 1 : 0,
          total_sol_won: isWinner ? potSolWon : 0,
          biggest_pot_won: isWinner ? potSolWon : 0,
          favorite_game: gameType,
          last_game_at: now,
        });

      if (insertError) {
        console.error('[PlayerProfile] Failed to insert profile:', insertError);
        return { ok: false, error: insertError.message };
      }

      console.log('[PlayerProfile] Created new profile:', { wallet: wallet.slice(0, 8), isWinner });
    }

    return { ok: true };
  } catch (err: any) {
    console.error('[PlayerProfile] Error updating profile:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Calculate the most-played game type for a player
 */
async function calculateFavoriteGame(wallet: string): Promise<string | null> {
  try {
    // Query matches where this wallet participated (as creator or in a finalized game)
    const { data, error } = await supabase
      .from('matches')
      .select('game_type')
      .or(`creator_wallet.eq.${wallet},winner_wallet.eq.${wallet}`)
      .eq('status', 'finalized');

    if (error || !data || data.length === 0) {
      return null;
    }

    // Count occurrences of each game type
    const counts: Record<string, number> = {};
    for (const match of data) {
      counts[match.game_type] = (counts[match.game_type] || 0) + 1;
    }

    // Find the most frequent
    let maxCount = 0;
    let favorite: string | null = null;
    for (const [gameType, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        favorite = gameType;
      }
    }

    return favorite;
  } catch {
    return null;
  }
}

interface UpdateAllPlayerProfilesParams {
  players: string[]; // All player wallets in the game
  winner: string; // Winner wallet
  gameType: string;
  potSolWon: number; // Total pot won by winner (in SOL)
}

/**
 * Update all player profiles after a game is finalized
 * Call this ONLY after on-chain finalize confirms
 */
export async function updatePlayerProfiles(params: UpdateAllPlayerProfilesParams): Promise<{ ok: boolean; errors?: string[] }> {
  const { players, winner, gameType, potSolWon } = params;
  const errors: string[] = [];

  console.log('[PlayerProfile] Updating profiles for', players.length, 'players. Winner:', winner.slice(0, 8));

  // Update each player's profile
  for (const wallet of players) {
    const isWinner = wallet === winner;
    const result = await updateSinglePlayerProfile({
      wallet,
      isWinner,
      gameType,
      potSolWon: isWinner ? potSolWon : 0,
    });

    if (!result.ok && result.error) {
      errors.push(`${wallet.slice(0, 8)}: ${result.error}`);
    }
  }

  if (errors.length > 0) {
    console.warn('[PlayerProfile] Some profile updates failed:', errors);
    return { ok: false, errors };
  }

  console.log('[PlayerProfile] All profiles updated successfully');
  return { ok: true };
}
