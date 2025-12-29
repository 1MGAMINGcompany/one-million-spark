/**
 * Hook for submitting moves with session validation, 
 * monotonic turn numbers, and hash chain integrity
 */

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type MoveErrorType = "session_expired" | "out_of_sync" | "hash_conflict" | null;

interface UseSubmitMoveOptions {
  roomPda: string;
  sessionToken: string | null;
  onSessionExpired?: () => void;
  onResyncNeeded?: () => Promise<{ turnNumber: number; lastHash: string } | null>;
}

interface UseSubmitMoveResult {
  submitMove: (moveData: Record<string, unknown>) => Promise<boolean>;
  isSubmitting: boolean;
  currentTurn: number;
  lastHash: string;
  errorType: MoveErrorType;
  clearError: () => void;
  resetState: (turnNumber?: number, hash?: string) => void;
}

/**
 * Stable JSON stringify for consistent hashing
 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return "{" + keys.map(k => `"${k}":${stableStringify((obj as Record<string, unknown>)[k])}`).join(",") + "}";
}

/**
 * Compute SHA-256 hash of move data
 */
async function computeMoveHash(moveData: Record<string, unknown>): Promise<string> {
  const str = stableStringify(moveData);
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export function useSubmitMove(options: UseSubmitMoveOptions): UseSubmitMoveResult {
  const { roomPda, sessionToken, onSessionExpired, onResyncNeeded } = options;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorType, setErrorType] = useState<MoveErrorType>(null);
  
  // Track turn state with refs for stability in callbacks
  const turnRef = useRef(0);
  const hashRef = useRef("genesis");
  const [currentTurn, setCurrentTurn] = useState(0);
  const [lastHash, setLastHash] = useState("genesis");

  const clearError = useCallback(() => {
    setErrorType(null);
  }, []);

  const resetState = useCallback((turnNumber = 0, hash = "genesis") => {
    turnRef.current = turnNumber;
    hashRef.current = hash;
    setCurrentTurn(turnNumber);
    setLastHash(hash);
    setErrorType(null);
  }, []);

  const submitMove = useCallback(async (moveData: Record<string, unknown>): Promise<boolean> => {
    if (!sessionToken) {
      setErrorType("session_expired");
      toast.error("Session expired. Tap 'Re-Ready' to continue.", {
        duration: 5000,
      });
      onSessionExpired?.();
      return false;
    }

    setIsSubmitting(true);
    setErrorType(null);

    try {
      const nextTurn = turnRef.current + 1;
      const prevHash = hashRef.current;
      const moveHash = await computeMoveHash(moveData);

      console.log(`[submitMove] Turn ${nextTurn}, prevHash: ${prevHash.slice(0, 8)}..., moveHash: ${moveHash.slice(0, 8)}...`);

      const { error } = await supabase.rpc("submit_move", {
        p_session_token: sessionToken,
        p_room_pda: roomPda,
        p_turn_number: nextTurn,
        p_move_hash: moveHash,
        p_prev_hash: prevHash,
        p_move_data: moveData as unknown as Record<string, never>,
      });

      if (error) {
        console.error("[submitMove] Error:", error.message);
        
        // Handle specific error types with friendly messages
        if (error.message.includes("invalid session") || error.message.includes("session revoked")) {
          setErrorType("session_expired");
          toast.error("Session expired. Tap 'Re-Ready' to continue.", {
            duration: 5000,
          });
          onSessionExpired?.();
          return false;
        }

        if (error.message.includes("bad turn number")) {
          setErrorType("out_of_sync");
          toast.info("Out of sync. Resyncing…", { duration: 3000 });
          
          // Attempt to resync
          if (onResyncNeeded) {
            const syncData = await onResyncNeeded();
            if (syncData) {
              resetState(syncData.turnNumber, syncData.lastHash);
            }
          }
          return false;
        }

        if (error.message.includes("bad prev hash")) {
          setErrorType("hash_conflict");
          toast.info("Move conflict detected. Resyncing…", { duration: 3000 });
          
          // Attempt to resync
          if (onResyncNeeded) {
            const syncData = await onResyncNeeded();
            if (syncData) {
              resetState(syncData.turnNumber, syncData.lastHash);
            }
          }
          return false;
        }

        // Generic error
        toast.error("Failed to submit move. Please try again.");
        return false;
      }

      // Success - update local state
      turnRef.current = nextTurn;
      hashRef.current = moveHash;
      setCurrentTurn(nextTurn);
      setLastHash(moveHash);

      console.log(`[submitMove] Success! Turn now at ${nextTurn}`);
      return true;
    } catch (err) {
      console.error("[submitMove] Exception:", err);
      toast.error("Connection error. Please try again.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [sessionToken, roomPda, onSessionExpired, onResyncNeeded, resetState]);

  return {
    submitMove,
    isSubmitting,
    currentTurn,
    lastHash,
    errorType,
    clearError,
    resetState,
  };
}
