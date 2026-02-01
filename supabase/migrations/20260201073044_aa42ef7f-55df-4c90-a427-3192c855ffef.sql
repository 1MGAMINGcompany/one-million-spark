-- Align status default to match status_int=1 (waiting)
ALTER TABLE game_sessions 
ALTER COLUMN status SET DEFAULT 'waiting';

-- Fix any existing mismatched rows
UPDATE game_sessions SET status = 'waiting' WHERE status = 'active' AND status_int = 1;
UPDATE game_sessions SET status = 'finished' WHERE status_int = 3 AND status != 'finished';
UPDATE game_sessions SET status = 'active' WHERE status_int = 2 AND status != 'active';