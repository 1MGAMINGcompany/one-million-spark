-- Add turn_time_seconds column to game_sessions
-- Stores the turn time limit in seconds chosen by room creator (default 60)
ALTER TABLE public.game_sessions 
ADD COLUMN turn_time_seconds integer NOT NULL DEFAULT 60;