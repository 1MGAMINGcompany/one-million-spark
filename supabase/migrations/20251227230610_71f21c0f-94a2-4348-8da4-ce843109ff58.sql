-- Create player_profiles table for fighter-record style profiles
CREATE TABLE public.player_profiles (
  -- Primary
  wallet TEXT PRIMARY KEY,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  win_rate REAL GENERATED ALWAYS AS (
    CASE WHEN games_played > 0 THEN wins::REAL / games_played::REAL ELSE 0 END
  ) STORED,
  
  -- Performance
  total_sol_won NUMERIC NOT NULL DEFAULT 0,
  biggest_pot_won NUMERIC NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  
  -- Flavor (derived)
  favorite_game TEXT,
  last_game_at TIMESTAMP WITH TIME ZONE,
  
  -- Meta
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;

-- Profiles are publicly readable (leaderboard, opponent lookup)
CREATE POLICY "Player profiles are publicly readable"
ON public.player_profiles
FOR SELECT
USING (true);

-- Anyone can insert their own profile (first game creates it)
CREATE POLICY "Anyone can insert player profiles"
ON public.player_profiles
FOR INSERT
WITH CHECK (true);

-- Anyone can update profiles (stats update after games)
CREATE POLICY "Anyone can update player profiles"
ON public.player_profiles
FOR UPDATE
USING (true);

-- Create index for leaderboard queries
CREATE INDEX idx_player_profiles_wins ON public.player_profiles (wins DESC);
CREATE INDEX idx_player_profiles_win_rate ON public.player_profiles (win_rate DESC) WHERE games_played >= 5;
CREATE INDEX idx_player_profiles_total_sol_won ON public.player_profiles (total_sol_won DESC);

-- Trigger for updated_at
CREATE TRIGGER update_player_profiles_updated_at
  BEFORE UPDATE ON public.player_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_h2h_updated_at();