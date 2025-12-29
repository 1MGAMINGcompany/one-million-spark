/**
 * Hook to manage the ranked game ready gate
 * 
 * For ranked games, both players must accept the rules before gameplay begins.
 * This hook tracks p1_ready and p2_ready flags in game_sessions.
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
  /** Set this player as ready */
  setReady: () => Promise<boolean>;
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
  const [isSettingReady, setIsSettingReady] = useState(false);
  const [stakeLamports, setStakeLamports] = useState(0);
  const [turnTimeSeconds, setTurnTimeSeconds] = useState(60);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Determine if I'm player 1 or player 2
  const isPlayer1 = myWallet && p1Wallet && myWallet.toLowerCase() === p1Wallet.toLowerCase();
  const isPlayer2 = myWallet && p2Wallet && myWallet.toLowerCase() === p2Wallet.toLowerCase();

  const iAmReady = isPlayer1 ? p1Ready : isPlayer2 ? p2Ready : false;
  const opponentReady = isPlayer1 ? p2Ready : isPlayer2 ? p1Ready : false;
  const bothReady = p1Ready && p2Ready;

  // For casual games, always consider both ready
  const showAcceptModal = enabled && isRanked && hasLoaded && !iAmReady && (p1Wallet !== null || p2Wallet !== null);

  // Load initial state and subscribe to changes
  useEffect(() => {
    if (!roomPda || !enabled) return;

    const loadState = async () => {
      const { data, error } = await supabase
        .from("game_sessions")
        .select("p1_ready, p2_ready, player1_wallet, player2_wallet, turn_time_seconds")
        .eq("room_pda", roomPda)
        .single();

      if (!error && data) {
        setP1Ready(data.p1_ready ?? false);
        setP2Ready(data.p2_ready ?? false);
        setP1Wallet(data.player1_wallet);
        setP2Wallet(data.player2_wallet);
        // Use DB turn time if available, otherwise keep localStorage value
        if ((data as any).turn_time_seconds) {
          setTurnTimeSeconds((data as any).turn_time_seconds);
        }
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

  // Set this player as ready
  const setReady = useCallback(async (): Promise<boolean> => {
    if (!roomPda || !myWallet) return false;

    setIsSettingReady(true);
    try {
      const { error } = await supabase.rpc("set_player_ready", {
        p_room_pda: roomPda,
        p_wallet: myWallet,
      });

      if (error) {
        console.error("[useRankedReadyGate] Failed to set ready:", error);
        return false;
      }

      // Optimistic update
      if (isPlayer1) setP1Ready(true);
      if (isPlayer2) setP2Ready(true);

      return true;
    } catch (err) {
      console.error("[useRankedReadyGate] Error setting ready:", err);
      return false;
    } finally {
      setIsSettingReady(false);
    }
  }, [roomPda, myWallet, isPlayer1, isPlayer2]);

  // For casual games, return as if both are ready
  if (!isRanked) {
    return {
      iAmReady: true,
      opponentReady: true,
      bothReady: true,
      isSettingReady: false,
      showAcceptModal: false,
      setReady: async () => true,
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
    setReady,
    stakeLamports,
    turnTimeSeconds,
  };
}
