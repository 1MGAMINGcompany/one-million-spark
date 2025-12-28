-- Add mode column to game_sessions for ranked/casual tracking
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'casual';

-- Add check constraint to ensure valid modes
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_mode_check 
  CHECK (mode IN ('casual', 'ranked'));