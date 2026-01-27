-- Add max_players and eliminated_players columns to game_sessions for Ludo multiplayer support
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS eliminated_players TEXT[] DEFAULT '{}';