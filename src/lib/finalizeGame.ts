/**
 * finalizeGame.ts - Authoritative game finalization helper
 * 
 * CRITICAL: This is the SINGLE source of truth for finalizing games and distributing payouts.
 * ALL game-ending paths MUST use this function:
 * - Normal win detection
 * - Manual forfeit
 * - Auto-forfeit (turn timeout)
 * - Draw settlement
 * 
 * Guarantees:
 * - Winner ALWAYS receives SOL (or error is clearly surfaced)
 * - Double payout prevention via finalize_receipts check
 * - game_sessions.status set to 'finished' after payout
 * - Transaction signature always logged
 */

import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { supabase } from "@/integrations/supabase/client";
import { finalizeRoom, FinalizeRoomResult } from "@/lib/finalize-room";
import bs58 from "bs58";

export interface FinalizeGameParams {
  /** Room PDA string */
  roomPda: string;
  /** Winner's wallet address */
  winnerWallet: string;
  /** Loser's wallet address (for forfeit edge function) */
  loserWallet?: string;
  /** Game type (chess, backgammon, etc.) */
  gameType: string;
  /** Stake in lamports */
  stakeLamports: number;
  /** Game mode (casual/ranked) */
  mode: 'casual' | 'ranked';
  /** Array of player wallets */
  players: string[];
  /** How the game ended */
  endReason: 'win' | 'forfeit' | 'timeout' | 'draw';
  /** Connection for on-chain calls */
  connection: Connection;
  // NOTE: sendTransaction and signerPubkey are NO LONGER USED for settlement
  // ALL settlement (forfeit/timeout/win) now goes through edge functions
  // These params are kept for backward compatibility but are no-ops
}

export interface FinalizeGameResult {
  success: boolean;
  /** Transaction signature if payout succeeded */
  signature?: string;
  /** Whether game was already settled (not an error) */
  alreadySettled?: boolean;
  /** Error message if failed */
  error?: string;
  /** Additional details for debugging */
  details?: string;
}

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Check if room is already settled via game-session-get edge function
 * Uses service-role via edge function to bypass RLS on finalize_receipts
 */
async function checkAlreadySettled(roomPda: string): Promise<{ settled: boolean; signature?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('game-session-get', {
      body: { roomPda },
    });
    
    if (error) {
      console.warn('[finalizeGame] Error checking settlement via edge fn:', error);
      return { settled: false };
    }
    
    if (!data?.ok) {
      console.warn('[finalizeGame] Edge fn returned not ok:', data);
      return { settled: false };
    }
    
    // Check if receipt exists with finalize_tx
    if (data.receipt?.finalize_tx) {
      console.log('[finalizeGame] Room already settled, tx:', data.receipt.finalize_tx);
      return { settled: true, signature: data.receipt.finalize_tx };
    }
    
    return { settled: false };
  } catch (err) {
    console.warn('[finalizeGame] Exception checking settlement:', err);
    return { settled: false };
  }
}

// NOTE: recordFinalizeReceipt has been REMOVED
// The edge functions (forfeit-game, settle-game, settle-draw) handle 
// recording to finalize_receipts on the server side with service role.
// Client must NOT write to finalize_receipts directly.

/**
 * Update game_sessions.status to 'finished'
 */
async function markGameFinished(roomPda: string, winnerWallet: string): Promise<void> {
  try {
    // Call the finish_game_session RPC
    const { error: rpcError } = await supabase.rpc('finish_game_session', {
      p_room_pda: roomPda,
      p_caller_wallet: winnerWallet,
    });
    
    if (rpcError) {
      console.warn('[finalizeGame] finish_game_session RPC error:', rpcError);
    } else {
      console.log('[finalizeGame] Game session marked finished');
    }
  } catch (err) {
    console.warn('[finalizeGame] Exception marking finished:', err);
  }
}

/**
 * Record match result for stats/leaderboard
 */
