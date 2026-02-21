
-- Add display_names JSONB column to game_sessions for storing guest display names
-- Format: {"playerId": "Guest-1234", "playerId2": "CoolPlayer"}
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS display_names jsonb DEFAULT '{}'::jsonb;
