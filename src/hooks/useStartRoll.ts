/**
 * Hook to manage deterministic dice roll for starting player selection
 * 
 * Works for BOTH casual and ranked games - all multiplayer games use dice roll
 * to fairly determine who starts first.
 * 
 * Flow:
 * 1. When both players connect → ensure_game_session creates the session
 * 2. Show dice roll UI → either player clicks to trigger compute_start_roll
 * 3. Result stored in game_sessions, both clients see same result
 * 4. For ranked games: also show accept rules modal after dice roll
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  /** Whether session is being created */
  isCreatingSession: boolean;
}

export function useStartRoll(options: UseStartRollOptions): UseStartRollResult {
  const { roomPda, gameType, myWallet, isRanked, roomPlayers, hasTwoRealPlayers, initialColor, bothReady } = options;

  const [isFinalized, setIsFinalized] = useState(false);
  const [showDiceRoll, setShowDiceRoll] = useState(false);
  const [myColor, setMyColor] = useState<"w" | "b">(initialColor);
  const [startingWallet, setStartingWallet] = useState<string | null>(null);
  const [rollResult, setRollResult] = useState<StartRollResult | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  
  const sessionCreatedRef = useRef(false);

  // Update color from initial when it changes (before dice roll)
  useEffect(() => {
    if (!isFinalized) {
      setMyColor(initialColor);
    }
  }, [initialColor, isFinalized]);

  // Create game session when both players connect
  useEffect(() => {
    if (!roomPda || !hasTwoRealPlayers || sessionCreatedRef.current) return;
    if (roomPlayers.length < 2) return;
    
    const player1 = roomPlayers[0];
    const player2 = roomPlayers[1];
    
    // Validate both are real wallets
    if (!player1 || !player2) return;
    if (player1.startsWith("waiting-") || player1.startsWith("error-")) return;
    if (player2.startsWith("waiting-") || player2.startsWith("error-")) return;

    const createSession = async () => {
      setIsCreatingSession(true);
      sessionCreatedRef.current = true;
      
      try {
        console.log("[useStartRoll] Creating game session for both players", { roomPda, player1, player2 });
        
        const { error } = await supabase.rpc("ensure_game_session", {
          p_room_pda: roomPda,
          p_game_type: gameType,
          p_player1_wallet: player1,
          p_player2_wallet: player2,
          p_mode: isRanked ? "ranked" : "casual",
        });

        if (error) {
          console.error("[useStartRoll] Failed to ensure game session:", error);
          sessionCreatedRef.current = false; // Allow retry
        } else {
          console.log("[useStartRoll] Game session created/ensured successfully");
        }
      } catch (err) {
        console.error("[useStartRoll] Error ensuring game session:", err);
        sessionCreatedRef.current = false;
      } finally {
        setIsCreatingSession(false);
      }
    };

    createSession();
  }, [roomPda, gameType, hasTwoRealPlayers, roomPlayers, isRanked]);

  // Check for existing roll OR show dice roll UI when session is ready
  useEffect(() => {
    if (!roomPda || isFinalized || !hasTwoRealPlayers) return;
    if (isCreatingSession) return;

    const checkStartRoll = async () => {
      try {
        // Use Edge Function instead of direct table access (RLS locked)
        const { data: resp, error } = await supabase.functions.invoke("game-session-get", {
          body: { roomPda },
        });
        
        if (error) {
          console.error("[useStartRoll] Edge function error:", error);
          setShowDiceRoll(true);
          return;
        }

        const session = resp?.session;
        if (session?.start_roll_finalized && session.starting_player_wallet) {
          // Roll already finalized
          const starter = session.starting_player_wallet;
          const isStarter = starter.toLowerCase() === myWallet?.toLowerCase();
          setMyColor(isStarter ? "w" : "b");
          setStartingWallet(starter);
          setRollResult(session.start_roll as unknown as StartRollResult);
          setIsFinalized(true);
          console.log("[useStartRoll] Start roll already finalized. Starter:", starter);
        } else if (session) {
          // Session exists but not finalized - show dice roll
          console.log("[useStartRoll] Session exists, showing dice roll UI");
          setShowDiceRoll(true);
        } else {
          // Session doesn't exist yet - wait for it to be created
          console.log("[useStartRoll] Session not found yet, waiting...");
          // Re-check after a short delay
          setTimeout(() => {
            setShowDiceRoll(true); // Show anyway after delay
          }, 1000);
        }
      } catch (err) {
        console.error("[useStartRoll] Failed to check start roll:", err);
        setShowDiceRoll(true);
      }
    };

    checkStartRoll();
  }, [roomPda, hasTwoRealPlayers, isFinalized, myWallet, isCreatingSession]);

  // Poll for roll result (in case other player triggered it)
  useEffect(() => {
    if (!roomPda || isFinalized || !showDiceRoll) return;

    const pollInterval = setInterval(async () => {
      try {
        // Use Edge Function instead of direct table access (RLS locked)
        const { data: resp, error } = await supabase.functions.invoke("game-session-get", {
          body: { roomPda },
        });
        
        if (error) return; // Silent fail on poll

        const session = resp?.session;
        if (session?.start_roll_finalized && session.starting_player_wallet) {
          const starter = session.starting_player_wallet;
          const isStarter = starter.toLowerCase() === myWallet?.toLowerCase();
          setMyColor(isStarter ? "w" : "b");
          setStartingWallet(starter);
          setRollResult(session.start_roll as unknown as StartRollResult);
          setIsFinalized(true);
          setShowDiceRoll(false);
          console.log("[useStartRoll] Poll found finalized roll. Starter:", starter);
          clearInterval(pollInterval);
        }
      } catch (err) {
        // Silent fail on poll
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [roomPda, isFinalized, showDiceRoll, myWallet]);

  // NEW: Poll every 2s when bothReady but not finalized and not showing dice UI
  // This catches the case where desktop is stuck in RulesGate while mobile proceeds
  useEffect(() => {
    if (!roomPda || !bothReady || isFinalized || showDiceRoll) return;

    console.log("[useStartRoll] bothReady polling started");

    const pollInterval = setInterval(async () => {
      try {
        const { data: resp, error } = await supabase.functions.invoke("game-session-get", {
          body: { roomPda },
        });

        if (error) {
          console.log("[useStartRoll] bothReady poll error:", error);
          return;
        }

        const session = resp?.session;
        if (session?.start_roll_finalized && session.starting_player_wallet) {
          const starter = session.starting_player_wallet;
          const isStarter = starter.toLowerCase() === myWallet?.toLowerCase();
          setMyColor(isStarter ? "w" : "b");
          setStartingWallet(starter);
          setRollResult(session.start_roll as unknown as StartRollResult);
          setIsFinalized(true);
          setShowDiceRoll(false);
          console.log("[useStartRoll] bothReady poll found finalized roll. Starter:", starter);
          clearInterval(pollInterval);
        } else if (session && !showDiceRoll) {
          // Session exists but roll not finalized - show dice UI
          console.log("[useStartRoll] bothReady poll: showing dice roll UI");
          setShowDiceRoll(true);
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.log("[useStartRoll] bothReady poll exception:", err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [roomPda, bothReady, isFinalized, showDiceRoll, myWallet]);

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
    isCreatingSession,
  };
}
