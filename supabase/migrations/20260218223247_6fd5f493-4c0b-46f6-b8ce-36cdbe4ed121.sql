
CREATE TABLE presence_heartbeats (
  session_id TEXT PRIMARY KEY,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_presence_last_seen ON presence_heartbeats(last_seen);

ALTER TABLE presence_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY deny_all_clients ON presence_heartbeats FOR ALL USING (false) WITH CHECK (false);