async function recordMatchResult(
  roomPda: string,
  signature: string,
  winnerWallet: string,
  gameType: string,
  stakeLamports: number,
  mode: string,
  players: string[]
): Promise<void> {
  try {
    const { error } = await supabase.rpc('record_match_result', {
      p_room_pda: roomPda,
      p_finalize_tx: signature,
      p_winner_wallet: winnerWallet,
      p_game_type: gameType,
      p_max_players: players.length,
      p_stake_lamports: stakeLamports,
      p_mode: mode,
      p_players: players,
    });
    
    if (error) {
      console.warn('[finalizeGame] record_match_result error:', error);
    } else {
      console.log('[finalizeGame] Match result recorded');
    }
  } catch (err) {
    console.warn('[finalizeGame] Exception recording match:', err);
  }
}

/**
 * Finalize game via forfeit-game edge function (server-side verifier signs)
 * Used for: forfeit, timeout, auto-forfeit
 */
async function finalizeViaEdgeFunction(
  roomPda: string,
  loserWallet: string,
  gameType: string
): Promise<FinalizeGameResult> {
  console.log('[finalizeGame] Calling forfeit-game edge function...');
  
  // DEBUG: Log before edge function invocation
  console.log("[FORFEIT] supabase.functions.invoke('forfeit-game') STARTING", {
    roomPda,
    loserWallet,
    gameType,
    ts: new Date().toISOString(),
  });
  
  try {
    // NEW: signed authorization for forfeit-game
      const nonce = (globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2)) as string;
      const timestamp = Date.now();
      const message = `1MG_FORFEIT_V1|${roomPda}|${loserWallet}|${nonce}|${timestamp}`;

      const provider: any = (globalThis as any).solana;
      if (!provider?.signMessage) {
        throw new Error("Wallet does not support message signing (signMessage missing)");
      }

      const msgBytes = new TextEncoder().encode(message);
      const signed = await provider.signMessage(msgBytes, "utf8");
      const sigBytes = (signed?.signature ?? signed) as Uint8Array;
      const signature = bs58.encode(sigBytes);

      const { data, error } = await supabase.functions.invoke('forfeit-game', {
        body: {
          roomPda,
          forfeitingWallet: loserWallet,
          mode: "signed",
          nonce,
          timestamp,
          signature,
          gameType,
        },
      });
    
    if (error) {
      console.error('[finalizeGame] Edge function error:', error);
      return {
        success: false,
        error: error.message || 'Edge function failed',
      };
    }
    
    if (!data) {
      return {
        success: false,
        error: 'No response from edge function',
      };
    }
    
    // Handle Ludo multi-player elimination (not a full settlement)
    if (data.action === 'eliminated') {
      console.log('[finalizeGame] Player eliminated (Ludo), game continues');
      return {
        success: true,
        details: 'Player eliminated, game continues',
      };
    }
    
    // Detect VAULT_UNFUNDED error code
    if (data.error === "VAULT_UNFUNDED") {
      console.error('[finalizeGame] Vault underfunded:', data);
      return {
        success: false,
        error: "VAULT_UNFUNDED",
        details: `Vault has ${(data.vaultLamports ?? 0) / 1e9} SOL but needs ${(data.expectedPotLamports ?? 0) / 1e9} SOL. Game funding not complete.`,
      };
    }
    
    // Handle settlement failure from edge function
    if (data.status === 'needs_settlement' || !data.success) {
      return {
        success: false,
        error: data.error || 'Payout transaction failed',
        signature: data.signature,
        details: data.logs?.join('\n') || JSON.stringify(data.txErr),
      };
    }
    
    // Success
    console.log('[finalizeGame] Edge function success:', data.signature);
    return {
      success: true,
      signature: data.signature,
    };
  } catch (err: any) {
    console.error('[finalizeGame] Edge function exception:', err);
    return {
      success: false,
      error: err.message || 'Edge function call failed',
    };
  }
}

/**
 * Finalize game via client-side wallet signing (finalize_room instruction)
 * Used for: normal win where winner clicks "Claim Payout"
 */
async function finalizeViaClientWallet(
  connection: Connection,
  roomPda: string,
  winnerWallet: string,
  sendTransaction: (tx: VersionedTransaction, connection: Connection) => Promise<string | Uint8Array>,
  signerPubkey: PublicKey
): Promise<FinalizeRoomResult> {
  console.log('[finalizeGame] Finalizing via client wallet...');
  
  return finalizeRoom(
    connection,
    roomPda,
    winnerWallet,
    sendTransaction,
    signerPubkey
  );
}

