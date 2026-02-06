-- Fix record_acceptance to populate participants array and auto-start game
CREATE OR REPLACE FUNCTION public.record_acceptance(
  p_room_pda text,
  p_wallet text,
  p_tx_signature text,
  p_rules_hash text,
  p_stake_lamports bigint,
  p_is_creator boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
  ELSE
    -- Joiner: set p2_ready AND populate participants array
    UPDATE game_sessions
    SET p2_acceptance_tx = p_tx_signature,
        p2_ready = TRUE,
        player2_wallet = p_wallet,
        -- CRITICAL: Populate participants array for maybe_finalize_start_state
        participants = ARRAY[player1_wallet, p_wallet],
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
$$;