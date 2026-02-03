-- P0 FIX: Drop global UNIQUE constraint on session_token that causes 23505 errors
-- when the same player joins multiple rooms (their player_sessions token gets reused)

-- Drop the overly restrictive global unique on session_token
ALTER TABLE public.game_acceptances
DROP CONSTRAINT IF EXISTS game_acceptances_session_token_key;

-- Note: Keep the correct idempotency constraint UNIQUE(room_pda, player_wallet)
-- which is already in place as "unique_player_room"