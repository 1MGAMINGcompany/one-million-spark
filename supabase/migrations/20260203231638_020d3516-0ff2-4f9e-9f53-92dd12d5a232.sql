-- =====================================================
-- P0 FIX: Auto-sync participants[] from player wallets
-- Supports 2-player games and Ludo (2-4 players)
-- =====================================================

-- 1. Helper function to rebuild participants from wallets
CREATE OR REPLACE FUNCTION public.rebuild_participants(
  p_player1 text,
  p_player2 text,
  p_existing_participants text[],
  p_max_players int
) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
  v_result text[] := '{}';
  v_wallet text;
BEGIN
  -- For 2-player games: always [player1, player2] (non-null only)
  IF p_max_players <= 2 THEN
    IF p_player1 IS NOT NULL AND p_player1 <> '' THEN
      v_result := array_append(v_result, p_player1);
    END IF;
    IF p_player2 IS NOT NULL AND p_player2 <> '' THEN
      v_result := array_append(v_result, p_player2);
    END IF;
    RETURN v_result;
  END IF;
  
  -- For Ludo (3-4 players): preserve existing order, append new wallets
  -- Start with existing participants (filter nulls/empty)
  FOREACH v_wallet IN ARRAY COALESCE(p_existing_participants, '{}')
  LOOP
    IF v_wallet IS NOT NULL AND v_wallet <> '' AND NOT (v_wallet = ANY(v_result)) THEN
      v_result := array_append(v_result, v_wallet);
    END IF;
  END LOOP;
  
  -- Add player1 if not present
  IF p_player1 IS NOT NULL AND p_player1 <> '' AND NOT (p_player1 = ANY(v_result)) THEN
    v_result := array_append(v_result, p_player1);
  END IF;
  
  -- Add player2 if not present
  IF p_player2 IS NOT NULL AND p_player2 <> '' AND NOT (p_player2 = ANY(v_result)) THEN
    v_result := array_append(v_result, p_player2);
  END IF;
  
  RETURN v_result;
END;
$fn$;

-- 2. Trigger function to auto-sync participants on any update
CREATE OR REPLACE FUNCTION public.sync_participants_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_new_participants text[];
BEGIN
  -- Rebuild participants based on current wallet values
  v_new_participants := rebuild_participants(
    NEW.player1_wallet,
    NEW.player2_wallet,
    NEW.participants,
    NEW.max_players
  );
  
  -- Only update if changed (avoid infinite recursion)
  IF v_new_participants IS DISTINCT FROM NEW.participants THEN
    NEW.participants := v_new_participants;
  END IF;
  
  RETURN NEW;
END;
$fn$;

-- 3. Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_sync_participants ON public.game_sessions;

CREATE TRIGGER trg_sync_participants
  BEFORE INSERT OR UPDATE OF player1_wallet, player2_wallet, participants, max_players
  ON public.game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_participants_trigger();

-- 4. Update record_acceptance to:
--    a) Also insert into game_acceptances (idempotent on room_pda+player_wallet)
--    b) Protect against overwriting player2_wallet with different wallet
--    c) Let trigger handle participants sync
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
SET search_path TO 'public'
AS $function$
DECLARE
  v_session_token TEXT;
  v_expires_at TIMESTAMPTZ;
  v_existing_p2 TEXT;
  v_nonce TEXT;
BEGIN
  -- Generate session token and expiry
  v_session_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := NOW() + INTERVAL '4 hours';
  v_nonce := encode(extensions.gen_random_bytes(16), 'hex');
  
  IF p_is_creator THEN
    -- Creator acceptance
    UPDATE game_sessions
    SET p1_acceptance_tx = p_tx_signature,
        p1_ready = TRUE,
        updated_at = NOW()
    WHERE room_pda = p_room_pda;
  ELSE
    -- Joiner acceptance: protect against overwriting different player2
    SELECT player2_wallet INTO v_existing_p2
    FROM game_sessions
    WHERE room_pda = p_room_pda;
    
    -- Only update player2_wallet if null/empty or same wallet
    IF v_existing_p2 IS NULL OR v_existing_p2 = '' OR v_existing_p2 = p_wallet THEN
      UPDATE game_sessions
      SET p2_acceptance_tx = p_tx_signature,
          p2_ready = TRUE,
          player2_wallet = p_wallet,
          updated_at = NOW()
      WHERE room_pda = p_room_pda;
    ELSE
      -- Different player2 already exists - just mark ready flags
      -- This handles Ludo where we have 3-4 players
      UPDATE game_sessions
      SET updated_at = NOW()
      WHERE room_pda = p_room_pda;
    END IF;
  END IF;
  
  -- Insert into player_sessions (idempotent on room_pda+wallet)
  INSERT INTO player_sessions (room_pda, wallet, session_token, rules_hash, last_turn, last_hash)
  VALUES (p_room_pda, p_wallet, v_session_token, p_rules_hash, 0, NULL)
  ON CONFLICT (room_pda, wallet) 
  DO UPDATE SET 
    session_token = v_session_token,
    rules_hash = p_rules_hash,
    revoked = FALSE,
    last_move_at = NOW();
  
  -- Insert into game_acceptances (idempotent on room_pda+player_wallet)
  INSERT INTO game_acceptances (
    room_pda, player_wallet, rules_hash, nonce, signature, 
    session_token, timestamp_ms, session_expires_at
  ) VALUES (
    p_room_pda, p_wallet, p_rules_hash, v_nonce, p_tx_signature,
    v_session_token, (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint, v_expires_at
  )
  ON CONFLICT (room_pda, player_wallet)
  DO UPDATE SET
    signature = EXCLUDED.signature,
    session_token = EXCLUDED.session_token,
    session_expires_at = EXCLUDED.session_expires_at,
    nonce = EXCLUDED.nonce;
  
  RETURN jsonb_build_object(
    'session_token', v_session_token,
    'expires_at', v_expires_at
  );
END;
$function$;

-- 5. One-time fix: sync all existing game_sessions participants
UPDATE game_sessions
SET participants = rebuild_participants(player1_wallet, player2_wallet, participants, max_players)
WHERE array_length(participants, 1) IS NULL 
   OR array_length(participants, 1) < 2 
   AND player2_wallet IS NOT NULL;