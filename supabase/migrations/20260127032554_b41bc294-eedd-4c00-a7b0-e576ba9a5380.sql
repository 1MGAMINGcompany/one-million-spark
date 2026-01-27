CREATE OR REPLACE FUNCTION public.set_player_ready(
  p_room_pda text,
  p_wallet text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p1 text;
  v_p2 text;
BEGIN
  SELECT player1_wallet, player2_wallet
    INTO v_p1, v_p2
  FROM public.game_sessions
  WHERE room_pda = p_room_pda;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game session not found';
  END IF;

  -- Player 1 ready
  IF p_wallet = v_p1 THEN
    UPDATE public.game_sessions
    SET p1_ready = true,
        updated_at = now()
    WHERE room_pda = p_room_pda;
    RETURN;
  END IF;

  -- Player 2 ready (normal case)
  IF v_p2 IS NOT NULL AND p_wallet = v_p2 THEN
    UPDATE public.game_sessions
    SET p2_ready = true,
        updated_at = now()
    WHERE room_pda = p_room_pda;
    RETURN;
  END IF;

  -- NEW: If p2 slot is empty, claim it atomically
  IF v_p2 IS NULL AND p_wallet <> v_p1 THEN
    UPDATE public.game_sessions
    SET player2_wallet = p_wallet,
        p2_ready = true,
        updated_at = now()
    WHERE room_pda = p_room_pda
      AND player2_wallet IS NULL;

    IF FOUND THEN
      RETURN;
    END IF;

    -- Handle race: if another process filled p2 concurrently
    SELECT player2_wallet INTO v_p2
    FROM public.game_sessions
    WHERE room_pda = p_room_pda;

    IF v_p2 IS NOT NULL AND p_wallet = v_p2 THEN
      UPDATE public.game_sessions
      SET p2_ready = true,
          updated_at = now()
      WHERE room_pda = p_room_pda;
      RETURN;
    END IF;
  END IF;

  RAISE EXCEPTION 'wallet not in game';
END;
$$;