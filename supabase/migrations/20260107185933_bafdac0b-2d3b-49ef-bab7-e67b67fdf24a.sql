-- Enable realtime for game_moves table
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_moves;

-- Set REPLICA IDENTITY for complete row data in realtime events
ALTER TABLE public.game_moves REPLICA IDENTITY FULL;