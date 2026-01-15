import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { archiveRoom } from '@/lib/roomArchive';

// NOTE: Room mode (casual/ranked) is now determined SOLELY from the database.
// STEP 7: Deprecated getRoomMode and getRoomModeData functions have been REMOVED.
// Use the useRoomMode hook for authoritative mode detection.

interface GameSessionData {
  room_pda: string;
  game_type: string;
  game_state: Record<string, any>;
  current_turn_wallet: string | null;
  player1_wallet: string;
  player2_wallet: string | null;
  status: 'active' | 'finished';
  mode: 'casual' | 'ranked';
}

interface UseGameSessionPersistenceOptions {
  roomPda: string | undefined;
  gameType: string;
  enabled: boolean;
  onStateRestored?: (state: Record<string, any>) => void;
  callerWallet?: string; // The wallet address of the current user for security validation
}

export function useGameSessionPersistence({
  roomPda,
  gameType,
  enabled,
  onStateRestored,
  callerWallet,
}: UseGameSessionPersistenceOptions) {
  const lastSavedRef = useRef<string>('');
  const isRestoringRef = useRef(false);
  const isSavingRef = useRef(false);

  // Load existing session on mount
  const loadSession = useCallback(async (): Promise<Record<string, any> | null> => {
    if (!roomPda || !enabled) return null;

    try {
      console.log('[GameSession] Loading session for room:', roomPda);
      
      // Use Edge Function instead of direct table access (RLS locked)
      const { data: resp, error } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });

      if (error) {
        console.error('[GameSession] Error loading session:', error);
        return null;
      }

      const session = resp?.session;
      if (session && session.status === 'active' && session.game_state && Object.keys(session.game_state).length > 0) {
        console.log('[GameSession] Found existing session:', session);
        return session.game_state as Record<string, any>;
      }

      console.log('[GameSession] No existing session found');
      return null;
    } catch (err) {
      console.error('[GameSession] Failed to load session:', err);
      return null;
    }
  }, [roomPda, enabled]);

  // Save session state using secure RPC function
  const saveSession = useCallback(async (
    gameState: Record<string, any>,
    currentTurnWallet: string | null,
    player1Wallet: string,
    player2Wallet: string | null,
    status: 'active' | 'finished' = 'active',
    mode: 'casual' | 'ranked' = 'casual'
  ) => {
    if (!roomPda || !enabled) return;

    // Avoid saving the same state twice
    const stateHash = JSON.stringify(gameState);
    if (stateHash === lastSavedRef.current) {
      return;
    }

    // Set saving flag BEFORE async operation to prevent realtime race condition
    isSavingRef.current = true;

    try {
      console.log('[GameSession] Saving session state via secure RPC...');
      
      // Use the secure RPC function instead of direct upsert
      const { error } = await supabase.rpc('upsert_game_session', {
        p_room_pda: roomPda,
        p_game_type: gameType,
        p_game_state: gameState,
        p_current_turn_wallet: currentTurnWallet,
        p_player1_wallet: player1Wallet,
        p_player2_wallet: player2Wallet,
        p_status: status,
        p_mode: mode,
        p_caller_wallet: callerWallet || null,
      });

      if (error) {
        console.error('[GameSession] Error saving session:', error);
        return;
      }

      lastSavedRef.current = stateHash;
      console.log('[GameSession] Session saved successfully');
    } catch (err) {
      console.error('[GameSession] Failed to save session:', err);
    } finally {
      // Clear saving flag after delay to ensure realtime event is ignored
      setTimeout(() => {
        isSavingRef.current = false;
      }, 500);
    }
  }, [roomPda, gameType, enabled, callerWallet]);

  // Mark session as finished using secure RPC function and archive the room
  const finishSession = useCallback(async () => {
    if (!roomPda || !enabled) return;

    try {
      console.log('[GameSession] Marking session as finished via secure RPC');
      
      // Use the secure RPC function instead of direct update
      const { error } = await supabase.rpc('finish_game_session', {
        p_room_pda: roomPda,
        p_caller_wallet: callerWallet || null,
      });

      if (error) {
        console.error('[GameSession] Error finishing session:', error);
      }
      
      // Archive the room so it won't show in active room banner
      archiveRoom(roomPda);
      console.log('[GameSession] Room archived:', roomPda);
    } catch (err) {
      console.error('[GameSession] Failed to finish session:', err);
    }
  }, [roomPda, enabled, callerWallet]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!roomPda || !enabled) return;

    console.log('[GameSession] Setting up realtime subscription');
    
    const channel = supabase
      .channel(`game-session-${roomPda}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `room_pda=eq.${roomPda}`,
        },
        (payload) => {
          // Skip if we're currently saving (our own update coming back)
          if (isSavingRef.current) {
            console.log('[GameSession] Ignoring update while saving (preventing flicker)');
            return;
          }
          
          // Skip if already restoring
          if (isRestoringRef.current) {
            return;
          }
          
          const newState = payload.new as GameSessionData;
          const stateHash = JSON.stringify(newState.game_state);
          
          // Only restore if it's different from what we last saved
          if (stateHash !== lastSavedRef.current) {
            console.log('[GameSession] Received state update from peer');
            isRestoringRef.current = true;
            onStateRestored?.(newState.game_state);
            lastSavedRef.current = stateHash;
            setTimeout(() => {
              isRestoringRef.current = false;
            }, 100);
          }
        }
      )
      .subscribe();

    return () => {
      console.log('[GameSession] Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [roomPda, enabled, onStateRestored]);

  return {
    loadSession,
    saveSession,
    finishSession,
    isRestoring: isRestoringRef.current,
  };
}
