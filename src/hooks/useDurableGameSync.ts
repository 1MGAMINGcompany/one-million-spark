import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GameMove {
  room_pda: string;
  turn_number: number;
  wallet: string;
  move_data: any;
  prev_hash: string;
  move_hash: string;
  created_at: string;
}

interface SubmitMoveResponse {
  success: boolean;
  moveHash?: string;
  turnNumber?: number;
  error?: string;
  expected?: number;
  received?: number;
  lastHash?: string;
  expectedPlayer?: string;
}

interface UseDurableGameSyncOptions {
  roomPda: string;
  enabled?: boolean;
  onMoveReceived?: (move: GameMove) => void;
  onMovesLoaded?: (moves: GameMove[]) => void;
  onTurnMismatch?: (expected: number) => void;
  onNotYourTurn?: () => void;
}

export function useDurableGameSync({
  roomPda,
  enabled = true,
  onMoveReceived,
  onMovesLoaded,
  onTurnMismatch,
  onNotYourTurn,
}: UseDurableGameSyncOptions) {
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastHash, setLastHash] = useState<string>("genesis");
  const lastTurnRef = useRef<number>(0);
  const loadedRef = useRef(false);
  const resyncToastIdRef = useRef<string | number | null>(null);
  const lastResyncTimeRef = useRef<number>(0);

  // Load existing moves from DB on mount
  const loadMoves = useCallback(async (): Promise<GameMove[]> => {
    if (!roomPda) return [];

    try {
      console.log("[DurableSync] Loading moves for room:", roomPda.slice(0, 8));
      
      const { data, error } = await supabase.functions.invoke("get-moves", {
        body: { roomPda },
      });

      if (error) {
        console.error("[DurableSync] Edge function error:", error);
        throw error;
      }

      const result = data as { success: boolean; moves?: GameMove[]; error?: string };

      if (result.success && result.moves) {
        console.log("[DurableSync] Loaded moves from DB:", result.moves.length);
        setMoves(result.moves);
        if (result.moves.length > 0) {
          const lastMove = result.moves[result.moves.length - 1];
          setLastHash(lastMove.move_hash);
          lastTurnRef.current = lastMove.turn_number;
        }
        onMovesLoaded?.(result.moves);
        
        // Dismiss any active resync toast on successful load
        if (resyncToastIdRef.current) {
          toast.dismiss(resyncToastIdRef.current);
          resyncToastIdRef.current = null;
        }
        
        return result.moves;
      } else {
        console.warn("[DurableSync] No moves returned:", result.error);
      }
    } catch (err) {
      console.error("[DurableSync] Failed to load moves:", err);
    }
    
    return [];
  }, [roomPda, onMovesLoaded]);

  // Submit a move to DB - server validates turn and player
  const submitMove = useCallback(async (moveData: any, wallet: string): Promise<boolean> => {
    if (!roomPda) return false;

    // Use local turn as hint, but server is authoritative
    const turnNumber = lastTurnRef.current + 1;

    try {
      console.log("[DurableSync] Submitting move:", { turn: turnNumber, wallet: wallet.slice(0, 8) });
      
      const { data, error } = await supabase.functions.invoke("submit-move", {
        body: {
          roomPda,
          turnNumber,
          wallet,
          moveData,
          prevHash: lastHash,
        },
      });

      if (error) {
        console.error("[DurableSync] Edge function error:", error);
        throw error;
      }

      const result = data as SubmitMoveResponse;

      if (result.success && result.moveHash) {
        console.log("[DurableSync] Move saved:", { turn: result.turnNumber, hash: result.moveHash.slice(0, 8) });
        setLastHash(result.moveHash);
        lastTurnRef.current = result.turnNumber || turnNumber;
        return true;
      } else {
        // Handle specific server errors with NON-BLOCKING feedback
        const now = Date.now();
        const RESYNC_COOLDOWN = 3000; // Don't spam toasts within 3 seconds
        
        switch (result.error) {
          case "turn_mismatch":
            console.warn("[DurableSync] Turn mismatch - resyncing. Expected:", result.expected);
            onTurnMismatch?.(result.expected || 0);
            // Reload moves to get back in sync
            await loadMoves();
            
            // Show non-blocking toast with cooldown
            if (now - lastResyncTimeRef.current > RESYNC_COOLDOWN) {
              lastResyncTimeRef.current = now;
              resyncToastIdRef.current = toast("Resyncing...", {
                description: "Catching up with opponent's moves",
                duration: 2000,
              });
            }
            return false;
            
          case "not_your_turn":
            console.warn("[DurableSync] Not your turn");
            onNotYourTurn?.();
            // Don't show toast - this is expected when opponent's move hasn't arrived yet
            return false;
            
          case "turn_already_taken":
            console.warn("[DurableSync] Turn already taken (race condition)");
            // Reload moves to get the winning move
            await loadMoves();
            return false;
            
          case "hash_mismatch":
            console.warn("[DurableSync] Hash mismatch - resyncing");
            await loadMoves();
            
            // Show non-blocking toast with cooldown
            if (now - lastResyncTimeRef.current > RESYNC_COOLDOWN) {
              lastResyncTimeRef.current = now;
              resyncToastIdRef.current = toast("Resyncing...", {
                description: "State mismatch detected",
                duration: 2000,
              });
            }
            return false;
            
          default:
            throw new Error(result.error || "Submit failed");
        }
      }
    } catch (err: any) {
      console.error("[DurableSync] Failed to save move:", err);
      // Only show error for unexpected failures, not sync issues
      toast.error("Move failed", {
        description: "Could not submit move to server",
        duration: 3000,
      });
      return false;
    }
  }, [roomPda, lastHash, loadMoves, onTurnMismatch, onNotYourTurn]);

  // Subscribe to realtime updates on game_moves
  useEffect(() => {
    if (!enabled || !roomPda) return;

    console.log("[DurableSync] Subscribing to game_moves for room:", roomPda.slice(0, 8));

    const channel = supabase
      .channel(`game_moves_${roomPda}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_moves",
          filter: `room_pda=eq.${roomPda}`,
        },
        (payload) => {
          const newMove = payload.new as GameMove;
          console.log("[DurableSync] Received move via Realtime:", {
            turn: newMove.turn_number,
            wallet: newMove.wallet.slice(0, 8),
          });

          // Only process if this is a new move we haven't seen
          if (newMove.turn_number > lastTurnRef.current) {
            setMoves((prev) => [...prev, newMove]);
            setLastHash(newMove.move_hash);
            lastTurnRef.current = newMove.turn_number;
            onMoveReceived?.(newMove);
          }
        }
      )
      .subscribe((status) => {
        console.log("[DurableSync] Subscription status:", status);
      });

    return () => {
      console.log("[DurableSync] Unsubscribing from game_moves");
      supabase.removeChannel(channel);
    };
  }, [enabled, roomPda, onMoveReceived]);

  // Initial load
  useEffect(() => {
    if (enabled && roomPda && !loadedRef.current) {
      loadedRef.current = true;
      loadMoves().finally(() => setIsLoading(false));
    }
  }, [enabled, roomPda, loadMoves]);

  // Reset when room changes
  useEffect(() => {
    loadedRef.current = false;
    setMoves([]);
    setLastHash("genesis");
    lastTurnRef.current = 0;
    setIsLoading(true);
  }, [roomPda]);

  return {
    moves,
    isLoading,
    submitMove,
    loadMoves,
    lastTurn: lastTurnRef.current,
    lastHash,
  };
}
