-- Add client_move_id column to game_moves table for idempotency
ALTER TABLE public.game_moves 
ADD COLUMN IF NOT EXISTS client_move_id text;

-- Create unique partial index for idempotency (only on non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_moves_idempotent 
ON public.game_moves (room_pda, client_move_id) 
WHERE client_move_id IS NOT NULL;