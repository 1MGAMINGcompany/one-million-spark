-- Create game_invites table for wallet-to-wallet in-app invite notifications
CREATE TABLE public.game_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_pda TEXT NOT NULL,
  sender_wallet TEXT NOT NULL,
  recipient_wallet TEXT NOT NULL,
  game_type TEXT NOT NULL,
  game_name TEXT,
  stake_sol NUMERIC DEFAULT 0,
  winner_payout NUMERIC DEFAULT 0,
  turn_time_seconds INTEGER DEFAULT 60,
  max_players INTEGER DEFAULT 2,
  mode TEXT DEFAULT 'private',
  status TEXT DEFAULT 'pending', -- pending, viewed, accepted, expired
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '24 hours'
);

-- Enable RLS
ALTER TABLE public.game_invites ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert invites (sender creates invite)
CREATE POLICY "Anyone can create invites"
ON public.game_invites
FOR INSERT
WITH CHECK (true);

-- Recipients can read their own invites
CREATE POLICY "Recipients can read their invites"
ON public.game_invites
FOR SELECT
USING (true);

-- Recipients can update their own invites (mark as viewed/accepted)
CREATE POLICY "Recipients can update their invites"
ON public.game_invites
FOR UPDATE
USING (true);

-- Senders can delete their own invites
CREATE POLICY "Senders can delete their invites"
ON public.game_invites
FOR DELETE
USING (true);

-- Create index for efficient querying by recipient
CREATE INDEX idx_game_invites_recipient ON public.game_invites(recipient_wallet, status);
CREATE INDEX idx_game_invites_room ON public.game_invites(room_pda);