-- Update start_session to enforce room membership
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
  -- Verify signature first
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

  -- Generate session token
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Insert into player_sessions
  INSERT INTO player_sessions(session_token, room_pda, wallet, rules_hash, last_turn, last_hash)
  VALUES (v_token, p_room_pda, p_wallet, p_rules_hash, 0, 'genesis');

  RETURN v_token;
END;
$$;