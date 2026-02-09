
CREATE OR REPLACE FUNCTION public.submit_game_move(
  p_room_pda TEXT,
  p_wallet TEXT,
  p_move_data JSONB,
  p_client_move_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_move_type TEXT;
  v_last_move RECORD;
  v_turn_number INT;
  v_move_hash TEXT;
  v_prev_hash TEXT;
  v_missed JSONB;
  v_game_type TEXT;
  v_next_turn_wallet TEXT;
BEGIN
  -- 1. Lock the session row
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;

  -- Hard Game Ready Gate: reject if both players not ready
  IF v_session.p1_ready = false OR v_session.p2_ready = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'game_not_ready');
  END IF;

  -- 2. Extract move type
  v_move_type := p_move_data->>'type';
  v_game_type := v_session.game_type;

  -- 3. Turn ownership validation (only current_turn_wallet can move)
  IF v_session.mode = 'ranked' OR v_session.mode = 'private' THEN
    -- Allow turn_timeout from either player (it's a system action)
    IF v_move_type = 'turn_timeout' THEN
      -- Validate timeout: turn must actually be expired (with 2s grace)
      IF v_session.turn_started_at IS NOT NULL 
         AND v_session.turn_time_seconds IS NOT NULL
         AND (v_session.turn_started_at + (v_session.turn_time_seconds * INTERVAL '1 second') + INTERVAL '2 seconds') > NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'turn_not_expired');
      END IF;
      -- Deduplicate: reject if last move was already a timeout for this turn
      SELECT * INTO v_last_move FROM game_moves
        WHERE room_pda = p_room_pda ORDER BY turn_number DESC LIMIT 1;
      IF FOUND AND (v_last_move.move_data->>'type') = 'turn_timeout'
         AND v_last_move.wallet = v_session.current_turn_wallet THEN
        RETURN jsonb_build_object('success', false, 'error', 'timeout_already_applied');
      END IF;
      -- Override wallet to the timed-out player
      p_wallet := v_session.current_turn_wallet;
    ELSIF v_session.current_turn_wallet IS NOT NULL AND v_session.current_turn_wallet <> p_wallet THEN
      RETURN jsonb_build_object('success', false, 'error', 'not_your_turn');
    END IF;
  END IF;

  -- 4. Backgammon double-roll guard
  IF COALESCE(LOWER(v_game_type),'') = 'backgammon' OR v_game_type = '3' THEN
    IF v_move_type = 'dice_roll' THEN
      SELECT * INTO v_last_move FROM game_moves
        WHERE room_pda = p_room_pda ORDER BY turn_number DESC LIMIT 1;
      IF FOUND AND (v_last_move.move_data->>'type') = 'dice_roll'
         AND v_last_move.wallet = p_wallet THEN
        -- Check no turn_end between last dice_roll and now
        IF NOT EXISTS (
          SELECT 1 FROM game_moves
          WHERE room_pda = p_room_pda
            AND turn_number > v_last_move.turn_number
            AND (move_data->>'type') = 'turn_end'
            AND wallet <> p_wallet
        ) THEN
          RETURN jsonb_build_object('success', false, 'error', 'already_rolled');
        END IF;
      END IF;
    END IF;
  END IF;

  -- 5. Race condition guard: reject move after own turn_end
  SELECT * INTO v_last_move FROM game_moves
    WHERE room_pda = p_room_pda ORDER BY turn_number DESC LIMIT 1;
  IF FOUND AND (v_last_move.move_data->>'type') = 'turn_end'
     AND v_last_move.wallet = p_wallet
     AND v_move_type IN ('dice_roll', 'move', 'chess_move', 'checkers_move', 'dominos_move') THEN
    RETURN jsonb_build_object('success', false, 'error', 'turn_already_ended');
  END IF;

  -- 6. Idempotency check
  IF p_client_move_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM game_moves
      WHERE room_pda = p_room_pda AND client_move_id = p_client_move_id
    ) THEN
      RETURN jsonb_build_object('success', true, 'idempotent', true);
    END IF;
  END IF;

  -- 7. Assign turn number
  SELECT COALESCE(MAX(turn_number), 0) + 1 INTO v_turn_number
  FROM game_moves WHERE room_pda = p_room_pda;

  -- 8. Compute hashes
  v_move_hash := md5(p_move_data::text || v_turn_number::text);
  SELECT COALESCE(
    (SELECT move_hash FROM game_moves WHERE room_pda = p_room_pda ORDER BY turn_number DESC LIMIT 1),
    'genesis'
  ) INTO v_prev_hash;

  -- 9. Insert the move
  INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, move_hash, prev_hash, client_move_id)
  VALUES (p_room_pda, p_wallet, v_turn_number, p_move_data, v_move_hash, v_prev_hash, p_client_move_id);

  -- 10. Handle turn transitions based on move type and game type

  -- 10a. Explicit turn_end (all games) or turn_timeout / auto_forfeit
  IF v_move_type IN ('turn_end', 'turn_timeout', 'auto_forfeit') THEN
    -- Reset missed turns on explicit turn_end
    IF v_move_type = 'turn_end' THEN
      v_missed := COALESCE(v_session.missed_turns, '{}'::jsonb);
      v_missed := v_missed || jsonb_build_object(p_wallet, 0);
      UPDATE game_sessions SET missed_turns = v_missed, updated_at = NOW()
      WHERE room_pda = p_room_pda;
    END IF;

    -- Handle turn_timeout strike tracking
    IF v_move_type = 'turn_timeout' THEN
      v_missed := COALESCE(v_session.missed_turns, '{}'::jsonb);
      v_missed := v_missed || jsonb_build_object(
        p_wallet,
        COALESCE((v_missed->>p_wallet)::int, 0) + 1
      );
      UPDATE game_sessions SET missed_turns = v_missed, updated_at = NOW()
      WHERE room_pda = p_room_pda;

      -- Check 3-strike auto-forfeit for 2-player games
      IF v_session.max_players <= 2 AND COALESCE((v_missed->>p_wallet)::int, 0) >= 3 THEN
        -- Record auto_forfeit move
        INSERT INTO game_moves (room_pda, wallet, turn_number, move_data, move_hash, prev_hash)
        VALUES (p_room_pda, p_wallet, v_turn_number + 1,
                '{"type":"auto_forfeit"}'::jsonb,
                md5('auto_forfeit' || (v_turn_number + 1)::text),
                v_move_hash);

        -- Determine winner (the other player)
        IF v_session.player1_wallet = p_wallet THEN
          v_next_turn_wallet := v_session.player2_wallet;
        ELSE
          v_next_turn_wallet := v_session.player1_wallet;
        END IF;

        UPDATE game_sessions
        SET status = 'finished', status_int = 3,
            winner_wallet = v_next_turn_wallet,
            game_over_at = NOW(), updated_at = NOW()
        WHERE room_pda = p_room_pda;

        RETURN jsonb_build_object('success', true, 'turn_number', v_turn_number,
                                  'auto_forfeit', true, 'winner', v_next_turn_wallet);
      END IF;
    END IF;

    -- Flip turn to other player (2-player) or next in rotation
    IF v_session.max_players <= 2 THEN
      IF v_session.player1_wallet = p_wallet THEN
        v_next_turn_wallet := v_session.player2_wallet;
      ELSE
        v_next_turn_wallet := v_session.player1_wallet;
      END IF;
    ELSE
      -- Multi-player rotation (ludo etc): advance to next non-eliminated participant
      DECLARE
        v_participants TEXT[];
        v_idx INT;
        v_len INT;
        v_eliminated TEXT[];
      BEGIN
        v_participants := v_session.participants;
        v_eliminated := COALESCE(v_session.eliminated_players, ARRAY[]::TEXT[]);
        v_len := array_length(v_participants, 1);
        -- Find current index
        FOR i IN 1..v_len LOOP
          IF v_participants[i] = p_wallet THEN v_idx := i; END IF;
        END LOOP;
        -- Advance to next non-eliminated
        FOR step IN 1..v_len LOOP
          v_idx := ((v_idx) % v_len) + 1;
          IF NOT (v_participants[v_idx] = ANY(v_eliminated)) THEN
            v_next_turn_wallet := v_participants[v_idx];
            EXIT;
          END IF;
        END LOOP;
      END;
    END IF;

    UPDATE game_sessions
    SET current_turn_wallet = v_next_turn_wallet,
        turn_started_at = NOW(),
        updated_at = NOW()
    WHERE room_pda = p_room_pda;

  -- 10b. Auto-flip for chess/checkers/dominos on normal moves
  ELSIF (
    COALESCE(LOWER(v_game_type), '') IN ('chess', 'checkers', 'dominos')
    OR v_game_type IN ('1', '2', '4')
  )
  AND (v_move_type IS NULL OR v_move_type IN ('move', 'chess_move', 'checkers_move', 'dominos_move'))
  THEN
    -- Flip to the other player
    IF v_session.player1_wallet = p_wallet THEN
      v_next_turn_wallet := v_session.player2_wallet;
    ELSE
      v_next_turn_wallet := v_session.player1_wallet;
    END IF;

    -- Reset missed turns for the player who just moved
    v_missed := COALESCE(v_session.missed_turns, '{}'::jsonb);
    v_missed := v_missed || jsonb_build_object(p_wallet, 0);

    UPDATE game_sessions
    SET current_turn_wallet = v_next_turn_wallet,
        turn_started_at = NOW(),
        missed_turns = v_missed,
        updated_at = NOW()
    WHERE room_pda = p_room_pda;

  END IF;
  -- 10c. Backgammon normal moves & Ludo non-turn-end moves: no auto-flip (handled by explicit turn_end)

  RETURN jsonb_build_object('success', true, 'turn_number', v_turn_number);
END;
$$;
