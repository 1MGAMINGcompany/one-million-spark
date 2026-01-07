-- Add UNIQUE constraint on game_moves(room_pda, turn_number) for server-authoritative move validation
-- This prevents duplicate moves for the same turn and room

-- First check if constraint exists, drop if it does (to avoid conflicts)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_moves_room_turn_unique') THEN
        ALTER TABLE game_moves DROP CONSTRAINT game_moves_room_turn_unique;
    END IF;
END $$;

-- Create the UNIQUE constraint
ALTER TABLE game_moves 
ADD CONSTRAINT game_moves_room_turn_unique 
UNIQUE (room_pda, turn_number);