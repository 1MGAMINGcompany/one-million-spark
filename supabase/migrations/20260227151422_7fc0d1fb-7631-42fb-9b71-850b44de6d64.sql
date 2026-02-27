
ALTER TABLE public.presence_heartbeats
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS lang text,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS referrer text;
