/**
 * Hook for managing game acceptance and session tokens
 */

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { supabase } from "@/integrations/supabase/client";
import {
  RulesParams,
  AcceptancePayload,
  SessionInfo,
  signAcceptance,
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
  mode?: "casual" | "ranked";
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
    // Check for existing valid session on mount
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

      console.log("[useGameAcceptance] Signing acceptance for room:", roomPda.slice(0, 8));

      // Sign the acceptance message
      const acceptance = await signAcceptance(
        signMessage,
        roomPda,
        playerWallet,
        rules
      );

      console.log("[useGameAcceptance] Acceptance signed, verifying with server...");

      // Send to edge function for verification
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
