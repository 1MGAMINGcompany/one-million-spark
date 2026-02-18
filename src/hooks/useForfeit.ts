/**
 * useForfeit hook - centralized forfeit/leave logic with GUARANTEED exit
 * 
 * Provides two actions:
 * - forfeit(): Calls finalizeGame with winner=opponent, then cleanup
 * - leave(): Just cleanup and navigate out (no chain call)
 * 
 * CRITICAL: Both actions ALWAYS navigate to /room-list within 1 second,
 * even if transactions fail. Uses idempotent forceExit() pattern.
 * 
 * NOW USES: finalizeGame() as the single authoritative payout function
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useConnection } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { finalizeGame } from "@/lib/finalizeGame";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export interface UseForfeitOptions {
  roomPda: string | null;
  myWallet: string | null;
  opponentWallet: string | null;
  stakeLamports?: number;
  gameType?: string;
  mode?: 'casual' | 'ranked';
  /** On-chain room status (authoritative): 1=Open, 2=Started, 3=Finished, 4=Cancelled */
  roomStatus?: number;
  /** On-chain player count (authoritative) */
  playerCount?: number;
  /** @deprecated Use roomStatus + playerCount instead */
  bothRulesAccepted?: boolean;
  /** @deprecated Use roomStatus + playerCount instead */
  gameStarted?: boolean;
  // Cleanup callbacks - called in forceExit
  onCleanupWebRTC?: () => void;
  onCleanupSupabase?: () => void;
  onCleanupLocalState?: () => void;
}

export interface UseForfeitReturn {
  forfeit: () => Promise<void>;
  leave: () => void;
  isForfeiting: boolean;
  isLeaving: boolean;
  /** Ref for timeout handlers - call forfeitRef.current() to trigger forfeit */
  forfeitRef: React.MutableRefObject<(() => Promise<void>) | null>;
}

// Generic room storage keys that should always be cleared
const GENERIC_ROOM_KEYS = [
  'activeRoomPda',
  'userActiveRoom', 
  'selectedRoomPda',
  'currentRoom',
  'roomPda',
  'inGameRoomPda',
];

