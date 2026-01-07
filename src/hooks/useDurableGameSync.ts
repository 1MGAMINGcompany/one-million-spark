import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface GameMove {
  room_pda: string;
  turn_number: number;
  wallet: string;
  move_data: any;
  prev_hash: string;
  move_hash: string;
  created_at: string;
}

interface UseDurableGameSyncOptions {
  roomPda: string;
  enabled?: boolean;
  onMoveReceived?: (move: GameMove) => void;
  onMovesLoaded?: (moves: GameMove[]) => void;
}

export function useDurableGameSync({
  roomPda,
  enabled = true,
  onMoveReceived,
  onMovesLoaded,
}: UseDurableGameSyncOptions) {
  const { toast } = useToast();
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastHash, setLastHash] = useState<string>("genesis");
  const lastTurnRef = useRef<number>(0);
  const isDev = import.meta.env.DEV;
  const loadedRef = useRef(false);

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
        if (isDev && result.moves.length > 0) {
          toast({
            title: "State Restored",
            description: `Loaded ${result.moves.length} moves from server`,
          });
        }
        setMoves(result.moves);
        if (result.moves.length > 0) {
          const lastMove = result.moves[result.moves.length - 1];
          setLastHash(lastMove.move_hash);
          lastTurnRef.current = lastMove.turn_number;
        }
        onMovesLoaded?.(result.moves);
        return result.moves;
      } else {
        console.warn("[DurableSync] No moves returned:", result.error);
      }
    } catch (err) {
      console.error("[DurableSync] Failed to load moves:", err);
    }
    
    return [];
  }, [roomPda, toast, isDev, onMovesLoaded]);

  // Submit a move to DB
  const submitMove = useCallback(async (moveData: any, wallet: string): Promise<boolean> => {
    if (!roomPda) return false;

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

      const result = data as { success: boolean; moveHash?: string; error?: string };

      if (result.success && result.moveHash) {
        console.log("[DurableSync] Move saved:", { turn: turnNumber, hash: result.moveHash.slice(0, 8) });
        if (isDev) {
          toast({
            title: `Move ${turnNumber} Saved`,
            description: `Hash: ${result.moveHash.slice(0, 8)}...`,
          });
        }
        setLastHash(result.moveHash);
        lastTurnRef.current = turnNumber;
        return true;
      } else {
        throw new Error(result.error || "Submit failed");
      }
    } catch (err: any) {
      console.error("[DurableSync] Failed to save move:", err);
      toast({
        title: "Move Save Failed",
        description: err?.message || "Could not persist move to server",
        variant: "destructive",
      });
      return false;
    }
  }, [roomPda, lastHash, toast, isDev]);

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
