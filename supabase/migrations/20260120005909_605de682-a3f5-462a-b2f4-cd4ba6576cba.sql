-- Add turn_started_at column to track when current turn began (for timeout validation)
ALTER TABLE public.game_sessions 
ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMP WITH TIME ZONE DEFAULT now();