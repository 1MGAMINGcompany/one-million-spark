-- Drop the 2-parameter overload to eliminate PGRST203 ambiguity
-- Keep only the 3-parameter version
DROP FUNCTION IF EXISTS public.finish_game_session(text, text);