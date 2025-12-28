-- Table for one-time nonces (replay protection)
CREATE TABLE IF NOT EXISTS public.session_nonces (
  nonce text PRIMARY KEY,
  room_pda text NOT NULL,
  wallet text NOT NULL,
  rules_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table for session tokens (fast gameplay)
CREATE TABLE IF NOT EXISTS public.player_sessions (
  session_token text PRIMARY KEY,
  room_pda text NOT NULL,
  wallet text NOT NULL,
  rules_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked boolean NOT NULL DEFAULT false,
  last_turn int NOT NULL DEFAULT 0,
  last_hash text
);

-- Enable RLS (private - no public read)
ALTER TABLE public.session_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_sessions ENABLE ROW LEVEL SECURITY;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_session_nonces_room_wallet ON public.session_nonces(room_pda, wallet);
CREATE INDEX IF NOT EXISTS idx_player_sessions_room_wallet ON public.player_sessions(room_pda, wallet);
CREATE INDEX IF NOT EXISTS idx_session_nonces_expires ON public.session_nonces(expires_at) WHERE used = false;

-- RPC 1: Issue a nonce (public callable)
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
  v_nonce := encode(gen_random_bytes(16), 'hex');

  INSERT INTO session_nonces(nonce, room_pda, wallet, rules_hash, expires_at)
  VALUES (v_nonce, p_room_pda, p_wallet, p_rules_hash, now() + interval '10 minutes');

  RETURN v_nonce;
END;
$$;

-- RPC 2: Start session (verifies nonce + stores signature + returns token)
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
BEGIN
  IF NOT p_sig_valid THEN
    RAISE EXCEPTION 'invalid signature';
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

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO player_sessions(session_token, room_pda, wallet, rules_hash, last_turn, last_hash)
  VALUES (v_token, p_room_pda, p_wallet, p_rules_hash, 0, 'genesis');

  RETURN v_token;
END;
$$;

-- Grant execute to anon and authenticated
REVOKE ALL ON FUNCTION public.issue_nonce(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_nonce(text,text,text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.start_session(text,text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_session(text,text,text,text,text,boolean) TO anon, authenticated;