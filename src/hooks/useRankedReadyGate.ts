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
  /** Stake in lamports (from session) */
  stakeLamports: number;
  /** Turn time in seconds for ranked games */
  turnTimeSeconds: number;
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
  const showAcceptModal = enabled && isRanked && hasLoaded && !iAmReady && (p1Wallet !== null || p2Wallet !== null);

  // Simple accept - just marks player ready (on-chain stake is the real acceptance)
  const acceptRules = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!roomPda || !myWallet) {
      return { success: false, error: "Missing room or wallet" };
    }

    setIsSettingReady(true);
    
    try {
      console.log("[RankedReadyGate] Marking player ready...", { roomPda, myWallet });
      
      const { error } = await supabase.rpc("set_player_ready", {
        p_room_pda: roomPda,
        p_wallet: myWallet,
      });

      if (error) {
        console.error("[RankedReadyGate] Failed to set ready:", error);
        return { success: false, error: error.message };
      }

      console.log("[RankedReadyGate] Player marked as ready!");
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
      const { data, error } = await supabase
        .from("game_sessions")
        .select("p1_ready, p2_ready, player1_wallet, player2_wallet, turn_time_seconds, mode")
        .eq("room_pda", roomPda)
        .maybeSingle();

      if (!error && data) {
        setP1Ready(data.p1_ready ?? false);
        setP2Ready(data.p2_ready ?? false);
        setP1Wallet(data.player1_wallet);
        setP2Wallet(data.player2_wallet);
        if (data.turn_time_seconds) {
          setTurnTimeSeconds(data.turn_time_seconds);
        }
        
        // Sync mode from DB to localStorage for joining players
        // This ensures Player 2 sees the correct mode even without localStorage data
        if (data.mode) {
          try {
            const existing = localStorage.getItem(`room_mode_${roomPda}`);
            const existingData = existing ? JSON.parse(existing) : {};
            
            // Only update if mode differs or no local data
            if (!existing || existingData.mode !== data.mode) {
              console.log("[RankedReadyGate] Syncing mode from DB to localStorage:", data.mode);
              localStorage.setItem(`room_mode_${roomPda}`, JSON.stringify({
                mode: data.mode,
                turnTimeSeconds: data.turn_time_seconds || 60,
                stakeLamports: existingData.stakeLamports || 0,
              }));
            }
          } catch (e) {
            console.warn("[RankedReadyGate] Failed to sync mode to localStorage:", e);
          }
        }
        
        setHasLoaded(true);
      } else {
        // Still mark as loaded even if no data found
        setHasLoaded(true);
      }
    };

    // Also try to get stake and turn time from localStorage (set by CreateRoom)
    try {
      const modeData = localStorage.getItem(`room_mode_${roomPda}`);
      if (modeData) {
        const parsed = JSON.parse(modeData);
        if (parsed.stakeLamports) {
          setStakeLamports(parsed.stakeLamports);
        }
        if (parsed.turnTimeSeconds) {
          setTurnTimeSeconds(parsed.turnTimeSeconds);
        }
      }
    } catch (e) {
      console.warn("[useRankedReadyGate] Failed to parse room mode data:", e);
    }

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
  };
}
