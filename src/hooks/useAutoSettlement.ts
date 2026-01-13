/**
 * useAutoSettlement - Automatically trigger on-chain settlement when a game ends
 * 
 * This hook watches for game-over conditions and calls the appropriate edge function:
 * - settle-game for wins (submit_result + close_room)
 * - settle-draw for draws (refund_draw + close_room)
 * 
 * Features:
 * - Idempotent: guards against double-calling with ref + server-side checks
 * - Handles both wins and draws automatically
 * - Provides settling state and result for UI feedback
 * - Graceful error handling with specific draw refund messages
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
  /** Specific error code for draw refund unavailability */
  code?: "INSTRUCTION_NOT_FOUND" | string;
  /** User-friendly message for UI display */
  message?: string;
}

export interface UseAutoSettlementParams {
  roomPda: string | undefined;
  /** Winner identifier - wallet address, 'draw', or null */
  winner: string | null;
  /** Reason for game end */
  reason?: "gameover" | "resign" | "timeout" | "draw";
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
  const [isSettlingDraw, setIsSettlingDraw] = useState(false);
  const [result, setResult] = useState<SettlementResult | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  
  // Idempotency guard - prevent double-calling
  const isSettlingRef = useRef(false);
  const hasAttemptedRef = useRef(false);
  const hasAttemptedDrawRef = useRef(false);
  
  /**
   * Trigger win settlement manually
   */
  const settle = useCallback(async (): Promise<SettlementResult> => {
    if (!roomPda) {
      return { success: false, error: "Missing roomPda" };
    }
    
    // Guard: already settling
    if (isSettlingRef.current) {
      console.log("[AutoSettlement] Already in progress, skipping");
      return { success: false, error: "Settlement already in progress" };
    }
    
    isSettlingRef.current = true;
    setIsSettling(true);
    
    console.log("[AutoSettlement] Calling settle-game", { 
      roomPda: roomPda.slice(0, 8) + "...", 
      reason,
    });
    
    try {
      const { data, error } = await supabase.functions.invoke("settle-game", {
        body: {
          roomPda,
          reason,
        },
      });
      
      console.log("[AutoSettlement] settle-game response:", data);
      
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
      if (data?.success || data?.ok) {
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
      console.error("[AutoSettlement] Exception:", err);
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
   * Trigger draw settlement
   */
  const settleDraw = useCallback(async (): Promise<SettlementResult> => {
    if (!roomPda) {
      return { success: false, error: "Missing roomPda" };
    }
    
    // Guard: already settling
    if (isSettlingRef.current) {
      console.log("[AutoSettlement] Draw settlement already in progress, skipping");
      return { success: false, error: "Settlement already in progress" };
    }
    
    isSettlingRef.current = true;
    setIsSettlingDraw(true);
    setDrawError(null);
    
    console.log("[AutoSettlement] draw detected -> settle-draw", { 
      roomPda: roomPda.slice(0, 8) + "...",
    });
    
    try {
      const { data, error } = await supabase.functions.invoke("settle-draw", {
        body: {
          roomPda,
          reason: "draw",
        },
      });
      
      console.log("[AutoSettlement] settle-draw response:", data);
      
      if (error) {
        const errResult: SettlementResult = { 
          success: false, 
          error: error.message || "Draw settlement failed" 
        };
        setResult(errResult);
        setDrawError(error.message || "Draw settlement failed");
        return errResult;
      }
      
      // Handle already settled
      if (data?.alreadySettled) {
        const successResult: SettlementResult = {
          success: true,
          alreadySettled: true,
          signature: data.signature,
        };
        setResult(successResult);
        return successResult;
      }
      
      // Handle instruction not found (refund_draw not deployed)
      if (data?.code === "INSTRUCTION_NOT_FOUND" || !data?.ok) {
        const message = data?.message || "Draw refund not enabled yet. Please try again later.";
        const errResult: SettlementResult = {
          success: false,
          error: data?.error || "Draw refund unavailable",
          code: "INSTRUCTION_NOT_FOUND",
          message,
        };
        setResult(errResult);
        setDrawError(message);
        return errResult;
      }
      
      // Success
      if (data?.ok) {
        const successResult: SettlementResult = {
          success: true,
          signature: data.signature,
          closeRoomSignature: data.closeRoomSignature,
        };
        setResult(successResult);
        return successResult;
      }
      
      // Unknown failure
      const failResult: SettlementResult = {
        success: false,
        error: data?.error || "Draw settlement failed",
      };
      setResult(failResult);
      setDrawError(data?.error || "Draw settlement failed");
      return failResult;
      
    } catch (err: any) {
      console.error("[AutoSettlement] Draw settlement exception:", err);
      const errResult: SettlementResult = {
        success: false,
        error: err.message || "Draw settlement exception",
      };
      setResult(errResult);
      setDrawError(err.message || "Draw settlement exception");
      return errResult;
    } finally {
      isSettlingRef.current = false;
      setIsSettlingDraw(false);
      hasAttemptedDrawRef.current = true;
    }
  }, [roomPda]);
  
  /**
   * Auto-trigger settlement when winner is detected
   */
  useEffect(() => {
    // Only settle for ranked games
    if (!isRanked) return;
    
    // Need a winner and room
    if (!winner || !roomPda) return;
    
    // Skip if already settling
    if (isSettlingRef.current) return;
    
    // Handle draw case
    if (winner === "draw") {
      // Skip if we've already attempted draw settlement
      if (hasAttemptedDrawRef.current) return;
      
      console.log("[AutoSettlement] Draw detected, triggering settle-draw for room:", roomPda.slice(0, 8));
      settleDraw();
      return;
    }
    
    // Handle win case
    // Skip if we've already attempted win settlement
    if (hasAttemptedRef.current) return;
    
    console.log("[AutoSettlement] Win detected, triggering settle-game for room:", roomPda.slice(0, 8));
    settle();
    
  }, [winner, roomPda, isRanked, settle, settleDraw]);
  
  /**
   * Reset state (useful for rematch)
   */
  const reset = useCallback(() => {
    hasAttemptedRef.current = false;
    hasAttemptedDrawRef.current = false;
    setResult(null);
    setDrawError(null);
  }, []);
  
  return {
    /** Whether win settlement is currently in progress */
    isSettling,
    /** Whether draw settlement is currently in progress */
    isSettlingDraw,
    /** Result of the last settlement attempt */
    result,
    /** Error message specifically for draw refund issues */
    drawError,
    /** Manually trigger win settlement */
    settle,
    /** Manually trigger draw settlement */
    settleDraw,
    /** Reset state for new game */
    reset,
  };
}
