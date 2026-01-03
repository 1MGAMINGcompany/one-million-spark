/**
 * Hook to manage deterministic dice roll for starting player selection
 * 
 * For ranked games: Uses cryptographic signatures from both players to compute
 * a deterministic dice roll via the compute_start_roll RPC.
 * 
 * For casual games: Uses on-chain player order (creator goes first).
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface StartRollResult {
  p1: { wallet: string; dice: number[]; total: number };
  p2: { wallet: string; dice: number[]; total: number };
  reroll_count: number;
  winner: string;
}

interface UseStartRollOptions {
  roomPda: string | undefined;
  myWallet: string | undefined;
  isRanked: boolean;
  roomPlayers: string[];
  /** Whether both players are ready (ranked games) */
  bothReady: boolean;
  /** Initial color from on-chain order */
  initialColor: "w" | "b";
}

interface UseStartRollResult {
  /** Whether the start roll has been finalized */
  isFinalized: boolean;
  /** Whether to show the dice roll UI */
  showDiceRoll: boolean;
  /** Player's color after roll */
  myColor: "w" | "b";
  /** The starting player's wallet address */
  startingWallet: string | null;
  /** Roll result data (for display) */
  rollResult: StartRollResult | null;
  /** Handle completion of the dice roll UI */
  handleRollComplete: (startingWallet: string) => void;
}

export function useStartRoll(options: UseStartRollOptions): UseStartRollResult {
  const { roomPda, myWallet, isRanked, roomPlayers, bothReady, initialColor } = options;

  const [isFinalized, setIsFinalized] = useState(false);
  const [showDiceRoll, setShowDiceRoll] = useState(false);
  const [myColor, setMyColor] = useState<"w" | "b">(initialColor);
  const [startingWallet, setStartingWallet] = useState<string | null>(null);
  const [rollResult, setRollResult] = useState<StartRollResult | null>(null);

  // Update color from initial when it changes (on-chain fetch)
  useEffect(() => {
    if (!isFinalized) {
      setMyColor(initialColor);
    }
  }, [initialColor, isFinalized]);

  // Check/set start roll based on game mode
  useEffect(() => {
    if (!roomPda || isFinalized) return;

    // Casual games: no dice roll, use on-chain order
    if (!isRanked && roomPlayers.length >= 2 && myWallet) {
      setIsFinalized(true);
      setStartingWallet(roomPlayers[0]);
      console.log("[useStartRoll] Casual game - using on-chain player order");
      return;
    }

    // Ranked games: wait for both players to be ready
    if (!isRanked || !bothReady) return;

    const checkStartRoll = async () => {
      try {
        const { data: session } = await supabase
          .from("game_sessions")
          .select("start_roll_finalized, start_roll, starting_player_wallet")
          .eq("room_pda", roomPda)
          .maybeSingle();

        if (session?.start_roll_finalized && session.starting_player_wallet) {
          // Roll already finalized
          const starter = session.starting_player_wallet;
          const isStarter = starter.toLowerCase() === myWallet?.toLowerCase();
          setMyColor(isStarter ? "w" : "b");
          setStartingWallet(starter);
          setRollResult(session.start_roll as unknown as StartRollResult);
          setIsFinalized(true);
          console.log("[useStartRoll] Start roll already finalized. Starter:", starter);
        } else {
          // Need to show dice roll
          setShowDiceRoll(true);
        }
      } catch (err) {
        console.error("[useStartRoll] Failed to check start roll:", err);
        setShowDiceRoll(true);
      }
    };

    checkStartRoll();
  }, [roomPda, bothReady, isFinalized, myWallet, isRanked, roomPlayers.length]);

  const handleRollComplete = useCallback((starter: string) => {
    const isStarter = starter.toLowerCase() === myWallet?.toLowerCase();
    setMyColor(isStarter ? "w" : "b");
    setStartingWallet(starter);
    setIsFinalized(true);
    setShowDiceRoll(false);
    console.log("[useStartRoll] Roll complete. Starter:", starter, "My color:", isStarter ? "white" : "black");
  }, [myWallet]);

  return {
    isFinalized,
    showDiceRoll,
    myColor,
    startingWallet,
    rollResult,
    handleRollComplete,
  };
}
