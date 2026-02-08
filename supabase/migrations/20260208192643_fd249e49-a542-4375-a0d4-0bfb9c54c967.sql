-- Dead Room Auto-Resolution: Safe Version
-- Add waiting_started_at column and create maybe_apply_waiting_timeout RPC

-- 1. Add waiting_started_at column to game_sessions
ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS waiting_started_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN game_sessions.waiting_started_at IS
  'Timestamp when room entered WAITING with only 1 participant. Cleared when opponent joins.';

-- 2. Create maybe_apply_waiting_timeout RPC
CREATE OR REPLACE FUNCTION public.maybe_apply_waiting_timeout(p_room_pda TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_session RECORD;
  v_deadline TIMESTAMPTZ;
  v_participant_count INTEGER;
  v_waiting_timeout_seconds INTEGER := 120;
BEGIN
  -- Lock session for atomic update
  SELECT * INTO v_session
  FROM game_sessions
  WHERE room_pda = p_room_pda
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'session_not_found');
  END IF;

  -- Only apply to WAITING status (status_int = 1)
  IF v_session.status_int != 1 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'not_waiting');
  END IF;

  -- Count real participants (exclude placeholders)
  SELECT COUNT(*) INTO v_participant_count
  FROM unnest(COALESCE(v_session.participants, ARRAY[]::TEXT[])) AS p
  WHERE p IS NOT NULL 
    AND p != '' 
    AND p != '11111111111111111111111111111111';

  -- Only apply if exactly 1 participant (opponent never joined)
  IF v_participant_count >= 2 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'has_opponent');
  END IF;

  -- Backfill waiting_started_at if null (use created_at)
  IF v_session.waiting_started_at IS NULL THEN
    v_session.waiting_started_at := v_session.created_at;
  END IF;

  -- Calculate deadline
  v_deadline := v_session.waiting_started_at + 
                (v_waiting_timeout_seconds || ' seconds')::INTERVAL;

  IF NOW() < v_deadline THEN
    RETURN jsonb_build_object(
      'applied', false, 
      'reason', 'not_expired',
      'remaining_seconds', EXTRACT(EPOCH FROM (v_deadline - NOW()))::INTEGER
    );
  END IF;

  -- === TIMEOUT EXPIRED ===
  -- Mark session as CANCELLED (DB only - no on-chain action)
  UPDATE game_sessions
  SET status = 'cancelled',
      status_int = 5,
      game_over_at = NOW(),
      updated_at = NOW()
  WHERE room_pda = p_room_pda;

  RETURN jsonb_build_object(
    'applied', true,
    'action', 'cancelled',
    'creatorWallet', v_session.player1_wallet,
    'reason', 'opponent_no_show'
  );
END;
$$;

-- 3. Update record_acceptance to set/clear waiting_started_at
CREATE OR REPLACE FUNCTION public.record_acceptance(p_room_pda text, p_wallet text, p_tx_signature text, p_rules_hash text, p_stake_lamports bigint, p_is_creator boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session_token TEXT;
  v_expires_at TIMESTAMPTZ;
  v_nonce TEXT;
  v_session RECORD;
BEGIN
  v_session_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := NOW() + INTERVAL '4 hours';
  v_nonce := encode(extensions.gen_random_bytes(16), 'hex');
  
  -- Update game_sessions ready flags
  IF p_is_creator THEN
    UPDATE game_sessions
    SET p1_acceptance_tx = p_tx_signature,
        p1_ready = TRUE,
        waiting_started_at = COALESCE(waiting_started_at, NOW()),  -- Set waiting timeout start
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
  ELSE
    -- Joiner: set p2_ready AND populate participants array, clear waiting timeout
    UPDATE game_sessions
    SET p2_acceptance_tx = p_tx_signature,
        p2_ready = TRUE,
        player2_wallet = p_wallet,
        -- CRITICAL: Populate participants array for maybe_finalize_start_state
        participants = ARRAY[player1_wallet, p_wallet],
        waiting_started_at = NULL,  -- Clear waiting timeout (opponent arrived)
        updated_at = NOW()
    WHERE room_pda = p_room_pda
    RETURNING * INTO v_session;
    
    -- If both players now ready, auto-start the game
    IF v_session.p1_ready AND v_session.p2_ready THEN
      PERFORM maybe_finalize_start_state(p_room_pda);
    END IF;
  END IF;
  
  -- Insert into game_acceptances table
  INSERT INTO game_acceptances (
    room_pda, player_wallet, rules_hash, signature, session_token, nonce,
    timestamp_ms, session_expires_at
  ) VALUES (
    p_room_pda, p_wallet, p_rules_hash, p_tx_signature, v_session_token, v_nonce,
    EXTRACT(EPOCH FROM NOW())::bigint * 1000, v_expires_at
  )
  ON CONFLICT (room_pda, player_wallet) DO UPDATE SET
    signature = EXCLUDED.signature,
    session_token = EXCLUDED.session_token,
    session_expires_at = EXCLUDED.session_expires_at,
    created_at = NOW();
  
  -- Update player_sessions
  INSERT INTO player_sessions (room_pda, wallet, session_token, rules_hash, last_turn, last_hash)
  VALUES (p_room_pda, p_wallet, v_session_token, p_rules_hash, 0, NULL)
  ON CONFLICT (room_pda, wallet) 
  DO UPDATE SET 
    session_token = v_session_token,
    rules_hash = p_rules_hash,
    revoked = FALSE,
    last_move_at = NOW();
  
  RETURN jsonb_build_object(
    'session_token', v_session_token,
    'expires_at', v_expires_at
  );
END;
$function$;