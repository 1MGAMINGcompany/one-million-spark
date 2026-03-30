
-- RPC: fight stats (entry counts, unique predictors, total USD per fight)
CREATE OR REPLACE FUNCTION get_platform_fight_stats()
RETURNS TABLE (fight_id uuid, entry_count bigint, unique_predictors bigint, total_amount_usd numeric)
AS $$
  SELECT pe.fight_id, COUNT(*), COUNT(DISTINCT pe.wallet), COALESCE(SUM(pe.amount_usd), 0)
  FROM prediction_entries pe
  JOIN prediction_fights pf ON pe.fight_id = pf.id
  WHERE pf.visibility IN ('platform', 'all')
  AND pf.operator_id IS NULL
  GROUP BY pe.fight_id;
$$ LANGUAGE sql STABLE;

-- RPC: unique users
CREATE OR REPLACE FUNCTION get_platform_unique_users()
RETURNS bigint AS $$
  SELECT COUNT(DISTINCT pe.wallet)
  FROM prediction_entries pe
  JOIN prediction_fights pf ON pe.fight_id = pf.id
  WHERE pf.visibility IN ('platform', 'all')
  AND pf.operator_id IS NULL;
$$ LANGUAGE sql STABLE;

-- Activity log table
CREATE TABLE IF NOT EXISTS admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  description text NOT NULL,
  admin_wallet text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_client_writes_admin_activity_log" ON admin_activity_log FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "public_read_admin_activity_log" ON admin_activity_log FOR SELECT USING (true);
