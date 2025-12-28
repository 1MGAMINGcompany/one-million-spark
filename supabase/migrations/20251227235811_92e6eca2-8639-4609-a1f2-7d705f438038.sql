-- Create the update_updated_at function first
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create game_sessions table to persist multiplayer game state
CREATE TABLE public.game_sessions (
  room_pda TEXT PRIMARY KEY,
  game_type TEXT NOT NULL,
  game_state JSONB NOT NULL DEFAULT '{}',
  current_turn_wallet TEXT,
  player1_wallet TEXT NOT NULL,
  player2_wallet TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read game sessions (players need to see the game)
CREATE POLICY "Anyone can read game sessions"
ON public.game_sessions
FOR SELECT
USING (true);

-- Allow anyone to insert (game creation)
CREATE POLICY "Anyone can create game sessions"
ON public.game_sessions
FOR INSERT
WITH CHECK (true);

-- Allow anyone to update (for game moves)
CREATE POLICY "Anyone can update game sessions"
ON public.game_sessions
FOR UPDATE
USING (true);

-- Create updated_at trigger
CREATE TRIGGER update_game_sessions_updated_at
BEFORE UPDATE ON public.game_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for game_sessions
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;