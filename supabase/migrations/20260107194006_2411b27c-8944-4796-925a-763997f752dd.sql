-- Fix issue_nonce function to use extensions.gen_random_bytes
CREATE OR REPLACE FUNCTION public.issue_nonce(
  p_room_pda text,
  p_wallet text,
  p_rules_hash text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nonce text;
BEGIN
  -- Use fully qualified schema for pgcrypto function
  v_nonce := encode(extensions.gen_random_bytes(16), 'hex');

  INSERT INTO session_nonces(nonce, room_pda, wallet, rules_hash, expires_at)
  VALUES (v_nonce, p_room_pda, p_wallet, p_rules_hash, now() + interval '10 minutes');

  RETURN v_nonce;
END;
$$;

-- Fix start_session function to use extensions.gen_random_bytes
CREATE OR REPLACE FUNCTION public.start_session(
  p_room_pda text,
  p_wallet text,
  p_rules_hash text,
  p_nonce text,
  p_signature text,
  p_sig_valid boolean
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_is_member boolean;
BEGIN
  IF NOT p_sig_valid THEN
    RAISE EXCEPTION 'invalid signature';
  END IF;

  -- MEMBERSHIP CHECK: wallet must be player1 or player2 in game_sessions
  SELECT EXISTS (
    SELECT 1 FROM game_sessions
    WHERE room_pda = p_room_pda
      AND (player1_wallet = p_wallet OR player2_wallet = p_wallet)
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'not a room player';
  END IF;

  -- Nonce must exist, match, not expired, not used
  UPDATE session_nonces
  SET used = true
  WHERE nonce = p_nonce
    AND room_pda = p_room_pda
    AND wallet = p_wallet
    AND rules_hash = p_rules_hash
    AND used = false
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bad or expired nonce';
  END IF;

  -- Use fully qualified schema for pgcrypto function
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO player_sessions(session_token, room_pda, wallet, rules_hash, last_turn, last_hash)
  VALUES (v_token, p_room_pda, p_wallet, p_rules_hash, 0, 'genesis');

  RETURN v_token;
END;
$$;

-- Fix record_acceptance function to use extensions.gen_random_bytes
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
BEGIN
  -- Use fully qualified schema for pgcrypto function
  v_session_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := NOW() + INTERVAL '4 hours';
  
  -- Update game_sessions with tx signature based on player role
  IF p_is_creator THEN
    UPDATE game_sessions
    SET p1_acceptance_tx = p_tx_signature,
        p1_ready = TRUE,
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
  ELSE
    UPDATE game_sessions
    SET p2_acceptance_tx = p_tx_signature,
        p2_ready = TRUE,
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
  END IF;
  
  -- Upsert into player_sessions for the session token
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

-- Re-grant permissions
REVOKE ALL ON FUNCTION public.issue_nonce(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_nonce(text,text,text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.start_session(text,text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_session(text,text,text,text,text,boolean) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.record_acceptance(text,text,text,text,bigint,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_acceptance(text,text,text,text,bigint,boolean) TO anon, authenticated;