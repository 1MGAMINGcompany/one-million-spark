
-- 1. Update CHECK constraint to allow 'free'
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_mode_check;
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_mode_check
  CHECK (mode = ANY (ARRAY['casual', 'ranked', 'private', 'free']));

-- 2. Update upsert_game_session to allow 'free' mode
CREATE OR REPLACE FUNCTION public.upsert_game_session(p_room_pda text, p_game_type text, p_game_state jsonb, p_current_turn_wallet text, p_player1_wallet text, p_player2_wallet text, p_status text DEFAULT 'active'::text, p_mode text DEFAULT 'casual'::text, p_caller_wallet text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_record RECORD;
BEGIN
  IF p_room_pda IS NULL OR length(p_room_pda) < 10 THEN
    RAISE EXCEPTION 'Invalid room_pda';
  END IF;
  IF p_player1_wallet IS NULL OR length(p_player1_wallet) < 10 THEN
    RAISE EXCEPTION 'Invalid player1_wallet';
  END IF;
  IF p_game_type IS NULL OR length(p_game_type) < 1 THEN
    RAISE EXCEPTION 'Invalid game_type';
  END IF;
  IF p_status NOT IN ('active', 'finished') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  IF p_mode NOT IN ('casual', 'ranked', 'private', 'free') THEN
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  SELECT * INTO v_existing_record 
  FROM game_sessions 
  WHERE room_pda = p_room_pda;
  
  IF FOUND THEN
    IF p_caller_wallet IS NOT NULL THEN
      IF p_caller_wallet != v_existing_record.player1_wallet 
         AND p_caller_wallet != v_existing_record.player2_wallet THEN
        RAISE EXCEPTION 'Caller is not a participant in this game';
      END IF;
    END IF;
    
    UPDATE game_sessions
    SET game_state = p_game_state,
        player2_wallet = COALESCE(p_player2_wallet, player2_wallet),
        status = CASE 
          WHEN v_existing_record.mode = 'ranked' THEN v_existing_record.status
          ELSE p_status
        END,
        updated_at = now()
    WHERE room_pda = p_room_pda;
  ELSE
    IF p_caller_wallet IS NOT NULL AND p_caller_wallet != p_player1_wallet THEN
      RAISE EXCEPTION 'Only the room creator can create the game session';
    END IF;
    
    INSERT INTO game_sessions (
      room_pda, game_type, game_state, current_turn_wallet,
      player1_wallet, player2_wallet, status, mode
    ) VALUES (
      p_room_pda, p_game_type, p_game_state, p_current_turn_wallet,
      p_player1_wallet, p_player2_wallet, p_status, p_mode
    );
  END IF;
END;
$function$;

-- 3. Update ensure_game_session (5-param overload) to allow 'free' mode
CREATE OR REPLACE FUNCTION public.ensure_game_session(p_room_pda text, p_game_type text, p_player1_wallet text, p_player2_wallet text, p_mode text DEFAULT 'casual'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_status text;
BEGIN
  IF p_room_pda IS NULL OR length(p_room_pda) < 10 THEN
    RAISE EXCEPTION 'Invalid room_pda';
  END IF;
  IF p_player1_wallet IS NULL OR length(p_player1_wallet) < 10 THEN
    RAISE EXCEPTION 'Invalid player1_wallet';
  END IF;
  IF p_player2_wallet IS NOT NULL AND length(p_player2_wallet) < 10 THEN
    RAISE EXCEPTION 'Invalid player2_wallet';
  END IF;
  IF p_mode NOT IN ('casual', 'ranked', 'private', 'free') THEN
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  SELECT status INTO existing_status
  FROM game_sessions
  WHERE room_pda = p_room_pda;

  IF existing_status = 'finished' THEN
    UPDATE game_sessions SET
      game_type = p_game_type,
      game_state = '{}'::jsonb,
      player1_wallet = p_player1_wallet,
      player2_wallet = p_player2_wallet,
      mode = p_mode,
      start_roll_finalized = false,
      starting_player_wallet = NULL,
      start_roll = NULL,
      start_roll_seed = NULL,
      current_turn_wallet = NULL,
      p1_ready = false,
      p2_ready = false,
      status = 'waiting',
      status_int = 1,
      game_over_at = NULL,
      winner_wallet = NULL,
      missed_turns = '{}'::jsonb,
      eliminated_players = '{}'::text[],
      waiting_started_at = NULL,
      turn_started_at = NULL,
      p1_acceptance_tx = NULL,
      p2_acceptance_tx = NULL,
      participants = ARRAY[p_player1_wallet],
      updated_at = now()
    WHERE room_pda = p_room_pda;
  ELSE
    INSERT INTO game_sessions (
      room_pda, game_type, game_state,
      player1_wallet, player2_wallet,
      status, mode
    ) VALUES (
      p_room_pda, p_game_type, '{}'::jsonb,
      p_player1_wallet, p_player2_wallet,
      'waiting', p_mode
    )
    ON CONFLICT (room_pda) DO UPDATE SET
      player2_wallet = COALESCE(EXCLUDED.player2_wallet, game_sessions.player2_wallet),
      game_type = EXCLUDED.game_type,
      updated_at = now();
  END IF;
END;
$function$;

-- 4. Update ensure_game_session (7-param overload) to allow 'free' mode
CREATE OR REPLACE FUNCTION public.ensure_game_session(p_room_pda text, p_game_type text, p_player1_wallet text, p_player2_wallet text, p_mode text DEFAULT 'casual'::text, p_max_players integer DEFAULT 2, p_participants text[] DEFAULT '{}'::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_has_both_players boolean;
  v_final_participants text[];
BEGIN
  v_has_both_players := (
    p_player1_wallet IS NOT NULL
    AND p_player1_wallet != ''
    AND p_player1_wallet != '11111111111111111111111111111111'
    AND p_player2_wallet IS NOT NULL
    AND p_player2_wallet != ''
    AND p_player2_wallet != '11111111111111111111111111111111'
  );

  v_final_participants := CASE
    WHEN array_length(p_participants, 1) > 0 THEN p_participants
    WHEN v_has_both_players THEN ARRAY[p_player1_wallet, p_player2_wallet]
    ELSE ARRAY[p_player1_wallet]
  END;

  INSERT INTO game_sessions (
    room_pda, game_type, player1_wallet, player2_wallet,
    mode, max_players, participants, status, status_int,
    p1_ready, p2_ready, start_roll_finalized,
    current_turn_wallet, starting_player_wallet, turn_started_at
  )
  VALUES (
    p_room_pda, p_game_type, p_player1_wallet, p_player2_wallet,
    p_mode, p_max_players, v_final_participants,
    CASE WHEN v_has_both_players THEN 'active' ELSE 'waiting' END,
    CASE WHEN v_has_both_players THEN 2 ELSE 1 END,
    v_has_both_players, v_has_both_players, v_has_both_players,
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
    p1_ready = CASE
      WHEN game_sessions.status_int = 3 THEN false
      WHEN game_sessions.player2_wallet IS NULL AND EXCLUDED.player2_wallet IS NOT NULL THEN true
      ELSE game_sessions.p1_ready
    END,
    p2_ready = CASE
      WHEN game_sessions.status_int = 3 THEN false
      WHEN game_sessions.player2_wallet IS NULL AND EXCLUDED.player2_wallet IS NOT NULL THEN true
      ELSE game_sessions.p2_ready
    END,
    start_roll_finalized = CASE
      WHEN game_sessions.status_int = 3 THEN false
      WHEN game_sessions.player2_wallet IS NULL AND EXCLUDED.player2_wallet IS NOT NULL THEN true
      ELSE game_sessions.start_roll_finalized
    END,
    current_turn_wallet = CASE
      WHEN game_sessions.status_int = 3 THEN NULL
      WHEN game_sessions.current_turn_wallet IS NULL
           AND game_sessions.player2_wallet IS NULL
           AND EXCLUDED.player2_wallet IS NOT NULL
      THEN game_sessions.player1_wallet
      ELSE game_sessions.current_turn_wallet
    END,
    starting_player_wallet = CASE
      WHEN game_sessions.status_int = 3 THEN NULL
      WHEN game_sessions.starting_player_wallet IS NULL
           AND game_sessions.player2_wallet IS NULL
           AND EXCLUDED.player2_wallet IS NOT NULL
      THEN game_sessions.player1_wallet
      ELSE game_sessions.starting_player_wallet
    END,
    turn_started_at = CASE
      WHEN game_sessions.status_int = 3 THEN NULL
      WHEN game_sessions.turn_started_at IS NULL
           AND game_sessions.player2_wallet IS NULL
           AND EXCLUDED.player2_wallet IS NOT NULL
      THEN now()
      ELSE game_sessions.turn_started_at
    END,
    status = CASE
      WHEN game_sessions.status_int = 3 THEN 'waiting'
      WHEN game_sessions.status = 'waiting'
           AND game_sessions.player2_wallet IS NULL
           AND EXCLUDED.player2_wallet IS NOT NULL
      THEN 'active'
      ELSE game_sessions.status
    END,
    status_int = CASE
      WHEN game_sessions.status_int = 3 THEN 1
      WHEN game_sessions.status_int = 1
           AND game_sessions.player2_wallet IS NULL
           AND EXCLUDED.player2_wallet IS NOT NULL
      THEN 2
      ELSE game_sessions.status_int
    END,
    game_over_at = CASE
      WHEN game_sessions.status_int = 3 THEN NULL
      ELSE game_sessions.game_over_at
    END,
    winner_wallet = CASE
      WHEN game_sessions.status_int = 3 THEN NULL
      ELSE game_sessions.winner_wallet
    END,
    missed_turns = CASE
      WHEN game_sessions.status_int = 3 THEN '{}'::jsonb
      ELSE game_sessions.missed_turns
    END,
    eliminated_players = CASE
      WHEN game_sessions.status_int = 3 THEN '{}'::text[]
      ELSE game_sessions.eliminated_players
    END,
    p1_acceptance_tx = CASE
      WHEN game_sessions.status_int = 3 THEN NULL
      ELSE game_sessions.p1_acceptance_tx
    END,
    p2_acceptance_tx = CASE
      WHEN game_sessions.status_int = 3 THEN NULL
      ELSE game_sessions.p2_acceptance_tx
    END,
    waiting_started_at = CASE
      WHEN game_sessions.status_int = 3 THEN NULL
      ELSE game_sessions.waiting_started_at
    END,
    start_roll = CASE
      WHEN game_sessions.status_int = 3 THEN NULL
      ELSE game_sessions.start_roll
    END,
    start_roll_seed = CASE
      WHEN game_sessions.status_int = 3 THEN NULL
      ELSE game_sessions.start_roll_seed
    END,
    game_state = CASE
      WHEN game_sessions.status_int = 3 THEN '{}'::jsonb
      ELSE game_sessions.game_state
    END,
    updated_at = now();
END;
$function$;
