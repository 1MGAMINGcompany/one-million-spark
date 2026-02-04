-- Create match_share_cards table for shareable match result data
CREATE TABLE public.match_share_cards (
  room_pda TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mode TEXT NOT NULL DEFAULT 'casual',
  game_type TEXT NOT NULL,
  winner_wallet TEXT,
  loser_wallet TEXT,
  win_reason TEXT NOT NULL DEFAULT 'unknown',
  stake_lamports BIGINT NOT NULL DEFAULT 0,
  winner_rank_before INT,
  winner_rank_after INT,
  loser_rank_before INT,
  loser_rank_after INT,
  tx_signature TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.match_share_cards ENABLE ROW LEVEL SECURITY;

-- Public read access (share cards are meant to be shared)
CREATE POLICY "public_read_match_share_cards" 
ON public.match_share_cards 
FOR SELECT 
USING (true);

-- No client writes (edge functions only via service role)
CREATE POLICY "deny_client_writes_match_share_cards"
ON public.match_share_cards
FOR ALL
USING (false)
WITH CHECK (false);

-- Index for fast lookups
CREATE INDEX idx_match_share_cards_winner ON public.match_share_cards(winner_wallet);
CREATE INDEX idx_match_share_cards_created ON public.match_share_cards(created_at DESC);

-- Comment for documentation
COMMENT ON TABLE public.match_share_cards IS 'Stores shareable match result data for social sharing cards';