-- Drop the non-unique index
DROP INDEX IF EXISTS idx_player_sessions_room_wallet;

-- Create the required UNIQUE constraint for ON CONFLICT to work
ALTER TABLE player_sessions
ADD CONSTRAINT player_sessions_room_wallet_unique
UNIQUE (room_pda, wallet);