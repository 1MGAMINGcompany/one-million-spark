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
import { isSameWallet, isRealWallet } from "@/lib/walletUtils";
import { isGameFinished } from "@/lib/gameStatus";

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
  /** Force refetch for cross-device sync */
  forceRefetch: () => Promise<void>;
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

  // Reset state when room changes (prevents stuck refs across rooms)
  useEffect(() => {
    sessionCreatedRef.current = false;
    setIsFinalized(false);
    setShowDiceRoll(false);
    setStartingWallet(null);
    setRollResult(null);
  }, [roomPda]);

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
    
    // ✅ Only create sessions with real wallets (excludes 111111..., waiting-, error-, ai-)
    if (!isRealWallet(player1) || !isRealWallet(player2)) return;

    const createSession = async () => {
      setIsCreatingSession(true);
      sessionCreatedRef.current = true;
      
      try {
        // PART 2 FIX: Check if session already exists to avoid overwriting mode
        const { data: existingData } = await supabase.functions.invoke("game-session-get", {
          body: { roomPda },
        });
        
        if (existingData?.session?.room_pda) {
          console.log("[useStartRoll] Session already exists, skipping ensure_game_session");
          setIsCreatingSession(false);
          return;
        }
        
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
          // CRITICAL: If session is finished, this is stale data - show dice UI for new game
          if (isGameFinished(session.status_int)) {
            console.log("[useStartRoll] Session finished - ignoring stale finalized data");
            setShowDiceRoll(true);
            return;
          }
          // Roll already finalized
          const starter = session.starting_player_wallet;
          const isStarter = isSameWallet(starter, myWallet);
          setMyColor(isStarter ? "w" : "b");
          setStartingWallet(starter);
          setRollResult(session.start_roll as unknown as StartRollResult);
          setIsFinalized(true);
          console.log("[useStartRoll] Start roll already finalized. Starter:", starter);
        } else if (session) {
          // Session exists but not finalized - check if player2 is synced
          if (!session.player2_wallet) {
            console.log("[useStartRoll] Session exists but player2 not synced yet, waiting...");
            // Don't show dice roll yet - poll until player2 is synced
            setTimeout(() => {
              // Re-trigger the effect after a delay
              setShowDiceRoll(true); // Show anyway after delay to allow auto-retry
            }, 1500);
            return;
          }
          console.log("[useStartRoll] Session exists with both players, showing dice roll UI");
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
          // Skip if session is finished (stale data)
          if (isGameFinished(session.status_int)) return;
          
          const starter = session.starting_player_wallet;
          const isStarter = isSameWallet(starter, myWallet);
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

  // --- START: Baseline start-roll polling (runs even if realtime drops) ---
  // This poll runs independently of hasTwoRealPlayers, bothReady, or showDiceRoll
  // It ensures mobile can recover even if it missed every WebSocket event
  // Only depends on: roomPda exists, not finalized, not showing dice UI
  useEffect(() => {
    if (!roomPda) return;
    if (isFinalized) return;
    if (showDiceRoll) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("game-session-get", {
          body: { roomPda },
        });

        if (cancelled) return;

        if (error) {
          console.warn("[useStartRoll] pre-roll game-session-get error:", error);
          return;
        }

        const s = data?.session;
        if (!s) return;

        // If opponent already finalized, hydrate immediately
        if (s.start_roll_finalized && s.starting_player_wallet) {
          // CRITICAL: If session is finished, this is stale data - show dice UI
          if (isGameFinished(s.status_int)) {
            console.log("[useStartRoll] Session finished - showing dice roll for new game");
            setShowDiceRoll(true);
            return;
          }
          
          const starter = String(s.starting_player_wallet || "").trim();

          setStartingWallet(starter);
          setMyColor(isSameWallet(starter, myWallet) ? "w" : "b");

          if (s.start_roll) setRollResult(s.start_roll as unknown as StartRollResult);

          setIsFinalized(true);
          setShowDiceRoll(false);

          console.log("[useStartRoll] Found finalized start roll from server. starter=", starter);
          return;
        }

        // If both players are ready server-side, force dice UI to appear
        if (s.p1_ready && s.p2_ready) {
          console.log("[useStartRoll] Server shows both ready, showing dice roll UI");
          setShowDiceRoll(true);
        }
      } catch (e) {
        if (!cancelled) console.warn("[useStartRoll] pre-roll poll exception:", e);
      }
    };

    poll();
    const id = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomPda, isFinalized, showDiceRoll, myWallet]);
  // --- END: Baseline start-roll polling ---

  const handleRollComplete = useCallback(async (starter: string) => {
    const isStarter = isSameWallet(starter, myWallet);
    setMyColor(isStarter ? "w" : "b");
    setStartingWallet(starter);
    setIsFinalized(true);
    setShowDiceRoll(false);
    console.log("[useStartRoll] Roll complete. Starter:", starter, "My color:", isStarter ? "white" : "black");
    
    // Use atomic RPC to set current_turn_wallet + turn_started_at
    // This prevents race conditions if both clients try to finalize
    if (roomPda && starter) {
      try {
        const { data, error } = await supabase.rpc("finalize_start_roll", {
          p_room_pda: roomPda,
          p_starting_wallet: starter,
          p_start_roll: rollResult ? JSON.parse(JSON.stringify(rollResult)) : null,
        });
        
        if (error) {
          console.warn("[useStartRoll] Failed to finalize start roll:", error);
        } else if (data) {
          console.log("[useStartRoll] Start roll finalized atomically - starter:", starter.slice(0, 8));
        } else {
          console.log("[useStartRoll] Start roll already finalized by opponent");
        }
      } catch (err) {
        console.warn("[useStartRoll] Exception finalizing start roll:", err);
      }
    }
  }, [myWallet, roomPda, rollResult]);

  // Force refetch for cross-device sync (e.g., on visibility change)
  const forceRefetch = useCallback(async () => {
    if (!roomPda) return;
    
    console.log("[useStartRoll] Force refetch triggered");
    try {
      const { data: resp, error } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });
      
      if (error) {
        console.error("[useStartRoll] Force refetch error:", error);
        return;
      }

      const session = resp?.session;
      if (session?.start_roll_finalized && session.starting_player_wallet) {
        if (isGameFinished(session.status_int)) {
          console.log("[useStartRoll] Force refetch: session finished, showing dice UI");
          setShowDiceRoll(true);
          return;
        }
        
        const starter = session.starting_player_wallet;
        const isStarter = isSameWallet(starter, myWallet);
        setMyColor(isStarter ? "w" : "b");
        setStartingWallet(starter);
        setRollResult(session.start_roll as unknown as StartRollResult);
        setIsFinalized(true);
        setShowDiceRoll(false);
        console.log("[useStartRoll] Force refetch found finalized roll. Starter:", starter);
      }
    } catch (err) {
      console.error("[useStartRoll] Force refetch failed:", err);
    }
  }, [roomPda, myWallet]);

  return {
    isFinalized,
    showDiceRoll,
    myColor,
    startingWallet,
    rollResult,
    handleRollComplete,
    isCreatingSession,
    forceRefetch,
  };
}
