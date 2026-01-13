/**
 * Hook to manage the ranked game ready gate
 * 
 * For ranked games, both players must acknowledge the rules before gameplay begins.
 * The on-chain stake transaction serves as implicit acceptance of the game rules.
 * This hook simply tracks p1_ready and p2_ready flags in game_sessions.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseRankedReadyGateOptions {
  roomPda: string | undefined;
  myWallet: string | undefined;
  isRanked: boolean;
  enabled?: boolean;
}

interface UseRankedReadyGateResult {
  /** Whether this player is ready */
  iAmReady: boolean;
  /** Whether opponent is ready */
  opponentReady: boolean;
  /** Whether both players are ready (gameplay can begin) */
  bothReady: boolean;
  /** Whether we're currently setting ready */
  isSettingReady: boolean;
  /** Whether we need to show the accept modal */
  showAcceptModal: boolean;
  /** Accept rules (marks player ready - no wallet signature needed) */
  acceptRules: () => Promise<{ success: boolean; error?: string }>;
  /** Stake in lamports (from session) - DEPRECATED: Use external on-chain stake */
  stakeLamports: number;
  /** Turn time in seconds for ranked games */
  turnTimeSeconds: number;
  /** Whether gate data has loaded (use to block modal rendering with defaults) */
  isDataLoaded: boolean;
}

export function useRankedReadyGate(options: UseRankedReadyGateOptions): UseRankedReadyGateResult {
  const { roomPda, myWallet, isRanked, enabled = true } = options;
  
  const [p1Ready, setP1Ready] = useState(false);
  const [p2Ready, setP2Ready] = useState(false);
  const [p1Wallet, setP1Wallet] = useState<string | null>(null);
  const [p2Wallet, setP2Wallet] = useState<string | null>(null);
  const [stakeLamports, setStakeLamports] = useState(0);
  const [turnTimeSeconds, setTurnTimeSeconds] = useState(60);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSettingReady, setIsSettingReady] = useState(false);

  // Determine if I'm player 1 or player 2
  const isPlayer1 = myWallet && p1Wallet && myWallet.toLowerCase() === p1Wallet.toLowerCase();
  const isPlayer2 = myWallet && p2Wallet && myWallet.toLowerCase() === p2Wallet.toLowerCase();

  const iAmReady = isPlayer1 ? p1Ready : isPlayer2 ? p2Ready : false;
  const opponentReady = isPlayer1 ? p2Ready : isPlayer2 ? p1Ready : false;
  const bothReady = p1Ready && p2Ready;

  // Show accept modal if ranked, loaded, and this player hasn't accepted yet
  // Also require that we've identified this player's role (isPlayer1 or isPlayer2)
  const isIdentified = isPlayer1 || isPlayer2;
  const showAcceptModal = enabled && isRanked && hasLoaded && !iAmReady && isIdentified;
  
  // Debug logging for ranked gate state - consistent format for cross-device debugging
  useEffect(() => {
    if (isRanked && hasLoaded) {
      console.log("[RankedReadyGate] State:", {
        roomPda: roomPda?.slice(0, 8),
        myWallet: myWallet?.slice(0, 8),
        isRanked,
        enabled,
        hasLoaded,
        isPlayer1,
        isPlayer2,
        isIdentified,
        p1Ready,
        p2Ready,
        iAmReady,
        opponentReady,
        bothReady,
        showAcceptModal,
      });
    }
  }, [roomPda, myWallet, isRanked, enabled, hasLoaded, isPlayer1, isPlayer2, isIdentified, p1Ready, p2Ready, iAmReady, opponentReady, bothReady, showAcceptModal]);

  // Accept rules via Edge Function (no direct table access)
  const acceptRules = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!roomPda || !myWallet) {
      return { success: false, error: "Missing room or wallet" };
    }

    setIsSettingReady(true);
    
    try {
      console.log("[RankedReadyGate] Calling ranked-accept Edge Function...", { roomPda, myWallet });
      
      // Call Edge Function instead of direct table insert
      const { data, error } = await supabase.functions.invoke("ranked-accept", {
        body: {
          roomPda,
          playerWallet: myWallet,
          mode: "simple", // Simple acceptance (stake tx is implicit signature)
        },
      });

      if (error) {
        console.error("[RankedReadyGate] Edge function error:", error);
        return { success: false, error: error.message || "Failed to accept" };
      }

      if (!data?.success) {
        console.error("[RankedReadyGate] Acceptance failed:", data?.error);
        return { success: false, error: data?.error || "Acceptance failed" };
      }

      console.log("[RankedReadyGate] ✅ Player marked as ready via Edge Function!");
      return { success: true };
    } catch (err: any) {
      console.error("[RankedReadyGate] Error:", err);
      return { success: false, error: err.message || "Unexpected error" };
    } finally {
      setIsSettingReady(false);
    }
  }, [roomPda, myWallet]);

  // Load initial state and subscribe to changes
  useEffect(() => {
    if (!roomPda || !enabled) return;

    const loadState = async () => {
      // Use Edge Function instead of direct table access (RLS locked)
      const { data: resp, error } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });

      const session = resp?.session;
      if (!error && session) {
        setP1Ready(session.p1_ready ?? false);
        setP2Ready(session.p2_ready ?? false);
        setP1Wallet(session.player1_wallet);
        setP2Wallet(session.player2_wallet);
        if (session.turn_time_seconds) {
          setTurnTimeSeconds(session.turn_time_seconds);
        }
        // Note: Mode now comes from DB (single source of truth)
        // No localStorage sync needed - useRoomMode fetches directly from DB
        
        setHasLoaded(true);
      } else {
        // Still mark as loaded even if no data found
        setHasLoaded(true);
      }
    };

    loadState();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`ready-gate-${roomPda}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_sessions",
          filter: `room_pda=eq.${roomPda}`,
        },
        (payload) => {
          const newData = payload.new as { p1_ready?: boolean; p2_ready?: boolean };
          if (typeof newData.p1_ready === "boolean") setP1Ready(newData.p1_ready);
          if (typeof newData.p2_ready === "boolean") setP2Ready(newData.p2_ready);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomPda, enabled]);

  // For casual games, return as if both are ready
  if (!isRanked) {
    return {
      iAmReady: true,
      opponentReady: true,
      bothReady: true,
      isSettingReady: false,
      showAcceptModal: false,
      acceptRules: async () => ({ success: true }),
      stakeLamports: 0,
      turnTimeSeconds: 0,
      isDataLoaded: true,
    };
  }

  return {
    iAmReady,
    opponentReady,
    bothReady,
    isSettingReady,
    showAcceptModal,
    acceptRules,
    stakeLamports,
    turnTimeSeconds,
    isDataLoaded: hasLoaded,
  };
}
