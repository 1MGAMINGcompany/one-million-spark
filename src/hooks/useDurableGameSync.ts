import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { dbg } from "@/lib/debugLog";

export interface GameMove {
  room_pda: string;
  turn_number: number;
  wallet: string;
  move_data: any;
  prev_hash: string;
  move_hash: string;
  created_at: string;
  client_move_id?: string;
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
  idempotent?: boolean;
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
      dbg("durable.load.start", { room: roomPda.slice(0, 8) });
      
      const { data, error } = await supabase.functions.invoke("get-moves", {
        body: { roomPda },
      });

      if (error) {
        console.error("[DurableSync] Edge function error:", error);
        dbg("durable.load.error", { error: error.message });
        throw error;
      }

      const result = data as { success: boolean; moves?: GameMove[]; error?: string };

      if (result.success && result.moves) {
        dbg("durable.load.ok", { count: result.moves.length });
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
        dbg("durable.load.empty", { error: result.error });
      }
    } catch (err) {
      console.error("[DurableSync] Failed to load moves:", err);
      dbg("durable.load.fail", { error: String(err) });
    }
    
    return [];
  }, [roomPda, onMovesLoaded]);

  // Submit a move to DB - server validates turn and assigns sequence
  const submitMove = useCallback(async (moveData: any, wallet: string): Promise<boolean> => {
    if (!roomPda) return false;

    // Generate unique client ID for idempotency (retries are safe)
    const clientMoveId = crypto.randomUUID();
    
    dbg("durable.submit", { 
      clientMoveId: clientMoveId.slice(0, 8), 
      type: moveData.type,
      wallet: wallet.slice(0, 8)
    });

    try {
      const { data, error } = await supabase.functions.invoke("submit-move", {
        body: {
          roomPda,
          wallet,
          moveData,
          clientMoveId,
          // NO turnNumber - server assigns
          // NO prevHash - server computes chain
        },
      });

      if (error) {
        console.error("[DurableSync] Edge function error:", error);
        dbg("durable.submit.invoke_error", { error: error.message });
        throw error;
      }

      const result = data as SubmitMoveResponse;

      if (result.success && result.moveHash) {
        dbg("durable.submit.ok", { 
          serverTurn: result.turnNumber, 
          hash: result.moveHash.slice(0, 8),
          idempotent: result.idempotent 
        });
        setLastHash(result.moveHash);
        lastTurnRef.current = result.turnNumber || lastTurnRef.current + 1;
        return true;
      } else {
        // Handle specific server errors with NON-BLOCKING feedback
        const now = Date.now();
        const RESYNC_COOLDOWN = 3000; // Don't spam toasts within 3 seconds
        
        dbg("durable.submit.fail", { error: result.error, expected: result.expected });
        
        switch (result.error) {
          case "turn_mismatch":
            console.warn("[DurableSync] Turn mismatch - resyncing. Expected:", result.expected);
            onTurnMismatch?.(result.expected || 0);
            await loadMoves();
            
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
            dbg("durable.submit.not_your_turn", { wallet: wallet.slice(0, 8) });
            onNotYourTurn?.();
            // Force resync to get latest turn state
            await loadMoves();
            return false;
            
          case "turn_already_taken":
          case "move_conflict":
            console.warn("[DurableSync] Move conflict (race condition)");
            dbg("durable.submit.race_lost", {});
            await loadMoves();
            return false;
            
          case "timeout_too_early":
            console.warn("[DurableSync] Timeout submitted too early");
            dbg("durable.submit.timeout_early", {});
            return false;
            
          case "missing_client_move_id":
            // This should never happen if client code is correct
            console.error("[DurableSync] Missing clientMoveId for ranked game - this is a bug!");
            dbg("durable.submit.missing_client_id", { wallet: wallet.slice(0, 8) });
            toast.error("Move failed", {
              description: "Missing move ID. Please refresh the page.",
              duration: 5000,
            });
            return false;
            
          case "no_turn_authority":
            console.warn("[DurableSync] No turn authority set - waiting for start roll");
            dbg("durable.submit.no_authority", {});
            return false;
            
          case "session_not_found":
            console.warn("[DurableSync] Session not found");
            dbg("durable.submit.no_session", {});
            toast.error("Game session not found", { duration: 3000 });
            return false;
            
          case "not_a_participant":
            console.warn("[DurableSync] Wallet not a participant");
            dbg("durable.submit.not_participant", { wallet: wallet.slice(0, 8) });
            toast.error("You are not a participant in this game", { duration: 3000 });
            return false;
            
          case "hash_mismatch":
            console.warn("[DurableSync] Hash mismatch - resyncing");
            await loadMoves();
            
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
      dbg("durable.submit.exception", { error: err.message });
      toast.error("Move failed", {
        description: "Could not submit move to server",
        duration: 3000,
      });
      return false;
    }
  }, [roomPda, loadMoves, onTurnMismatch, onNotYourTurn]);

  // Subscribe to realtime updates on game_moves
  useEffect(() => {
    if (!enabled || !roomPda) return;

    dbg("durable.subscribe", { room: roomPda.slice(0, 8) });

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
          dbg("durable.realtime", { 
            turn: newMove.turn_number, 
            wallet: newMove.wallet.slice(0, 8),
            type: newMove.move_data?.type
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
        dbg("durable.subscription_status", { status });
      });

    return () => {
      dbg("durable.unsubscribe", { room: roomPda.slice(0, 8) });
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
