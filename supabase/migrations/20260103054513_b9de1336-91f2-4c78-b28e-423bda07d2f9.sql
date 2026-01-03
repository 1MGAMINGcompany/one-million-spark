-- Create ensure_game_session RPC to create session early when both players connect
CREATE OR REPLACE FUNCTION public.ensure_game_session(
  p_room_pda text,
  p_game_type text,
  p_player1_wallet text,
  p_player2_wallet text,
  p_mode text DEFAULT 'casual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate inputs
  IF p_room_pda IS NULL OR length(p_room_pda) < 10 THEN
    RAISE EXCEPTION 'Invalid room_pda';
  END IF;
  
  IF p_player1_wallet IS NULL OR length(p_player1_wallet) < 10 THEN
    RAISE EXCEPTION 'Invalid player1_wallet';
  END IF;
  
  IF p_player2_wallet IS NULL OR length(p_player2_wallet) < 10 THEN
    RAISE EXCEPTION 'Invalid player2_wallet';
  END IF;

  IF p_mode NOT IN ('casual', 'ranked') THEN
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  -- Create session if it doesn't exist
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

-- Update compute_start_roll to support casual mode (no signatures required)
CREATE OR REPLACE FUNCTION public.compute_start_roll(p_room_pda text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p1 text;
  p2 text;
  sig1 text;
  sig2 text;
  seed_text text;
  seed bytea;
  reroll int := 0;
  p1d1 int; p1d2 int; p2d1 int; p2d2 int;
  t1 int; t2 int;
  starter text;
  v_session record;
  v_mode text;
BEGIN
  -- Get game session
  SELECT * INTO v_session FROM game_sessions WHERE room_pda = p_room_pda;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'game session not found';
  END IF;

  -- If already finalized, return existing result
  IF v_session.start_roll_finalized IS TRUE THEN
    RETURN jsonb_build_object(
      'starting_player_wallet', v_session.starting_player_wallet,
      'start_roll', v_session.start_roll
    );
  END IF;

  p1 := v_session.player1_wallet;
  p2 := v_session.player2_wallet;
  v_mode := v_session.mode;

  IF p2 IS NULL THEN
    RAISE EXCEPTION 'waiting for player2';
  END IF;

  -- Try to get signatures from game_acceptances (for ranked games)
  SELECT signature INTO sig1
  FROM game_acceptances
  WHERE room_pda = p_room_pda AND player_wallet = p1
  ORDER BY created_at DESC LIMIT 1;

  SELECT signature INTO sig2
  FROM game_acceptances
  WHERE room_pda = p_room_pda AND player_wallet = p2
  ORDER BY created_at DESC LIMIT 1;

  -- For casual games OR if signatures not yet available, use deterministic seed from room + wallets + timestamp
  IF sig1 IS NULL OR sig2 IS NULL THEN
    -- Use room_pda + player wallets + created_at as seed for casual games
    seed_text := encode(digest(
      p_room_pda || '|' || p1 || '|' || p2 || '|' || v_session.created_at::text, 
      'sha256'
    ), 'hex');
  ELSE
    -- Use cryptographic signatures for ranked games
    seed_text := encode(digest(p_room_pda || '|' || sig1 || '|' || sig2 || '|reroll:' || reroll::text, 'sha256'), 'hex');
  END IF;

  -- Deterministic dice roll loop
  LOOP
    IF sig1 IS NOT NULL AND sig2 IS NOT NULL THEN
      -- Ranked mode: include reroll in seed
      seed_text := encode(digest(p_room_pda || '|' || sig1 || '|' || sig2 || '|reroll:' || reroll::text, 'sha256'), 'hex');
    ELSE
      -- Casual mode: include reroll in seed
      seed_text := encode(digest(
        p_room_pda || '|' || p1 || '|' || p2 || '|' || v_session.created_at::text || '|reroll:' || reroll::text, 
        'sha256'
      ), 'hex');
    END IF;
    
    seed := decode(seed_text, 'hex');

    -- Derive dice values (1-6) from hash bytes
    p1d1 := (get_byte(seed, 0) % 6) + 1;
    p1d2 := (get_byte(seed, 1) % 6) + 1;
    p2d1 := (get_byte(seed, 2) % 6) + 1;
    p2d2 := (get_byte(seed, 3) % 6) + 1;

    t1 := p1d1 + p1d2;
    t2 := p2d1 + p2d2;

    EXIT WHEN t1 <> t2 OR reroll >= 20;
    reroll := reroll + 1;
  END LOOP;

  -- Determine starter (tie-breaker: p1 wins if still tied after 20 rerolls)
  IF t1 = t2 THEN
    starter := p1;
  ELSE
    starter := CASE WHEN t1 > t2 THEN p1 ELSE p2 END;
  END IF;

  -- Persist the result
  UPDATE game_sessions
  SET
    starting_player_wallet = starter,
    current_turn_wallet = starter,
    start_roll_seed = seed_text,
    start_roll_finalized = true,
    start_roll = jsonb_build_object(
      'p1', jsonb_build_object('wallet', p1, 'dice', jsonb_build_array(p1d1, p1d2), 'total', t1),
      'p2', jsonb_build_object('wallet', p2, 'dice', jsonb_build_array(p2d1, p2d2), 'total', t2),
      'reroll_count', reroll,
      'winner', starter
    ),
    updated_at = now()
  WHERE room_pda = p_room_pda;

  RETURN jsonb_build_object(
    'starting_player_wallet', starter,
    'start_roll', (SELECT start_roll FROM game_sessions WHERE room_pda = p_room_pda)
  );
END;
$$;