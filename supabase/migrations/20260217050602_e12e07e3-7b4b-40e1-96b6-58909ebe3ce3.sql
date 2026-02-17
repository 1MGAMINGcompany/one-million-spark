
-- ============================================================
-- FIX: game_already_finished after room replay
-- 1. ensure_game_session (5-param) – clear finished-state fields
-- 2. ensure_game_session (7-param) – clear finished-state fields on ON CONFLICT
-- 3. maybe_apply_turn_timeout – add game_over_at guard
-- 4. One-time backfill safety net
-- ============================================================

-- 1. Replace ensure_game_session (5-param overload)
CREATE OR REPLACE FUNCTION public.ensure_game_session(
  p_room_pda text,
  p_game_type text,
  p_player1_wallet text,
  p_player2_wallet text,
  p_mode text DEFAULT 'casual'::text
)
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
  IF p_mode NOT IN ('casual', 'ranked', 'private') THEN
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

-- 2. Replace ensure_game_session (7-param overload)
CREATE OR REPLACE FUNCTION public.ensure_game_session(
  p_room_pda text,
  p_game_type text,
  p_player1_wallet text,
  p_player2_wallet text,
  p_mode text DEFAULT 'casual'::text,
  p_max_players integer DEFAULT 2,
  p_participants text[] DEFAULT '{}'::text[]
)
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
    -- FIX: Clear finished-state fields when recycling a finished room
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