/**
 * Main entry point - Finalize a game and distribute payouts
 * 
 * @param params - Finalization parameters
 * @returns Result with success status, signature, or error
 */
export async function finalizeGame(params: FinalizeGameParams): Promise<FinalizeGameResult> {
  const {
    roomPda,
    winnerWallet,
    loserWallet,
    gameType,
    stakeLamports,
    mode,
    players,
    endReason,
    connection,
  } = params;
  
  console.log('[finalizeGame] Starting finalization:', {
    roomPda: roomPda.slice(0, 8) + '...',
    winner: winnerWallet.slice(0, 8) + '...',
    endReason,
    stake: stakeLamports / LAMPORTS_PER_SOL + ' SOL',
    mode,
  });
  
  // Step 1: Check if already settled (prevent double payout)
  const { settled, signature: existingSignature } = await checkAlreadySettled(roomPda);
  if (settled) {
    console.log('[finalizeGame] Already settled, returning existing signature');
    return {
      success: true,
      alreadySettled: true,
      signature: existingSignature,
    };
  }
  
  // Step 2: Execute payout based on end reason
  // CRITICAL: ALL settlement goes through edge functions (server-side verifier)
  // No client-side wallet signing for forfeit/timeout/win - eliminates scary wallet popups
  let result: FinalizeGameResult;
  
  if (endReason === 'forfeit' || endReason === 'timeout') {
    // ALWAYS use edge function for forfeit/timeout - NO wallet popup
    if (!loserWallet) {
      return {
        success: false,
        error: 'loserWallet required for forfeit/timeout',
      };
    }
    
    console.log('[finalizeGame] Forfeit/timeout: using server-side settlement (no wallet popup)');
    result = await finalizeViaEdgeFunction(roomPda, loserWallet, gameType);
  } else if (endReason === 'draw') {
    // Draw settlement via settle-draw edge function
    console.log('[finalizeGame] Processing draw settlement...');
    try {
      const { data, error } = await supabase.functions.invoke('settle-draw', {
        body: {
          roomPda,
          callerWallet: winnerWallet, // Either player can trigger
          gameType,
        },
      });
      
      if (error) {
        result = { success: false, error: error.message };
      } else if (data?.error === "VAULT_UNFUNDED") {
        // Handle VAULT_UNFUNDED for draw settlement
        result = {
          success: false,
          error: "VAULT_UNFUNDED",
          details: `Vault has ${(data.vaultLamports ?? 0) / 1e9} SOL but needs ${(data.expectedPotLamports ?? 0) / 1e9} SOL.`,
        };
      } else if (data?.status === 'settled' || data?.status === 'already_resolved' || data?.ok) {
        result = { success: true, signature: data.signature };
      } else {
        result = { success: false, error: data?.message || 'Draw settlement failed' };
      }
    } catch (err: any) {
      result = { success: false, error: err.message || 'Draw settlement exception' };
    }
  } else {
    // Normal win - ALWAYS use edge function (no wallet popup)
    if (!loserWallet) {
      return {
        success: false,
        error: 'loserWallet required for win settlement',
      };
    }
    
    console.log('[finalizeGame] Win: using server-side settlement (no wallet popup)');
    result = await finalizeViaEdgeFunction(roomPda, loserWallet, gameType);
  }
  
  // Step 3: If payout succeeded, update database
  // NOTE: Receipt is recorded by edge functions (forfeit-game, settle-game, settle-draw)
  if (result.success && result.signature) {
    // Record match result for stats
    await recordMatchResult(
      roomPda,
      result.signature,
      winnerWallet,
      gameType,
      stakeLamports,
      mode,
      players
    );
    
    // Mark game session finished
    await markGameFinished(roomPda, winnerWallet);
    
    console.log('[finalizeGame] ✅ Payout complete:', result.signature);
  } else if (!result.success) {
    console.error('[finalizeGame] ❌ Payout failed:', result.error);
  }
  
  return result;
}

/**
 * Quick check if a room has been finalized
 */
export async function isRoomFinalized(roomPda: string): Promise<boolean> {
  const { settled } = await checkAlreadySettled(roomPda);
  return settled;
}
