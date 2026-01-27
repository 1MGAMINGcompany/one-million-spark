/**
 * Hook for managing game acceptance and session tokens
 * 
 * Flow:
 * 1. Call issue_nonce RPC to get server-issued nonce
 * 2. Sign acceptance message with wallet
 * 3. Send to verify-acceptance edge function
 * 4. Edge function verifies signature and calls start_session RPC
 * 5. Store session token for fast gameplay (no more wallet prompts)
 */

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { supabase } from "@/integrations/supabase/client";
import {
  RulesParams,
  SessionInfo,
  issueNonceAndSignAccept,
  storeSession,
  getStoredSession,
  clearSession,
  isSessionValid,
  createRulesFromRoom,
} from "@/lib/gameAcceptance";
import { toast } from "sonner";

interface UseGameAcceptanceOptions {
  roomPda: string;
  gameType: number;
  maxPlayers: number;
  stakeLamports: number;
  mode?: "casual" | "ranked" | "private";
}

interface UseGameAcceptanceResult {
  session: SessionInfo | null;
  isAccepting: boolean;
  acceptAndGetSession: () => Promise<SessionInfo | null>;
  hasValidSession: boolean;
  clearCurrentSession: () => void;
}

export function useGameAcceptance(
  options: UseGameAcceptanceOptions
): UseGameAcceptanceResult {
  const { roomPda, gameType, maxPlayers, stakeLamports, mode = "casual" } = options;
  const { publicKey, signMessage } = useWallet();
  
  const [isAccepting, setIsAccepting] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(() => {
    return getStoredSession(roomPda);
  });

  const hasValidSession = isSessionValid(session);

  const acceptAndGetSession = useCallback(async (): Promise<SessionInfo | null> => {
    if (!publicKey || !signMessage) {
      toast.error("Wallet not connected");
      return null;
    }

    // Check for existing valid session first
    const existingSession = getStoredSession(roomPda);
    if (isSessionValid(existingSession)) {
      console.log("[useGameAcceptance] Using existing session");
      setSession(existingSession);
      return existingSession;
    }

    setIsAccepting(true);

    try {
      const playerWallet = publicKey.toBase58();
      
      // Create rules from room parameters
      const rules = createRulesFromRoom(
        roomPda,
        gameType,
        maxPlayers,
        stakeLamports,
        mode
      );

      console.log("[useGameAcceptance] Starting acceptance flow for room:", roomPda.slice(0, 8));

      // Action 1: Issue nonce and sign acceptance
      // This calls issue_nonce RPC, then signs the message
      const acceptance = await issueNonceAndSignAccept(
        signMessage,
        roomPda,
        playerWallet,
        rules
      );

      console.log("[useGameAcceptance] Acceptance signed, sending to server for verification...");

      // Action 2: Verify and start session
      // Edge function verifies signature and calls start_session RPC
      const { data, error } = await supabase.functions.invoke("verify-acceptance", {
        body: { acceptance, rules },
      });

      if (error) {
        console.error("[useGameAcceptance] Verification failed:", error);
        toast.error("Failed to verify acceptance");
        return null;
      }

      if (!data.success) {
        console.error("[useGameAcceptance] Verification rejected:", data.error);
        toast.error(data.error || "Acceptance rejected");
        return null;
      }

      // Create and store session
      const newSession: SessionInfo = {
        sessionToken: data.sessionToken,
        expiresAt: data.expiresAt,
        roomPda,
        rulesHash: acceptance.rulesHash,
      };

      storeSession(newSession);
      setSession(newSession);

      console.log("[useGameAcceptance] Session created, expires:", data.expiresAt);
      
      return newSession;
    } catch (err: unknown) {
      console.error("[useGameAcceptance] Error:", err);
      
      // Handle user rejection
      if (err instanceof Error && err.message?.includes("rejected")) {
        toast.error("Signature rejected");
      } else if (err instanceof Error && err.message?.includes("nonce")) {
        toast.error("Session expired, please try again");
      } else {
        toast.error("Failed to accept game rules");
      }
      
      return null;
    } finally {
      setIsAccepting(false);
    }
  }, [publicKey, signMessage, roomPda, gameType, maxPlayers, stakeLamports, mode]);

  const clearCurrentSession = useCallback(() => {
    clearSession(roomPda);
    setSession(null);
  }, [roomPda]);

  return {
    session,
    isAccepting,
    acceptAndGetSession,
    hasValidSession,
    clearCurrentSession,
  };
}