-- 3. Replace maybe_apply_turn_timeout with game_over_at guard
CREATE OR REPLACE FUNCTION public.maybe_apply_turn_timeout(p_room_pda text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD;
  v_deadline TIMESTAMPTZ;
  v_timed_out_wallet TEXT;
  v_next_wallet TEXT;
  v_current_strikes INTEGER;
  v_new_strikes INTEGER;
  v_winner_wallet TEXT;
  v_turn_number INTEGER;
  v_prev_hash TEXT;
  v_move_hash TEXT;
  v_participants TEXT[];
  v_eliminated TEXT[];
  v_active_players TEXT[];
  v_player_count INTEGER;
  v_next_idx INTEGER;
  v_current_idx INTEGER;
  v_last_move_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'session_not_found');
  END IF;

  IF v_session.status_int >= 3 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'game_finished');
  END IF;

  -- FIX: Guard against stale game_over_at from recycled rooms
  IF v_session.game_over_at IS NOT NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'game_over_at_set');
  END IF;

  IF v_session.status_int <> 2 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'not_active');
  END IF;

  IF v_session.current_turn_wallet IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_turn_holder');
  END IF;

  IF v_session.turn_started_at IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_turn_start_time');
  END IF;

  SELECT MAX(created_at) INTO v_last_move_at
  FROM game_moves
  WHERE room_pda = p_room_pda;

  IF v_last_move_at IS NOT NULL AND (NOW() - v_last_move_at) < INTERVAL '2 seconds' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'recent_move_guard');
  END IF;

  v_deadline := v_session.turn_started_at +
                (v_session.turn_time_seconds || ' seconds')::INTERVAL;

  IF NOW() < v_deadline THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'not_expired',
      'remaining_seconds', EXTRACT(EPOCH FROM (v_deadline - NOW()))::INTEGER
    );
  END IF;

  v_timed_out_wallet := v_session.current_turn_wallet;

  v_participants := COALESCE(v_session.participants, ARRAY[v_session.player1_wallet, v_session.player2_wallet]);
  v_eliminated := COALESCE(v_session.eliminated_players, ARRAY[]::TEXT[]);

  SELECT ARRAY_AGG(p) INTO v_active_players
  FROM unnest(v_participants) AS p
  WHERE p IS NOT NULL
    AND p != ''
    AND p != '11111111111111111111111111111111'
    AND NOT (p = ANY(v_eliminated));

  v_player_count := COALESCE(array_length(v_active_players, 1), 0);

  v_current_idx := NULL;
  FOR i IN 1..v_player_count LOOP
    IF v_active_players[i] = v_timed_out_wallet THEN
      v_current_idx := i;
      EXIT;
    END IF;
  END LOOP;

  IF v_player_count <= 1 THEN
    v_next_wallet := NULL;
  ELSIF v_current_idx IS NULL THEN
    v_next_wallet := v_active_players[1];
  ELSE
    v_next_idx := (v_current_idx % v_player_count) + 1;
    v_next_wallet := v_active_players[v_next_idx];
  END IF;

  IF v_next_wallet IS NULL AND v_session.max_players <= 2 THEN
    IF v_timed_out_wallet = v_session.player1_wallet THEN
      v_next_wallet := v_session.player2_wallet;
    ELSE
      v_next_wallet := v_session.player1_wallet;
    END IF;
  END IF;

  v_current_strikes := COALESCE(
    (v_session.missed_turns->>v_timed_out_wallet)::INTEGER,
    0
  );
  v_new_strikes := v_current_strikes + 1;

  SELECT COALESCE(MAX(turn_number), 0) + 1, COALESCE(MAX(move_hash), 'genesis')
  INTO v_turn_number, v_prev_hash
  FROM game_moves
  WHERE room_pda = p_room_pda;

  IF v_new_strikes >= 3 THEN
    IF v_session.max_players <= 2 THEN
      v_winner_wallet := v_next_wallet;

      v_move_hash := encode(sha256((v_prev_hash ||
        jsonb_build_object(
          'type', 'auto_forfeit',
          'timedOutWallet', v_timed_out_wallet,
          'winnerWallet', v_winner_wallet,
          'nextTurnWallet', v_next_wallet,
          'missedCount', v_new_strikes,
          'reason', 'three_consecutive_timeouts'
        )::text)::bytea), 'hex');

      INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, prev_hash, move_hash)
      VALUES (
        p_room_pda,
        v_timed_out_wallet,
        v_turn_number,
        jsonb_build_object(
          'type', 'auto_forfeit',
          'timedOutWallet', v_timed_out_wallet,
          'winnerWallet', v_winner_wallet,
          'nextTurnWallet', v_next_wallet,
          'missedCount', v_new_strikes,
          'reason', 'three_consecutive_timeouts',
          'dice', '[]'::jsonb,
          'remainingMoves', '[]'::jsonb
        ),
        v_prev_hash,
        v_move_hash
      );

      UPDATE game_sessions
      SET status = 'finished',
          status_int = 3,
          winner_wallet = v_winner_wallet,
          game_over_at = NOW(),
          missed_turns = COALESCE(missed_turns, '{}'::jsonb) ||
                         jsonb_build_object(v_timed_out_wallet, v_new_strikes),
          updated_at = NOW()
      WHERE room_pda = p_room_pda;

      RETURN jsonb_build_object(
        'applied', true,
        'action', 'auto_forfeit',
        'timedOutWallet', v_timed_out_wallet,
        'winnerWallet', v_winner_wallet,
        'strikes', v_new_strikes
      );
    ELSE
      -- Ludo elimination path
      v_move_hash := encode(sha256((v_prev_hash ||
        jsonb_build_object(
          'type', 'auto_eliminate',
          'timedOutWallet', v_timed_out_wallet,
          'nextTurnWallet', v_next_wallet,
          'missedCount', v_new_strikes,
          'reason', 'three_consecutive_timeouts'
        )::text)::bytea), 'hex');

      INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, prev_hash, move_hash)
      VALUES (
        p_room_pda,
        v_timed_out_wallet,
        v_turn_number,
        jsonb_build_object(
          'type', 'auto_eliminate',
          'timedOutWallet', v_timed_out_wallet,
          'nextTurnWallet', v_next_wallet,
          'missedCount', v_new_strikes,
          'reason', 'three_consecutive_timeouts'
        ),
        v_prev_hash,
        v_move_hash
      );

      UPDATE game_sessions
      SET eliminated_players = array_append(COALESCE(eliminated_players, ARRAY[]::TEXT[]), v_timed_out_wallet),
          current_turn_wallet = v_next_wallet,
          turn_started_at = NOW(),
          missed_turns = COALESCE(missed_turns, '{}'::jsonb) ||
                         jsonb_build_object(v_timed_out_wallet, v_new_strikes),
          updated_at = NOW()
      WHERE room_pda = p_room_pda;

      -- Check if only 1 active player remains after elimination
      SELECT ARRAY_AGG(p) INTO v_active_players
      FROM unnest(v_participants) AS p
      WHERE p IS NOT NULL
        AND p != ''
        AND p != '11111111111111111111111111111111'
        AND NOT (p = ANY(array_append(COALESCE(v_eliminated, ARRAY[]::TEXT[]), v_timed_out_wallet)));

      IF COALESCE(array_length(v_active_players, 1), 0) <= 1 THEN
        v_winner_wallet := v_active_players[1];

        UPDATE game_sessions
        SET status = 'finished',
            status_int = 3,
            winner_wallet = v_winner_wallet,
            game_over_at = NOW(),
            updated_at = NOW()
        WHERE room_pda = p_room_pda;

        RETURN jsonb_build_object(
          'applied', true,
          'action', 'auto_forfeit',
          'timedOutWallet', v_timed_out_wallet,
          'winnerWallet', v_winner_wallet,
          'strikes', v_new_strikes,
          'eliminated', true
        );
      END IF;

      RETURN jsonb_build_object(
        'applied', true,
        'action', 'auto_eliminate',
        'timedOutWallet', v_timed_out_wallet,
        'nextTurnWallet', v_next_wallet,
        'strikes', v_new_strikes
      );
    END IF;
  END IF;

  -- Single strike (not yet 3)
  v_move_hash := encode(sha256((v_prev_hash ||
    jsonb_build_object(
      'type', 'turn_timeout',
      'timedOutWallet', v_timed_out_wallet,
      'nextTurnWallet', v_next_wallet,
      'missedCount', v_new_strikes
    )::text)::bytea), 'hex');

  INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, prev_hash, move_hash)
  VALUES (
    p_room_pda,
    v_timed_out_wallet,
    v_turn_number,
    jsonb_build_object(
      'type', 'turn_timeout',
      'timedOutWallet', v_timed_out_wallet,
      'nextTurnWallet', v_next_wallet,
      'missedCount', v_new_strikes,
      'dice', '[]'::jsonb,
      'remainingMoves', '[]'::jsonb
    ),
    v_prev_hash,
    v_move_hash
  );

  UPDATE game_sessions
  SET current_turn_wallet = v_next_wallet,
      turn_started_at = NOW(),
      missed_turns = COALESCE(missed_turns, '{}'::jsonb) ||
                     jsonb_build_object(v_timed_out_wallet, v_new_strikes),
      updated_at = NOW()
  WHERE room_pda = p_room_pda;

  RETURN jsonb_build_object(
    'applied', true,
    'action', 'turn_timeout',
    'timedOutWallet', v_timed_out_wallet,
    'nextTurnWallet', v_next_wallet,
    'strikes', v_new_strikes
  );
END;
$function$;

-- 4. One-time backfill: clear stale game_over_at on non-finished sessions
UPDATE game_sessions
SET game_over_at = NULL,
    winner_wallet = NULL,
    missed_turns = '{}'::jsonb
WHERE status_int IN (1, 2)
  AND (game_over_at IS NOT NULL OR winner_wallet IS NOT NULL);
