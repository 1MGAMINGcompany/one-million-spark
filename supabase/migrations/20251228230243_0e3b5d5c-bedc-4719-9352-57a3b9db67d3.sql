-- Create game_acceptances table to store signed acceptance proofs and session tokens
CREATE TABLE public.game_acceptances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_pda TEXT NOT NULL,
  player_wallet TEXT NOT NULL,
  rules_hash TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  timestamp_ms BIGINT NOT NULL,
  signature TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  session_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure one acceptance per player per room
  CONSTRAINT unique_player_room UNIQUE (room_pda, player_wallet)
);

-- Index for fast session token lookups
CREATE INDEX idx_game_acceptances_session_token ON public.game_acceptances(session_token);

-- Index for room lookups
CREATE INDEX idx_game_acceptances_room_pda ON public.game_acceptances(room_pda);

-- Enable RLS
ALTER TABLE public.game_acceptances ENABLE ROW LEVEL SECURITY;

-- Players can only read their own acceptances
CREATE POLICY "Players can read own acceptances"
ON public.game_acceptances
FOR SELECT
USING (true);

-- No direct inserts - only through edge function
-- No direct updates or deletes