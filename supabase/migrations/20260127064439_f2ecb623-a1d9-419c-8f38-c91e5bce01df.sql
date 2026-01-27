-- Enable realtime for game_invites table to get instant notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_invites;