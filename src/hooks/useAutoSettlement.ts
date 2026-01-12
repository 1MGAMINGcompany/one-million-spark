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
  /** Winner identifier - used to detect when game ends (actual wallet resolved server-side) */
  winner: string | null;
  /** Reason for game end */
  reason?: "gameover" | "resign" | "timeout";
  /** Only settle for ranked/staked games */
  isRanked?: boolean;
}

export function useAutoSettlement({
  roomPda,
  winner,
  reason = "gameover",
  isRanked = true,
}: UseAutoSettlementParams) {
  const [isSettling, setIsSettling] = useState(false);
  const [result, setResult] = useState<SettlementResult | null>(null);
  
  // Idempotency guard - prevent double-calling
  const isSettlingRef = useRef(false);
  const hasAttemptedRef = useRef(false);
  
  /**
   * Trigger settlement manually (can be called from UI if auto-trigger fails)
   */
  const settle = useCallback(async (): Promise<SettlementResult> => {
    if (!roomPda) {
      return { success: false, error: "Missing roomPda" };
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
      reason,
    });
    
    try {
      // Winner wallet is now determined server-side from game_sessions.game_state.gameOver
      const { data, error } = await supabase.functions.invoke("settle-game", {
        body: {
          roomPda,
          reason,
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
  }, [roomPda, reason]);
  
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
    
    // Skip if we've already attempted
    if (hasAttemptedRef.current) return;
    
    // Skip if already settling
    if (isSettlingRef.current) return;
    
    console.log("[useAutoSettlement] Auto-triggering settlement for room:", roomPda.slice(0, 8));
    
    // Trigger settlement - winner wallet resolved server-side
    settle();
    
  }, [winner, roomPda, isRanked, settle]);
  
  /**
   * Reset state (useful for rematch)
   */
  const reset = useCallback(() => {
    hasAttemptedRef.current = false;
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
