import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { dbg } from "@/lib/debugLog";
import { getSessionToken, getAuthHeaders } from "@/lib/sessionToken";

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
  
  // CHANNEL_ERROR retry backoff refs
  const lastChannelErrorRetryRef = useRef<number>(0);
  const channelErrorRetryCountRef = useRef<number>(0);
  
  // Track previous roomPda to prevent state wipe on transient disconnects
  const prevRoomPdaRef = useRef<string | null>(null);
  
  // Store callbacks in refs to prevent resubscribe thrash
  const onMoveReceivedRef = useRef(onMoveReceived);
  useEffect(() => {
    onMoveReceivedRef.current = onMoveReceived;
  }, [onMoveReceived]);

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
  // 🔒 Identity is derived from session token on server - wallet param is for local logging only
  const submitMove = useCallback(async (moveData: any, wallet: string): Promise<boolean> => {
    if (!roomPda) return false;

    // 🔒 SECURITY: Get session token - required for authenticated submission
    const sessionToken = getSessionToken(roomPda);
    if (!sessionToken) {
      console.error("[DurableSync] No session token found for room:", roomPda.slice(0, 8));
      dbg("durable.submit.no_session_token", { room: roomPda.slice(0, 8) });
      toast.error("Session expired", {
        description: "Please re-ready to continue playing",
        duration: 5000,
      });
      return false;
    }

    // Generate unique client ID for idempotency (retries are safe)
    const clientMoveId = crypto.randomUUID();
    
    dbg("durable.submit", { 
      clientMoveId: clientMoveId.slice(0, 8), 
      type: moveData.type,
      wallet: wallet.slice(0, 8)
    });

    try {
      console.log("[DurableSync] Invoking submit-move edge function:", {
        roomPda: roomPda.slice(0, 8),
        wallet: wallet.slice(0, 8), // Local logging only - server derives from session
        moveType: moveData.type,
        clientMoveId: clientMoveId.slice(0, 8),
      });
      
      // 🔒 Body schema: { roomPda, moveData, clientMoveId } - NO wallet
      // Wallet identity is derived from Authorization header on server
      const { data, error } = await supabase.functions.invoke("submit-move", {
        body: {
          roomPda,
          moveData,
          clientMoveId,
          // NO wallet - server derives from session token
          // NO turnNumber - server assigns
          // NO prevHash - server computes chain
        },
        headers: getAuthHeaders(sessionToken),
      });

      if (error) {
        console.error("[DurableSync] Edge function ERROR:", error);
        console.error("[DurableSync] Error name:", error.name);
        console.error("[DurableSync] Error message:", error.message);
        console.error("[DurableSync] Full error:", JSON.stringify(error, null, 2));
        dbg("durable.submit.invoke_error", { 
          error: error.message, 
          name: error.name,
          roomPda: roomPda.slice(0, 8) 
        });
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
            
          case "unauthorized":
            console.warn("[DurableSync] Session token invalid or expired");
            dbg("durable.submit.unauthorized", { wallet: wallet.slice(0, 8) });
            toast.error("Session expired", {
              description: "Please re-ready to continue playing",
              duration: 5000,
            });
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
          const newMove = payload.new as Partial<GameMove>;

          const turn = typeof newMove.turn_number === "number" 
            ? newMove.turn_number 
            : null;

          const walletShort = typeof newMove.wallet === "string" 
            ? newMove.wallet.slice(0, 8) 
            : "unknown";

          dbg("durable.realtime", {
            turn,
            wallet: walletShort,
            type: (newMove as any)?.move_data?.type,
          });

          // Ignore malformed payloads
          if (turn === null) return;

          // Only process if this is a new move we haven't seen
          if (turn > lastTurnRef.current) {
            setMoves((prev) => [...prev, newMove as GameMove]);
            setLastHash((newMove as GameMove).move_hash);
            lastTurnRef.current = turn;
            onMoveReceivedRef.current?.(newMove as GameMove);
          }
        }
      )
      .subscribe((status, error) => {
        console.log("[DurableSync] Subscription status:", status);
        dbg("durable.subscription_status", { status, error: error?.message });
        
        if (error) {
          console.error("[DurableSync] Subscription ERROR object:", error);
          console.error("[DurableSync] Error message:", error.message);
          console.error("[DurableSync] Full error JSON:", JSON.stringify(error, null, 2));
          dbg("durable.subscription_error", { 
            message: error.message,
            status,
            roomPda: roomPda.slice(0, 8)
          });
        }
        
        if (status === 'SUBSCRIBED') {
          console.log("[DurableSync] Successfully subscribed to room:", roomPda.slice(0, 8));
          dbg("durable.subscribed", { roomPda: roomPda.slice(0, 8) });
        }
        
        // Handle channel error with exponential backoff to prevent retry spam
        if (status === 'CHANNEL_ERROR') {
          console.error("[DurableSync] CHANNEL_ERROR detected:", {
            roomPda: roomPda.slice(0, 8),
            error: error?.message || "unknown",
            timestamp: new Date().toISOString(),
            retryCount: channelErrorRetryCountRef.current,
          });
          dbg("durable.channel_error", { 
            roomPda: roomPda.slice(0, 8), 
            error: error?.message,
            retryCount: channelErrorRetryCountRef.current,
          });
          
          // Throttle: Only retry with exponential backoff (5s, 10s, 20s, max 30s)
          const now = Date.now();
          const timeSinceLastRetry = now - lastChannelErrorRetryRef.current;
          const minRetryInterval = Math.min(
            5000 * Math.pow(2, channelErrorRetryCountRef.current), 
            30000
          );
          
          if (timeSinceLastRetry > minRetryInterval) {
            lastChannelErrorRetryRef.current = now;
            channelErrorRetryCountRef.current += 1;
            
            toast("Reconnecting...", {
              description: `Lost connection, retrying (attempt ${channelErrorRetryCountRef.current})`,
              duration: 2000,
            });
            
            loadMoves().then(() => {
              // Reset retry count on successful load
              channelErrorRetryCountRef.current = 0;
            });
          } else {
            console.log("[DurableSync] Throttling CHANNEL_ERROR retry:", {
              timeSinceLastRetry,
              minRetryInterval,
              nextRetryIn: minRetryInterval - timeSinceLastRetry,
            });
          }
        }
      });

    return () => {
      dbg("durable.unsubscribe", { room: roomPda.slice(0, 8) });
      supabase.removeChannel(channel);
    };
  }, [enabled, roomPda]);

  // Initial load
  useEffect(() => {
    if (enabled && roomPda && !loadedRef.current) {
      loadedRef.current = true;
      loadMoves().finally(() => setIsLoading(false));
    }
  }, [enabled, roomPda, loadMoves]);

  // Reset when room changes (guarded against transient disconnects)
  useEffect(() => {
    // Critical: avoid clearing state during transient disconnects
    if (!roomPda) return;

    // Only reset if roomPda actually changed
    if (prevRoomPdaRef.current === roomPda) return;
    prevRoomPdaRef.current = roomPda;

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
