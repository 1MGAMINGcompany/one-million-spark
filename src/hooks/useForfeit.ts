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
  /** CRITICAL: For ranked games, forfeit only allowed when both rules accepted */
  bothRulesAccepted?: boolean;
  /** Whether game has officially started (dice roll complete) */
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
  bothRulesAccepted = true, // Default true for casual games
  gameStarted = true, // Default true for backward compatibility
  onCleanupWebRTC,
  onCleanupSupabase,
  onCleanupLocalState,
}: UseForfeitOptions): UseForfeitReturn {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { connection } = useConnection();
  
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
    
    executingRef.current = true;
    exitedRef.current = false; // Reset for new forfeit attempt
    setIsForfeiting(true);
    
    // START 1-SECOND GUARANTEED EXIT TIMER
    forceExitTimeoutRef.current = setTimeout(() => {
      console.log("[useForfeit] Force exit after 1000ms timeout");
      forceExit();
      toast({
        title: t("forfeit.exitedMatch", "Exited match"),
        description: t("forfeit.settlementPending", "Settlement may be pending"),
        variant: "destructive",
      });
    }, 1000);
    
    let success = false;
    let signature: string | undefined;
    
    try {
      if (!roomPda || !myWallet || !opponentWallet) {
        console.error("[useForfeit] Missing required params:", { roomPda, myWallet, opponentWallet });
        return; // forceExit will happen via timeout or finally
      }
      
      // CRITICAL: Block forfeit in invalid states for ranked games
      if (mode === 'ranked' && !bothRulesAccepted) {
        console.error("[useForfeit] BLOCKED: Cannot forfeit ranked game - rules not accepted by both players");
        toast({
          title: t("forfeit.invalidState", "Cannot forfeit"),
          description: t("forfeit.rulesNotAccepted", "Game has not properly started"),
          variant: "destructive",
        });
        return; // forceExit will happen via finally
      }
      
      if (!gameStarted) {
        console.warn("[useForfeit] BLOCKED: Cannot forfeit - game not started");
        toast({
          title: t("forfeit.invalidState", "Cannot forfeit"),
          description: t("forfeit.gameNotStarted", "Game has not started yet"),
          variant: "destructive",
        });
        return;
      }
      
      console.log("[useForfeit] Starting forfeit via finalizeGame:", {
        roomPda: roomPda.slice(0, 8) + "...",
        winner: opponentWallet.slice(0, 8) + "...",
        loser: myWallet.slice(0, 8) + "...",
      });
      
      // Use the authoritative finalizeGame function with forfeit mode
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
        // No sendTransaction/signerPubkey - use edge function for forfeit
      });
      
      if (result.success) {
        success = true;
        signature = result.signature;
        console.log("[useForfeit] Forfeit successful:", signature || "(already settled)");
      } else {
        console.error("[useForfeit] Forfeit failed:", result.error);
      }
    } catch (err: any) {
      console.error("[useForfeit] Forfeit error:", err);
    } finally {
      // Clear the timeout (may have already fired - that's OK)
      if (forceExitTimeoutRef.current) {
        clearTimeout(forceExitTimeoutRef.current);
        forceExitTimeoutRef.current = null;
      }
      
      // Show appropriate toast if we succeeded (before forceExit navigates away)
      if (success && !exitedRef.current) {
        toast({
          title: t("forfeit.success", "Game forfeited"),
          description: signature 
            ? `${t("forfeit.opponentWins", "Opponent wins")} Tx: ${signature.slice(0, 12)}...`
            : t("forfeit.opponentWins", "Opponent wins"),
        });
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
