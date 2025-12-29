-- Add ready flags for ranked game acceptance
ALTER TABLE public.game_sessions
ADD COLUMN IF NOT EXISTS p1_ready boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS p2_ready boolean NOT NULL DEFAULT false;

-- Create function to set player ready status
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
  -- Get player wallets
  SELECT player1_wallet, player2_wallet INTO v_p1, v_p2
  FROM game_sessions
  WHERE room_pda = p_room_pda;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game session not found';
  END IF;

  -- Update the correct ready flag
  IF p_wallet = v_p1 THEN
    UPDATE game_sessions SET p1_ready = true, updated_at = now()
    WHERE room_pda = p_room_pda;
  ELSIF p_wallet = v_p2 THEN
    UPDATE game_sessions SET p2_ready = true, updated_at = now()
    WHERE room_pda = p_room_pda;
  ELSE
    RAISE EXCEPTION 'wallet not in game';
  END IF;
END;
$$;