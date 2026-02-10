
-- Fix inverted grace period in maybe_apply_turn_timeout and submit_game_move
-- Change: NOW() < v_deadline - INTERVAL '2 seconds' --> NOW() < v_deadline
-- This was firing timeouts 2 seconds EARLY instead of giving grace

CREATE OR REPLACE FUNCTION public.maybe_apply_turn_timeout(p_room_pda TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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

  IF NOT (v_session.p1_ready AND v_session.p2_ready) THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'not_active');
  END IF;

  IF v_session.current_turn_wallet IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_turn_holder');
  END IF;

  IF v_session.turn_started_at IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_turn_start_time');
  END IF;

  -- Calculate deadline (no grace -- exact expiry)
  v_deadline := v_session.turn_started_at + 
                (v_session.turn_time_seconds || ' seconds')::INTERVAL;

  -- FIX: was "NOW() < v_deadline - INTERVAL '2 seconds'" which fired 2s early
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
          missed_turns = jsonb_set(
            COALESCE(missed_turns, '{}'::jsonb),
            ARRAY[v_timed_out_wallet],
            to_jsonb(v_new_strikes)
          ),
          updated_at = NOW()
      WHERE room_pda = p_room_pda;

      RETURN jsonb_build_object(
        'applied', true,
        'type', 'auto_forfeit',
        'timedOutWallet', v_timed_out_wallet,
        'winnerWallet', v_winner_wallet,
        'nextTurnWallet', v_next_wallet,
        'strikes', v_new_strikes
      );
      
    ELSE
      UPDATE game_sessions
      SET eliminated_players = array_append(
            COALESCE(eliminated_players, ARRAY[]::TEXT[]), 
            v_timed_out_wallet
          ),
          missed_turns = jsonb_set(
            COALESCE(missed_turns, '{}'::jsonb),
            ARRAY[v_timed_out_wallet],
            to_jsonb(v_new_strikes)
          ),
          updated_at = NOW()
      WHERE room_pda = p_room_pda;
      
      SELECT ARRAY_AGG(p) INTO v_active_players
      FROM unnest(v_participants) AS p
      WHERE p IS NOT NULL 
        AND p != '' 
        AND p != '11111111111111111111111111111111'
        AND p != v_timed_out_wallet
        AND NOT (p = ANY(v_eliminated));
      
      v_player_count := COALESCE(array_length(v_active_players, 1), 0);
      
      IF v_player_count <= 1 THEN
        v_winner_wallet := v_active_players[1];
        
        v_move_hash := encode(sha256((v_prev_hash || 
          jsonb_build_object(
            'type', 'auto_forfeit',
            'timedOutWallet', v_timed_out_wallet,
            'eliminatedWallet', v_timed_out_wallet,
            'winnerWallet', v_winner_wallet,
            'missedCount', v_new_strikes,
            'reason', 'last_player_standing'
          )::text)::bytea), 'hex');

        INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, prev_hash, move_hash)
        VALUES (
          p_room_pda,
          v_timed_out_wallet,
          v_turn_number,
          jsonb_build_object(
            'type', 'auto_forfeit',
            'timedOutWallet', v_timed_out_wallet,
            'eliminatedWallet', v_timed_out_wallet,
            'winnerWallet', v_winner_wallet,
            'missedCount', v_new_strikes,
            'reason', 'last_player_standing',
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
            current_turn_wallet = NULL,
            updated_at = NOW()
        WHERE room_pda = p_room_pda;

        RETURN jsonb_build_object(
          'applied', true,
          'type', 'auto_forfeit',
          'timedOutWallet', v_timed_out_wallet,
          'eliminatedWallet', v_timed_out_wallet,
          'winnerWallet', v_winner_wallet,
          'strikes', v_new_strikes,
          'reason', 'last_player_standing'
        );
      ELSE
        v_next_wallet := v_active_players[1];
        
        v_move_hash := encode(sha256((v_prev_hash || 
          jsonb_build_object(
            'type', 'player_eliminated',
            'timedOutWallet', v_timed_out_wallet,
            'eliminatedWallet', v_timed_out_wallet,
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
            'type', 'player_eliminated',
            'timedOutWallet', v_timed_out_wallet,
            'eliminatedWallet', v_timed_out_wallet,
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
        SET current_turn_wallet = v_next_wallet,
            turn_started_at = NOW(),
            updated_at = NOW()
        WHERE room_pda = p_room_pda;

        RETURN jsonb_build_object(
          'applied', true,
          'type', 'player_eliminated',
          'timedOutWallet', v_timed_out_wallet,
          'eliminatedWallet', v_timed_out_wallet,
          'nextTurnWallet', v_next_wallet,
          'strikes', v_new_strikes,
          'remainingPlayers', v_player_count
        );
      END IF;
    END IF;
  END IF;

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
      missed_turns = jsonb_set(
        COALESCE(missed_turns, '{}'::jsonb),
        ARRAY[v_timed_out_wallet],
        to_jsonb(v_new_strikes)
      ),
      updated_at = NOW()
  WHERE room_pda = p_room_pda;

  RETURN jsonb_build_object(
    'applied', true,
    'type', 'turn_timeout',
    'timedOutWallet', v_timed_out_wallet,
    'nextTurnWallet', v_next_wallet,
    'strikes', v_new_strikes
  );
END;
$$;

-- Also fix the same bug in submit_game_move's turn_timeout validation
-- Line 480: NOW() < v_turn_deadline - INTERVAL '2 seconds' --> NOW() < v_turn_deadline
CREATE OR REPLACE FUNCTION public.submit_game_move(p_room_pda text, p_wallet text, p_move_data jsonb, p_client_move_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_session RECORD;
  v_last_move RECORD;
  v_move_type TEXT;
  v_next_turn_wallet TEXT;
  v_turn_number INTEGER;
  v_prev_hash TEXT;
  v_move_hash TEXT;
  v_timeout_wallet TEXT;
  v_turn_deadline TIMESTAMPTZ;
  v_timed_out_wallet TEXT;
  v_winner_wallet TEXT;
  v_game_over_reason TEXT;
BEGIN
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  IF v_session.status_int = 3 OR v_session.game_over_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'game_already_finished');
  END IF;

  IF NOT (v_session.p1_ready AND v_session.p2_ready) THEN
    RETURN jsonb_build_object('success', false, 'error', 'players_not_ready');
  END IF;

  v_move_type := p_move_data->>'type';

  SELECT * INTO v_last_move
  FROM game_moves
  WHERE room_pda = p_room_pda
  ORDER BY turn_number DESC
  LIMIT 1;

  IF v_last_move IS NOT NULL 
     AND (v_last_move.move_data->>'type') = 'turn_end'
     AND v_move_type IN ('dice_roll', 'move')
     AND v_last_move.wallet = p_wallet
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'turn_already_ended');
  END IF;

  IF p_client_move_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM game_moves
      WHERE room_pda = p_room_pda AND client_move_id = p_client_move_id
    ) THEN
      RETURN jsonb_build_object('success', true, 'idempotent', true);
    END IF;
  END IF;

  IF v_move_type NOT IN ('turn_timeout', 'auto_forfeit') THEN
    IF v_session.current_turn_wallet IS NOT NULL AND v_session.current_turn_wallet != p_wallet THEN
      RETURN jsonb_build_object('success', false, 'error', 'not_your_turn');
    END IF;
  END IF;

  IF v_move_type = 'turn_timeout' THEN
    v_timeout_wallet := p_move_data->>'timedOutWallet';
    
    IF v_timeout_wallet = p_wallet THEN
      RETURN jsonb_build_object('success', false, 'error', 'cannot_timeout_self');
    END IF;
    
    IF v_session.current_turn_wallet != v_timeout_wallet THEN
      RETURN jsonb_build_object('success', false, 'error', 'wrong_timeout_target');
    END IF;
    
    -- FIX: was "NOW() < v_turn_deadline - INTERVAL '2 seconds'" which fired 2s early
    v_turn_deadline := v_session.turn_started_at + (v_session.turn_time_seconds || ' seconds')::INTERVAL;
    IF NOW() < v_turn_deadline THEN
      RETURN jsonb_build_object('success', false, 'error', 'timeout_too_early');
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM game_moves
      WHERE room_pda = p_room_pda
        AND (move_data->>'type') = 'turn_timeout'
        AND wallet = v_timeout_wallet
        AND turn_number >= v_session.status_int
      ORDER BY turn_number DESC
      LIMIT 1
    ) THEN
      RETURN jsonb_build_object('success', true, 'dedupe', true, 'reason', 'timeout_already_recorded');
    END IF;
  END IF;

  SELECT COALESCE(MAX(turn_number), 0) + 1, COALESCE(MAX(move_hash), 'genesis')
  INTO v_turn_number, v_prev_hash
  FROM game_moves
  WHERE room_pda = p_room_pda;

  v_move_hash := encode(sha256((v_prev_hash || p_move_data::text)::bytea), 'hex');

  INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, prev_hash, move_hash, client_move_id)
  VALUES (p_room_pda, p_wallet, v_turn_number, p_move_data, v_prev_hash, v_move_hash, p_client_move_id);

  v_next_turn_wallet := v_session.current_turn_wallet;

  IF v_move_type IN ('turn_timeout', 'auto_forfeit') THEN
    v_next_turn_wallet := p_move_data->>'nextTurnWallet';
    
    UPDATE game_sessions
    SET current_turn_wallet = v_next_turn_wallet,
        turn_started_at = NOW(),
        updated_at = NOW()
    WHERE room_pda = p_room_pda;

  ELSIF v_move_type = 'turn_end' THEN
    IF v_session.player1_wallet = p_wallet THEN
      v_next_turn_wallet := v_session.player2_wallet;
    ELSE
      v_next_turn_wallet := v_session.player1_wallet;
    END IF;

    UPDATE game_sessions
    SET current_turn_wallet = v_next_turn_wallet,
        turn_started_at = NOW(),
        updated_at = NOW()
    WHERE room_pda = p_room_pda;

  ELSIF v_session.game_type IN ('1', '4', '2') THEN
    IF v_session.player1_wallet = p_wallet THEN
      v_next_turn_wallet := v_session.player2_wallet;
    ELSE
      v_next_turn_wallet := v_session.player1_wallet;
    END IF;

    UPDATE game_sessions
    SET current_turn_wallet = v_next_turn_wallet,
        turn_started_at = NOW(),
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
  END IF;

  -- Reset strikes on successful player action
  IF v_move_type NOT IN ('turn_timeout', 'auto_forfeit', 'player_eliminated') THEN
    UPDATE game_sessions
    SET missed_turns = CASE
          WHEN missed_turns IS NOT NULL AND missed_turns ? p_wallet
          THEN missed_turns - p_wallet
          ELSE missed_turns
        END
    WHERE room_pda = p_room_pda;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'turnNumber', v_turn_number,
    'moveHash', v_move_hash,
    'nextTurnWallet', v_next_turn_wallet
  );
END;
$$;
