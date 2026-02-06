-- Update ensure_game_session to set ready flags and current_turn_wallet when both players are present
CREATE OR REPLACE FUNCTION public.ensure_game_session(
  p_room_pda text,
  p_game_type text,
  p_player1_wallet text,
  p_player2_wallet text,
  p_mode text DEFAULT 'casual',
  p_max_players integer DEFAULT 2,
  p_participants text[] DEFAULT '{}'::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_both_players boolean;
  v_final_participants text[];
BEGIN
  -- Check if both players are provided (real wallets, not placeholders)
  v_has_both_players := (
    p_player1_wallet IS NOT NULL 
    AND p_player1_wallet != '' 
    AND p_player1_wallet != '11111111111111111111111111111111'
    AND p_player2_wallet IS NOT NULL 
    AND p_player2_wallet != '' 
    AND p_player2_wallet != '11111111111111111111111111111111'
  );

  -- Build participants array
  v_final_participants := CASE 
    WHEN array_length(p_participants, 1) > 0 THEN p_participants
    WHEN v_has_both_players THEN ARRAY[p_player1_wallet, p_player2_wallet]
    ELSE ARRAY[p_player1_wallet]
  END;

  INSERT INTO game_sessions (
    room_pda,
    game_type,
    player1_wallet,
    player2_wallet,
    mode,
    max_players,
    participants,
    status,
    status_int,
    -- FAST START: Set ready flags and current_turn_wallet immediately when both players join
    p1_ready,
    p2_ready,
    start_roll_finalized,
    current_turn_wallet,
    starting_player_wallet,
    turn_started_at
  )
  VALUES (
    p_room_pda,
    p_game_type,
    p_player1_wallet,
    p_player2_wallet,
    p_mode,
    p_max_players,
    v_final_participants,
    CASE WHEN v_has_both_players THEN 'active' ELSE 'waiting' END,
    CASE WHEN v_has_both_players THEN 2 ELSE 1 END,
    -- Set flags based on whether both players are present
    v_has_both_players,
    v_has_both_players,
    v_has_both_players,
    CASE WHEN v_has_both_players THEN p_player1_wallet ELSE NULL END,
    CASE WHEN v_has_both_players THEN p_player1_wallet ELSE NULL END,
    CASE WHEN v_has_both_players THEN now() ELSE NULL END
  )
  ON CONFLICT (room_pda) DO UPDATE SET
    player2_wallet = COALESCE(EXCLUDED.player2_wallet, game_sessions.player2_wallet),
    participants = rebuild_participants(
      game_sessions.participants,
      game_sessions.max_players,
      COALESCE(EXCLUDED.player1_wallet, game_sessions.player1_wallet),
      COALESCE(EXCLUDED.player2_wallet, game_sessions.player2_wallet)
    ),
    -- Update flags when second player joins
    p1_ready = CASE 
      WHEN game_sessions.player2_wallet IS NULL AND EXCLUDED.player2_wallet IS NOT NULL THEN true
      ELSE game_sessions.p1_ready
    END,
    p2_ready = CASE 
      WHEN game_sessions.player2_wallet IS NULL AND EXCLUDED.player2_wallet IS NOT NULL THEN true
      ELSE game_sessions.p2_ready
    END,
    start_roll_finalized = CASE 
      WHEN game_sessions.player2_wallet IS NULL AND EXCLUDED.player2_wallet IS NOT NULL THEN true
      ELSE game_sessions.start_roll_finalized
    END,
    current_turn_wallet = CASE 
      WHEN game_sessions.current_turn_wallet IS NULL 
           AND game_sessions.player2_wallet IS NULL 
           AND EXCLUDED.player2_wallet IS NOT NULL 
      THEN game_sessions.player1_wallet
      ELSE game_sessions.current_turn_wallet
    END,
    starting_player_wallet = CASE 
      WHEN game_sessions.starting_player_wallet IS NULL 
           AND game_sessions.player2_wallet IS NULL 
           AND EXCLUDED.player2_wallet IS NOT NULL 
      THEN game_sessions.player1_wallet
      ELSE game_sessions.starting_player_wallet
    END,
    turn_started_at = CASE 
      WHEN game_sessions.turn_started_at IS NULL 
           AND game_sessions.player2_wallet IS NULL 
           AND EXCLUDED.player2_wallet IS NOT NULL 
      THEN now()
      ELSE game_sessions.turn_started_at
    END,
    status = CASE 
      WHEN game_sessions.status = 'waiting' 
           AND game_sessions.player2_wallet IS NULL 
           AND EXCLUDED.player2_wallet IS NOT NULL 
      THEN 'active'
      ELSE game_sessions.status
    END,
    status_int = CASE 
      WHEN game_sessions.status_int = 1 
           AND game_sessions.player2_wallet IS NULL 
           AND EXCLUDED.player2_wallet IS NOT NULL 
      THEN 2
      ELSE game_sessions.status_int
    END,
    updated_at = now();
END;
$$;