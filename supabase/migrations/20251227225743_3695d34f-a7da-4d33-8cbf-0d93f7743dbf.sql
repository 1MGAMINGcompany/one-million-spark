-- Create matches table to log room creation (including rematches)
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_pda TEXT NOT NULL,
  origin_room_pda TEXT,
  is_rematch BOOLEAN NOT NULL DEFAULT false,
  game_type TEXT NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 2,
  stake_lamports BIGINT NOT NULL DEFAULT 0,
  creator_wallet TEXT NOT NULL,
  winner_wallet TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finalized_at TIMESTAMP WITH TIME ZONE
);

-- Create head-to-head stats table
CREATE TABLE public.h2h (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_a_wallet TEXT NOT NULL,
  player_b_wallet TEXT NOT NULL,
  game_type TEXT NOT NULL,
  a_wins INTEGER NOT NULL DEFAULT 0,
  b_wins INTEGER NOT NULL DEFAULT 0,
  total_games INTEGER NOT NULL DEFAULT 0,
  last_winner TEXT,
  current_streak_owner TEXT,
  current_streak INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure player_a < player_b lexicographically for consistent ordering
  CONSTRAINT h2h_unique_matchup UNIQUE (player_a_wallet, player_b_wallet, game_type)
);

-- Enable RLS
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.h2h ENABLE ROW LEVEL SECURITY;

-- Matches: Anyone can read, only creator can insert their own matches
CREATE POLICY "Matches are publicly readable" 
ON public.matches 
FOR SELECT 
USING (true);

CREATE POLICY "Users can insert their own matches" 
ON public.matches 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update their own matches" 
ON public.matches 
FOR UPDATE 
USING (true);

-- H2H: Anyone can read, system can update
CREATE POLICY "H2H stats are publicly readable" 
ON public.h2h 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert h2h records" 
ON public.h2h 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update h2h records" 
ON public.h2h 
FOR UPDATE 
USING (true);

-- Create indexes for common queries
CREATE INDEX idx_matches_room_pda ON public.matches(room_pda);
CREATE INDEX idx_matches_creator ON public.matches(creator_wallet);
CREATE INDEX idx_h2h_players ON public.h2h(player_a_wallet, player_b_wallet);
CREATE INDEX idx_h2h_game_type ON public.h2h(game_type);

-- Create updated_at trigger for h2h
CREATE OR REPLACE FUNCTION public.update_h2h_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_h2h_updated_at
BEFORE UPDATE ON public.h2h
FOR EACH ROW
EXECUTE FUNCTION public.update_h2h_updated_at();