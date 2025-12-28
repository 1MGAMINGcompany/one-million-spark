import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GameSessionData {
  room_pda: string;
  game_type: string;
  game_state: Record<string, any>;
  current_turn_wallet: string | null;
  player1_wallet: string;
  player2_wallet: string | null;
  status: 'active' | 'finished';
}

interface UseGameSessionPersistenceOptions {
  roomPda: string | undefined;
  gameType: string;
  enabled: boolean;
  onStateRestored?: (state: Record<string, any>) => void;
}

export function useGameSessionPersistence({
  roomPda,
  gameType,
  enabled,
  onStateRestored,
}: UseGameSessionPersistenceOptions) {
  const lastSavedRef = useRef<string>('');
  const isRestoringRef = useRef(false);

  // Load existing session on mount
  const loadSession = useCallback(async (): Promise<Record<string, any> | null> => {
    if (!roomPda || !enabled) return null;

    try {
      console.log('[GameSession] Loading session for room:', roomPda);
      
      const { data, error } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('room_pda', roomPda)
        .eq('status', 'active')
        .maybeSingle();

      if (error) {
        console.error('[GameSession] Error loading session:', error);
        return null;
      }

      if (data && data.game_state && Object.keys(data.game_state).length > 0) {
        console.log('[GameSession] Found existing session:', data);
        return data.game_state as Record<string, any>;
      }

      console.log('[GameSession] No existing session found');
      return null;
    } catch (err) {
      console.error('[GameSession] Failed to load session:', err);
      return null;
    }
  }, [roomPda, enabled]);

  // Save session state
  const saveSession = useCallback(async (
    gameState: Record<string, any>,
    currentTurnWallet: string | null,
    player1Wallet: string,
    player2Wallet: string | null,
    status: 'active' | 'finished' = 'active'
  ) => {
    if (!roomPda || !enabled) return;

    // Avoid saving the same state twice
    const stateHash = JSON.stringify(gameState);
    if (stateHash === lastSavedRef.current) {
      return;
    }

    try {
      console.log('[GameSession] Saving session state...');
      
      const sessionData: GameSessionData = {
        room_pda: roomPda,
        game_type: gameType,
        game_state: gameState,
        current_turn_wallet: currentTurnWallet,
        player1_wallet: player1Wallet,
        player2_wallet: player2Wallet,
        status,
      };

      const { error } = await supabase
        .from('game_sessions')
        .upsert(sessionData, { onConflict: 'room_pda' });

      if (error) {
        console.error('[GameSession] Error saving session:', error);
        return;
      }

      lastSavedRef.current = stateHash;
      console.log('[GameSession] Session saved successfully');
    } catch (err) {
      console.error('[GameSession] Failed to save session:', err);
    }
  }, [roomPda, gameType, enabled]);

  // Mark session as finished
  const finishSession = useCallback(async () => {
    if (!roomPda || !enabled) return;

    try {
      console.log('[GameSession] Marking session as finished');
      
      const { error } = await supabase
        .from('game_sessions')
        .update({ status: 'finished' })
        .eq('room_pda', roomPda);

      if (error) {
        console.error('[GameSession] Error finishing session:', error);
      }
    } catch (err) {
      console.error('[GameSession] Failed to finish session:', err);
    }
  }, [roomPda, enabled]);

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
          // Only restore if we're not the one who saved it
          const newState = payload.new as GameSessionData;
          const stateHash = JSON.stringify(newState.game_state);
          
          if (stateHash !== lastSavedRef.current && !isRestoringRef.current) {
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
