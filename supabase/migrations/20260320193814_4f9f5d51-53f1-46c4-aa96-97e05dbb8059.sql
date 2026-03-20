CREATE TABLE prediction_fight_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fight_id uuid NOT NULL REFERENCES prediction_fights(id) ON DELETE CASCADE,
  content text NOT NULL,
  source text DEFAULT 'admin',
  impact text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE prediction_fight_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_fight_updates" ON prediction_fight_updates
  FOR SELECT TO public USING (true);

CREATE POLICY "deny_client_writes_fight_updates" ON prediction_fight_updates
  FOR ALL TO public USING (false) WITH CHECK (false);