ALTER TABLE presence_heartbeats
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz DEFAULT now();

UPDATE presence_heartbeats
  SET first_seen_at = last_seen
  WHERE first_seen_at IS NULL;