-- Add acceptance_tx_signature column to game_sessions
ALTER TABLE public.game_sessions
ADD COLUMN IF NOT EXISTS p1_acceptance_tx TEXT,
ADD COLUMN IF NOT EXISTS p2_acceptance_tx TEXT;

-- Create record_acceptance function that stores tx signature as proof
CREATE OR REPLACE FUNCTION public.record_acceptance(
  p_room_pda TEXT,
  p_wallet TEXT,
  p_tx_signature TEXT,
  p_rules_hash TEXT,
  p_stake_lamports BIGINT,
  p_is_creator BOOLEAN DEFAULT FALSE
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_token TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Generate session token
  v_session_token := encode(gen_random_bytes(32), 'hex');
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