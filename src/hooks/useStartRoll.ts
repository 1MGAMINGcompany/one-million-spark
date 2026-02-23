/**
 * Hook for starting player selection - FAST START MODE
 * 
 * Creator (player1) always goes first immediately - no dice roll needed.
 * This eliminates the dice roll ceremony and ensures games start instantly.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { isSameWallet, isRealWallet } from "@/lib/walletUtils";

interface StartRollResult {
  p1: { wallet: string; dice: number[]; total: number };
  p2: { wallet: string; dice: number[]; total: number };
  reroll_count: number;
  winner: string;
}

interface UseStartRollOptions {
  roomPda: string | undefined;
  gameType: string;
  myWallet: string | undefined;
  isRanked: boolean;
  /** Array of player wallet addresses */
  roomPlayers: string[];
  /** Whether both players are connected with real wallets */
  hasTwoRealPlayers: boolean;
  /** Initial color from on-chain order (fallback) */
  initialColor: "w" | "b";
  /** Whether both players have accepted rules (for ranked games) - triggers polling */
  bothReady?: boolean;
}

interface UseStartRollResult {
  /** Whether the start roll has been finalized - ALWAYS TRUE (no dice roll) */
  isFinalized: boolean;
  /** Whether to show the dice roll UI - ALWAYS FALSE (no dice roll) */
  showDiceRoll: boolean;
  /** Player's color after roll */
  myColor: "w" | "b";
  /** The starting player's wallet address */
  startingWallet: string | null;
  /** Roll result data (for display) - ALWAYS NULL (no dice roll) */
  rollResult: StartRollResult | null;
  /** Handle completion of the dice roll UI - NO-OP (no dice roll) */
  handleRollComplete: (startingWallet: string) => void;
  /** Whether session is being created */
  isCreatingSession: boolean;
  /** Force refetch for cross-device sync - NO-OP (no dice roll) */
  forceRefetch: () => Promise<void>;
}

/**
 * FAST START: Creator (player1) always goes first immediately.
 * No dice roll ceremony - games start instantly when both players are ready.
 */
export function useStartRoll(options: UseStartRollOptions): UseStartRollResult {
  const { roomPda, gameType, myWallet, isRanked, roomPlayers, hasTwoRealPlayers } = options;

  // FAST START: Creator (player1) always goes first - no dice roll needed
  const player1Wallet = roomPlayers[0] || null;
  const isStarter = isSameWallet(player1Wallet, myWallet);
  
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const sessionCreatedRef = useRef(false);

  // Reset when room changes
  useEffect(() => {
    sessionCreatedRef.current = false;
  }, [roomPda]);

  // Create game session when both players connect (still needed for game state)
  // The updated ensure_game_session RPC now sets p1_ready, p2_ready, start_roll_finalized,
  // current_turn_wallet, and turn_started_at when both players are present
  // Free rooms use anon IDs which aren't "real wallets" - treat them as valid
  const isFreeRoom = roomPda?.startsWith("free-") ?? false;
  const effectiveHasTwoPlayers = isFreeRoom 
    ? (roomPlayers.length >= 2 && roomPlayers[0] && roomPlayers[1])
    : hasTwoRealPlayers;

  useEffect(() => {
    if (!roomPda || !effectiveHasTwoPlayers || sessionCreatedRef.current) return;
    if (roomPlayers.length < 2) return;
    
    const player1 = roomPlayers[0];
    const player2 = roomPlayers[1];
    
    // Only create sessions with real wallets (skip check for free rooms - anon IDs are valid)
    if (!isFreeRoom && (!isRealWallet(player1) || !isRealWallet(player2))) return;

    const createSession = async () => {
      setIsCreatingSession(true);
      sessionCreatedRef.current = true;
      
      try {
        // Session is created by record_acceptance (single authority pattern)
        // This hook now only logs for debugging - session already exists
        console.log("[useStartRoll] Session should exist via record_acceptance (FAST START)", { roomPda, player1, player2 });
      } catch (err) {
        console.error("[useStartRoll] Error ensuring game session:", err);
        sessionCreatedRef.current = false;
      } finally {
        setIsCreatingSession(false);
      }
    };

    createSession();
  }, [roomPda, gameType, effectiveHasTwoPlayers, roomPlayers, isRanked, isFreeRoom]);

  // NO-OP handlers (dice roll is gone)
  const handleRollComplete = useCallback(() => {
    // No-op - dice roll is removed
  }, []);

  const forceRefetch = useCallback(async () => {
    // No-op - dice roll is removed
  }, []);

  return {
    // FAST START: Always finalized, never show dice roll
    isFinalized: true,
    showDiceRoll: false,
    // Creator (player1) always goes first
    myColor: isStarter ? "w" : "b",
    startingWallet: player1Wallet,
    rollResult: null,
    handleRollComplete,
    isCreatingSession,
    forceRefetch,
  };
}