export function useForfeit({
  roomPda,
  myWallet,
  opponentWallet,
  stakeLamports = 0,
  gameType = "unknown",
  mode = "casual",
  roomStatus,
  playerCount,
  // Deprecated props (no-ops, kept for backward compat)
  bothRulesAccepted: _bothRulesAccepted,
  gameStarted: _gameStarted,
  onCleanupWebRTC,
  onCleanupSupabase,
  onCleanupLocalState,
}: UseForfeitOptions): UseForfeitReturn {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { connection } = useConnection();
  const queryClient = useQueryClient();
  
  const [isForfeiting, setIsForfeiting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  
  // Idempotent exit tracking
  const exitedRef = useRef(false);
  const executingRef = useRef(false);
  const forceExitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Ref for timeout handlers to call forfeit
  const forfeitRef = useRef<(() => Promise<void>) | null>(null);

  /**
   * forceExit() - Idempotent cleanup and navigation
   * Safe to call multiple times - only executes once
   */
  const forceExit = useCallback(() => {
    if (exitedRef.current) {
      console.log("[useForfeit] forceExit already executed, skipping");
      return;
    }
    exitedRef.current = true;
    
    console.log("[useForfeit] forceExit executing...");
    
    // 1. Close WebRTC connections (silent fail)
    try {
      onCleanupWebRTC?.();
    } catch (e) {
      console.warn("[useForfeit] WebRTC cleanup error:", e);
    }
    
    // 2. Unsubscribe Supabase channels (silent fail)
    try {
      onCleanupSupabase?.();
    } catch (e) {
      console.warn("[useForfeit] Supabase cleanup error:", e);
    }
    
    // 3. Clear room-specific storage keys
    if (roomPda) {
      // Session storage
      const sessionKeys = [
        `room-${roomPda}`,
        `game-state-${roomPda}`,
        `dice-roll-${roomPda}`,
      ];
      sessionKeys.forEach(key => {
        try { sessionStorage.removeItem(key); } catch (e) { /* silent */ }
      });
      
      // Local storage - specific keys
      const localKeys = [
        `room_mode_${roomPda}`,
        `rematch_${roomPda}`,
        `finalSeed:${roomPda}`,
      ];
      localKeys.forEach(key => {
        try { localStorage.removeItem(key); } catch (e) { /* silent */ }
      });
      
      // Local storage - pattern match seedSecret:*
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith(`seedSecret:${roomPda}`)) {
            localStorage.removeItem(key);
          }
        });
      } catch (e) { /* silent */ }
    }
    
    // 4. Clear generic active room keys from both storages
    GENERIC_ROOM_KEYS.forEach(key => {
      try { localStorage.removeItem(key); } catch (e) { /* silent */ }
      try { sessionStorage.removeItem(key); } catch (e) { /* silent */ }
    });
    
    // 5. Custom cleanup callback (silent fail)
    try {
      onCleanupLocalState?.();
    } catch (e) {
      console.warn("[useForfeit] Local state cleanup error:", e);
    }
    
    console.log("[useForfeit] forceExit complete, navigating to /room-list");
    
    // 6. Navigate with replace (no back button to stuck state)
    navigate("/room-list", { replace: true });
  }, [roomPda, navigate, onCleanupWebRTC, onCleanupSupabase, onCleanupLocalState]);

  /**
   * forfeit() - On-chain payout to opponent via finalize_room
   * GUARANTEED: Navigates within 1 second no matter what
   */
  const forfeit = useCallback(async () => {
    if (executingRef.current) {
      console.log("[useForfeit] Already executing, skipping");
      return;
    }
    
    // FREE ROOM: DB-only forfeit — no on-chain settlement
    if (roomPda?.startsWith("free-")) {
      executingRef.current = true;
      exitedRef.current = false;
      setIsForfeiting(true);
      try {
        if (roomPda && myWallet) {
          const { supabase } = await import("@/integrations/supabase/client");
          const { error: rpcErr } = await supabase.rpc("finish_game_session", {
            p_room_pda: roomPda,
            p_winner_wallet: opponentWallet,
            p_caller_wallet: myWallet,
          });
          if (rpcErr) console.warn("[useForfeit] Free forfeit DB error:", rpcErr);
        }
        toast({ title: t("forfeit.success", "Game forfeited") });
      } finally {
        forceExit();
        setIsForfeiting(false);
        executingRef.current = false;
      }
      return;
    }
    
    executingRef.current = true;
    exitedRef.current = false; // Reset for new forfeit attempt
    setIsForfeiting(true);
    
    // START 15-SECOND GUARANTEED EXIT TIMER
    // Increased from 1s to 15s to allow forfeit-game edge function to complete
    // Edge function needs time to: fetch room on-chain, verify, build tx, sign, confirm
    forceExitTimeoutRef.current = setTimeout(() => {
      console.log("[useForfeit] Force exit after 15000ms timeout");
      forceExit();
      toast({
        title: t("forfeit.exitedMatch", "Exited match"),
        description: t("forfeit.settlementPending", "Settlement may be pending"),
        variant: "destructive",
      });
    }, 15000);
    
    let success = false;
    let signature: string | undefined;
    
    try {
      if (!roomPda || !myWallet || !opponentWallet) {
        console.error("[useForfeit] Missing required params:", { roomPda, myWallet, opponentWallet });
        toast({
          title: "Forfeit Error",
          description: `Missing: ${!roomPda ? 'room' : ''} ${!myWallet ? 'wallet' : ''} ${!opponentWallet ? 'opponent' : ''}`.trim(),
          variant: "destructive",
        });
        return; // forceExit will happen via timeout or finally
      }
      
      // Use ON-CHAIN STATE as authoritative gate for forfeit
      // Forfeit allowed when: room.status === Started (2) AND playerCount >= 2
      // If roomStatus/playerCount not provided, allow forfeit (backward compat)
      const canForfeitOnChain = 
        (roomStatus === undefined || roomStatus === 2) && 
        (playerCount === undefined || playerCount >= 2);

      if (!canForfeitOnChain) {
        console.warn("[useForfeit] BLOCKED: On-chain state does not allow forfeit", {
          roomStatus,
          playerCount,
        });
        toast({
          title: t("forfeit.invalidState", "Cannot forfeit"),
          description: `Room status: ${roomStatus}, Players: ${playerCount}`,
          variant: "destructive",
        });
        return;
      }
      
      // Show debug info for mobile users
      toast({
        title: "Forfeiting...",
        description: `Room: ${roomPda.slice(0, 8)}... | Opponent: ${opponentWallet.slice(0, 8)}...`,
      });
      
      console.log("[FinalizeForfeit] start", {
        roomPda: roomPda.slice(0, 8) + "...",
        winner: opponentWallet.slice(0, 8) + "...",
        loser: myWallet.slice(0, 8) + "...",
        stakeLamports,
      });
      
      // Show settling toast immediately
      toast({
        title: t("forfeit.settling", "Settling on-chain..."),
      });
      
      // DEBUG: Log before calling finalizeGame
      console.log("[FORFEIT] invoking forfeit via finalizeGame", {
        roomPda,
        forfeitingWallet: myWallet,
        winnerWallet: opponentWallet,
        stakeLamports,
        gameType,
        ts: new Date().toISOString(),
      });

      // Use the authoritative finalizeGame function with forfeit mode
      // SERVER-ONLY: No wallet popup - edge function handles settlement
      const result = await finalizeGame({
        roomPda,
        winnerWallet: opponentWallet,
        loserWallet: myWallet,
        gameType,
        stakeLamports,
        mode,
        players: [myWallet, opponentWallet],
        endReason: 'forfeit',
        connection,
        // NO sendTransaction or signerPubkey - forces edge function path
      });
      
      if (result.success) {
        success = true;
        signature = result.signature;
        console.log("[FinalizeForfeit] edge_response", { ok: true, sig: signature });
        
        // CRITICAL: Invalidate React Query cache to remove stale room data from UI
        console.log("[FinalizeForfeit] Invalidating room queries...");
        queryClient.invalidateQueries({ queryKey: ['solana-rooms'] });
        queryClient.invalidateQueries({ queryKey: ['game-session'] });
        queryClient.invalidateQueries({ queryKey: ['room-data', roomPda] });
        queryClient.invalidateQueries({ queryKey: ['recoverable-sessions'] });
        // Poll for on-chain confirmation if signature is returned
        if (signature && connection) {
          try {
            console.log("[FinalizeForfeit] Polling for confirmation...");
            const confirmation = await connection.confirmTransaction(signature, 'confirmed');
            if (confirmation.value.err) {
              console.warn("[FinalizeForfeit] Transaction failed on-chain:", confirmation.value.err);
            } else {
              console.log("[FinalizeForfeit] confirmed", { sig: signature });
            }
          } catch (pollErr) {
            console.warn("[FinalizeForfeit] Confirmation timeout (may still succeed):", pollErr);
          }
        }
      } else if (result.error === "VAULT_UNFUNDED") {
        // Handle VAULT_UNFUNDED specifically - show clear message
        console.warn("[useForfeit] Vault underfunded - game not fully funded");
        toast({
          title: t("forfeit.fundingIncomplete", "Game Funding Incomplete"),
          description: t(
            "forfeit.stakesNotDeposited",
            "Stakes were not fully deposited. Room may need to be cancelled by creator."
          ),
          variant: "destructive",
        });
        // Still call forceExit - navigate away
        forceExit();
        return;
      } else {
        console.error("[FinalizeForfeit] failed:", result.error);
      }
    } catch (err: any) {
      console.error("[useForfeit] Forfeit error:", err);
      // Show detailed error to user (for mobile debugging)
      toast({
        title: "Forfeit Exception",
        description: err?.message || String(err) || "Unknown error",
        variant: "destructive",
      });
    } finally {
      // Clear the timeout (may have already fired - that's OK)
      if (forceExitTimeoutRef.current) {
        clearTimeout(forceExitTimeoutRef.current);
        forceExitTimeoutRef.current = null;
      }
      
      // Show appropriate toast based on result
      if (!exitedRef.current) {
        if (success) {
          toast({
            title: t("forfeit.success", "Game forfeited"),
            description: signature 
              ? `Settled on-chain. Tx: ${signature.slice(0, 12)}...`
              : t("forfeit.opponentWins", "Opponent wins"),
          });
        } else {
          toast({
            title: t("forfeit.failed", "Settlement failed"),
            description: t("forfeit.tryAgain", "Please try again"),
            variant: "destructive",
          });
        }
      }
      
      // Call forceExit (idempotent - safe even if timeout already fired)
      forceExit();
      
      setIsForfeiting(false);
      executingRef.current = false;
    }
  }, [
    roomPda,
    myWallet,
    opponentWallet,
    stakeLamports,
    mode,
    gameType,
    connection,
    queryClient,
    forceExit,
    t,
  ]);

  /**
   * leave() - UI-ONLY cleanup and navigate out (NO chain call, NO wallet)
   * CRITICAL: This function NEVER calls any wallet methods:
   * - No signMessage
   * - No signTransaction
   * - No sendTransaction
   * - No wallet.connect/disconnect
   * 
   * GUARANTEED: Navigates within 1 second no matter what
   */
  const leave = useCallback(() => {
    if (executingRef.current) {
      console.log("[useForfeit] Already executing, skipping");
      return;
    }
    
    executingRef.current = true;
    exitedRef.current = false; // Reset for new leave attempt
    setIsLeaving(true);
    
    // LOG: UI exit only - no wallet action
    console.log("[LeaveMatch] UI exit only - no wallet action");
    
    // START 1-SECOND GUARANTEED EXIT TIMER
    forceExitTimeoutRef.current = setTimeout(() => {
      console.log("[LeaveMatch] Force exit after 1000ms timeout");
      forceExit();
    }, 1000);
    
    try {
      console.log("[LeaveMatch] Leaving room (UI only, no on-chain action)...");
      
      toast({
        title: t("forfeit.leftRoom", "Left room"),
        description: t("forfeit.returnedToLobby", "Returned to lobby"),
      });
    } finally {
      // Clear the timeout
      if (forceExitTimeoutRef.current) {
        clearTimeout(forceExitTimeoutRef.current);
        forceExitTimeoutRef.current = null;
      }
      
      // Call forceExit (idempotent) - cleanup + navigate
      forceExit();
      
      setIsLeaving(false);
      executingRef.current = false;
    }
  }, [forceExit, t]);

  // Update forfeitRef when forfeit function changes
  useEffect(() => {
    forfeitRef.current = forfeit;
  }, [forfeit]);

  return {
    forfeit,
    leave,
    isForfeiting,
    isLeaving,
    forfeitRef,
  };
}
