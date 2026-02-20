
-- Add page and game columns to presence_heartbeats
ALTER TABLE presence_heartbeats
  ADD COLUMN IF NOT EXISTS page TEXT,
  ADD COLUMN IF NOT EXISTS game TEXT;

-- Create ai_game_events table for tracking discrete AI game events
CREATE TABLE IF NOT EXISTS ai_game_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      TEXT NOT NULL,
  game            TEXT NOT NULL,
  difficulty      TEXT NOT NULL,
  event           TEXT NOT NULL,
  duration_seconds INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: write-only from browser (same as client_errors), read only via service role
ALTER TABLE ai_game_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_ai_events"
  ON ai_game_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "no_client_reads_ai_events"
  ON ai_game_events FOR SELECT
  USING (false);
