/**
 * useAutoSettlement - Automatically trigger on-chain settlement when a game ends
 * 
 * This hook watches for game-over conditions and calls the settle-game edge function
 * to execute submit_result and close_room on-chain.
 * 
 * Features:
 * - Idempotent: guards against double-calling with ref + server-side checks
 * - Maps winner color/identifier to wallet address
 * - Provides settling state and result for UI feedback
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SettlementResult {
  success: boolean;
  signature?: string;
  closeRoomSignature?: string;
  alreadySettled?: boolean;
  alreadyClosed?: boolean;
  error?: string;
}

export interface UseAutoSettlementParams {
  roomPda: string | undefined;
  /** Winner identifier - can be "gold"/"obsidian", "player1"/"player2", "me"/"opponent", or wallet address */
  winner: string | null;
  /** Map winner color to wallet: { gold: wallet1, obsidian: wallet2 } */
  winnerMap: Record<string, string>;
  /** Array of player wallets [player1, player2] for fallback */
  players: string[];
  /** Game type for logging */
  gameType: string;
  /** Game mode */
  mode?: "casual" | "ranked";
  /** Reason for game end */
  reason?: "gameover" | "resign" | "timeout";
  /** Only settle for ranked/staked games */
  isRanked?: boolean;
  /** My wallet address - used for "me"/"opponent" mapping */
  myWallet?: string | null;
}

export function useAutoSettlement({
  roomPda,
  winner,
  winnerMap,
  players,
  gameType,
  mode = "ranked",
  reason = "gameover",
  isRanked = true,
  myWallet,
}: UseAutoSettlementParams) {
  const [isSettling, setIsSettling] = useState(false);
  const [result, setResult] = useState<SettlementResult | null>(null);
  
  // Idempotency guard - prevent double-calling
  const isSettlingRef = useRef(false);
  const hasAttemptedRef = useRef(false);
  // Track the winner we settled for (to allow retry on different winner)
  const settledWinnerRef = useRef<string | null>(null);
  
  /**
   * Map winner identifier to wallet address
   */
  const resolveWinnerWallet = useCallback((): string | null => {
    if (!winner) return null;
    
    // If winner is already a full wallet address (44 chars base58)
    if (winner.length > 30) {
      return winner;
    }
    
    // Special case: "draw" - no winner
    if (winner === "draw") {
      return null;
    }
    
    // Map "me"/"opponent" using myWallet
    if (winner === "me" && myWallet) {
      return myWallet;
    }
    if (winner === "opponent" && myWallet && players.length >= 2) {
      return players.find(p => p.toLowerCase() !== myWallet.toLowerCase()) || null;
    }
    
    // Map using provided winnerMap (e.g., { gold: wallet1, obsidian: wallet2 })
    if (winnerMap[winner]) {
      return winnerMap[winner];
    }
    
    // Fallback: player1/player2 mapping
    if (winner === "player1" && players[0]) return players[0];
    if (winner === "player2" && players[1]) return players[1];
    
    console.warn("[useAutoSettlement] Could not resolve winner:", winner);
    return null;
  }, [winner, winnerMap, players, myWallet]);
  
  /**
   * Trigger settlement manually (can be called from UI if auto-trigger fails)
   */
  const settle = useCallback(async (): Promise<SettlementResult> => {
    if (!roomPda) {
      return { success: false, error: "Missing roomPda" };
    }
    
    const winnerWallet = resolveWinnerWallet();
    if (!winnerWallet) {
      return { success: false, error: "Could not resolve winner wallet" };
    }
    
    // Guard: already settling
    if (isSettlingRef.current) {
      console.log("[settle] Already in progress, skipping");
      return { success: false, error: "Settlement already in progress" };
    }
    
    isSettlingRef.current = true;
    setIsSettling(true);
    
    console.log("[settle] Calling settle-game", { 
      roomPda: roomPda.slice(0, 8) + "...", 
      winnerWallet: winnerWallet.slice(0, 8) + "...",
      reason,
      gameType,
    });
    
    try {
      const { data, error } = await supabase.functions.invoke("settle-game", {
        body: {
          roomPda,
          winnerWallet,
          reason,
          gameType,
          mode,
        },
      });
      
      console.log("[settle] Response:", data);
      
      if (error) {
        const errResult: SettlementResult = { 
          success: false, 
          error: error.message || "Edge function error" 
        };
        setResult(errResult);
        return errResult;
      }
      
      // Handle idempotent success cases
      if (data?.alreadySettled || data?.alreadyClosed) {
        const successResult: SettlementResult = {
          success: true,
          alreadySettled: data.alreadySettled,
          alreadyClosed: data.alreadyClosed,
          signature: data.signature,
        };
        setResult(successResult);
        settledWinnerRef.current = winnerWallet;
        return successResult;
      }
      
      // Normal success
      if (data?.success) {
        const successResult: SettlementResult = {
          success: true,
          signature: data.signature,
          closeRoomSignature: data.closeRoomSignature,
        };
        setResult(successResult);
        settledWinnerRef.current = winnerWallet;
        return successResult;
      }
      
      // Settlement failed
      const failResult: SettlementResult = {
        success: false,
        error: data?.error || "Settlement failed",
      };
      setResult(failResult);
      return failResult;
      
    } catch (err: any) {
      console.error("[settle] Exception:", err);
      const errResult: SettlementResult = {
        success: false,
        error: err.message || "Settlement exception",
      };
      setResult(errResult);
      return errResult;
    } finally {
      isSettlingRef.current = false;
      setIsSettling(false);
      hasAttemptedRef.current = true;
    }
  }, [roomPda, resolveWinnerWallet, reason, gameType, mode]);
  
  /**
   * Auto-trigger settlement when winner is detected
   */
  useEffect(() => {
    // Only settle for ranked games
    if (!isRanked) return;
    
    // Need a winner and room
    if (!winner || !roomPda) return;
    
    // Skip if winner is "draw" (handled differently)
    if (winner === "draw") return;
    
    // Resolve winner wallet
    const winnerWallet = resolveWinnerWallet();
    if (!winnerWallet) return;
    
    // Skip if we've already attempted to settle this winner
    if (hasAttemptedRef.current && settledWinnerRef.current === winnerWallet) {
      return;
    }
    
    // Skip if already settling
    if (isSettlingRef.current) return;
    
    console.log("[useAutoSettlement] Auto-triggering settlement for winner:", winnerWallet.slice(0, 8));
    
    // Trigger settlement
    settle();
    
  }, [winner, roomPda, isRanked, resolveWinnerWallet, settle]);
  
  /**
   * Reset state (useful for rematch)
   */
  const reset = useCallback(() => {
    hasAttemptedRef.current = false;
    settledWinnerRef.current = null;
    setResult(null);
  }, []);
  
  return {
    /** Whether settlement is currently in progress */
    isSettling,
    /** Result of the last settlement attempt */
    result,
    /** Manually trigger settlement */
    settle,
    /** Reset state for new game */
    reset,
  };
}
