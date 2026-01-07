-- Fix record_acceptance to set player2_wallet for joiners
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
  v_session_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := NOW() + INTERVAL '4 hours';
  
  IF p_is_creator THEN
    UPDATE game_sessions
    SET p1_acceptance_tx = p_tx_signature,
        p1_ready = TRUE,
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
  ELSE
    -- FIX: Set player2_wallet to the joiner's wallet
    UPDATE game_sessions
    SET p2_acceptance_tx = p_tx_signature,
        p2_ready = TRUE,
        player2_wallet = p_wallet,
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
  END IF;
  
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

-- Fix ensure_game_session to allow NULL player2_wallet on creation
CREATE OR REPLACE FUNCTION public.ensure_game_session(
  p_room_pda text,
  p_game_type text,
  p_player1_wallet text,
  p_player2_wallet text,
  p_mode text DEFAULT 'casual'::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_room_pda IS NULL OR length(p_room_pda) < 10 THEN
    RAISE EXCEPTION 'Invalid room_pda';
  END IF;
  
  IF p_player1_wallet IS NULL OR length(p_player1_wallet) < 10 THEN
    RAISE EXCEPTION 'Invalid player1_wallet';
  END IF;
  
  -- Allow NULL for player2_wallet (will be set when joiner joins)
  IF p_player2_wallet IS NOT NULL AND length(p_player2_wallet) < 10 THEN
    RAISE EXCEPTION 'Invalid player2_wallet';
  END IF;

  IF p_mode NOT IN ('casual', 'ranked') THEN
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  INSERT INTO game_sessions (
    room_pda, game_type, game_state, 
    player1_wallet, player2_wallet, 
    status, mode
  ) VALUES (
    p_room_pda, p_game_type, '{}'::jsonb,
    p_player1_wallet, p_player2_wallet,
    'active', p_mode
  )
  ON CONFLICT (room_pda) DO UPDATE SET
    player2_wallet = COALESCE(game_sessions.player2_wallet, EXCLUDED.player2_wallet),
    updated_at = now();
END;
$$;

-- Re-grant permissions
REVOKE ALL ON FUNCTION public.record_acceptance(text,text,text,text,bigint,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_acceptance(text,text,text,text,bigint,boolean) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.ensure_game_session(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_game_session(text,text,text,text,text) TO anon, authenticated;