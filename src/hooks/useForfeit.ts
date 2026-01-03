/**
 * useForfeit hook - centralized forfeit/leave logic
 * 
 * Provides two actions:
 * - forfeit(): Calls on-chain finalize_room with winner=opponent, then cleanup
 * - leave(): Just cleanup and navigate out (no chain call)
 * 
 * Both actions ALWAYS cleanup (WebRTC, Supabase, local state) and navigate to /room-list,
 * even if transactions fail.
 */

import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useConnection, useWallet as useWalletAdapter } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { finalizeRoom } from "@/lib/finalize-room";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export interface UseForfeitOptions {
  roomPda: string | null;
  myWallet: string | null;
  opponentWallet: string | null;
  stakeLamports?: number;
  gameType?: string;
  // Cleanup callbacks - called in finally block
  onCleanupWebRTC?: () => void;
  onCleanupSupabase?: () => void;
  onCleanupLocalState?: () => void;
}

export interface UseForfeitReturn {
  forfeit: () => Promise<void>;
  leave: () => void;
  isForfeiting: boolean;
  isLeaving: boolean;
}

export function useForfeit({
  roomPda,
  myWallet,
  opponentWallet,
  stakeLamports = 0,
  gameType = "unknown",
  onCleanupWebRTC,
  onCleanupSupabase,
  onCleanupLocalState,
}: UseForfeitOptions): UseForfeitReturn {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { connection } = useConnection();
  const { sendTransaction, publicKey } = useWalletAdapter();
  
  const [isForfeiting, setIsForfeiting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  
  // Prevent double-execution
  const executingRef = useRef(false);

  /**
   * Shared cleanup logic - ALWAYS runs, even on error
   */
  const performCleanup = useCallback(() => {
    console.log("[useForfeit] Performing cleanup...");
    
    try {
      // Close WebRTC connections
      onCleanupWebRTC?.();
    } catch (e) {
      console.warn("[useForfeit] WebRTC cleanup error:", e);
    }
    
    try {
      // Unsubscribe from Supabase channels
      onCleanupSupabase?.();
    } catch (e) {
      console.warn("[useForfeit] Supabase cleanup error:", e);
    }
    
    try {
      // Clear local room state
      onCleanupLocalState?.();
      
      // Clear any room-specific session storage
      if (roomPda) {
        sessionStorage.removeItem(`room-${roomPda}`);
        sessionStorage.removeItem(`game-state-${roomPda}`);
        sessionStorage.removeItem(`dice-roll-${roomPda}`);
      }
    } catch (e) {
      console.warn("[useForfeit] Local state cleanup error:", e);
    }
    
    console.log("[useForfeit] Cleanup complete");
  }, [roomPda, onCleanupWebRTC, onCleanupSupabase, onCleanupLocalState]);

  /**
   * forfeit() - On-chain payout to opponent via finalize_room
   * User signs the transaction (no server verifier key needed)
   */
  const forfeit = useCallback(async () => {
    if (executingRef.current) {
      console.log("[useForfeit] Already executing, skipping");
      return;
    }
    
    if (!roomPda || !myWallet || !opponentWallet) {
      console.error("[useForfeit] Missing required params:", { roomPda, myWallet, opponentWallet });
      toast({
        title: t("common.error"),
        description: "Missing room or player information",
        variant: "destructive",
      });
      // Still cleanup and navigate
      performCleanup();
      navigate("/room-list");
      return;
    }
    
    executingRef.current = true;
    setIsForfeiting(true);
    
    let success = false;
    let signature: string | undefined;
    
    try {
      console.log("[useForfeit] Starting forfeit:", {
        roomPda: roomPda.slice(0, 8) + "...",
        winner: opponentWallet.slice(0, 8) + "...",
      });
      
      // Call on-chain finalize_room with winner = opponent
      // User signs this transaction
      if (!publicKey || !sendTransaction) {
        throw new Error("Wallet not connected");
      }
      
      const result = await finalizeRoom(
        connection,
        roomPda,
        opponentWallet, // Winner is opponent
        sendTransaction,
        publicKey
      );
      
      if (result.ok) {
        success = true;
        signature = result.signature;
        console.log("[useForfeit] Forfeit successful:", signature);
      } else {
        console.error("[useForfeit] Forfeit failed:", result.error);
      }
    } catch (err: any) {
      console.error("[useForfeit] Forfeit error:", err);
      // Don't throw - we still want to cleanup and navigate
    } finally {
      // ALWAYS cleanup and navigate, even on error
      performCleanup();
      
      // Show appropriate toast
      if (success) {
        toast({
          title: t("forfeit.success"),
          description: signature 
            ? `${t("forfeit.opponentWins")} Tx: ${signature.slice(0, 12)}...`
            : t("forfeit.opponentWins"),
        });
      } else {
        toast({
          title: t("forfeit.exitedMatch"),
          description: t("forfeit.settlementPending"),
          variant: "destructive",
        });
      }
      
      // Navigate to room list
      navigate("/room-list");
      
      setIsForfeiting(false);
      executingRef.current = false;
    }
  }, [
    roomPda,
    myWallet,
    opponentWallet,
    connection,
    sendTransaction,
    publicKey,
    performCleanup,
    navigate,
    t,
  ]);

  /**
   * leave() - Just cleanup and navigate out (no chain call)
   * Used when game hasn't started or for casual exit
   */
  const leave = useCallback(() => {
    if (executingRef.current) {
      console.log("[useForfeit] Already executing, skipping");
      return;
    }
    
    executingRef.current = true;
    setIsLeaving(true);
    
    try {
      console.log("[useForfeit] Leaving room...");
      performCleanup();
      
      toast({
        title: t("forfeit.leftRoom"),
        description: t("forfeit.returnedToLobby"),
      });
    } finally {
      navigate("/room-list");
      setIsLeaving(false);
      executingRef.current = false;
    }
  }, [performCleanup, navigate, t]);

  return {
    forfeit,
    leave,
    isForfeiting,
    isLeaving,
  };
}
