
CREATE OR REPLACE FUNCTION get_platform_fight_stats()
RETURNS TABLE (fight_id uuid, entry_count bigint, unique_predictors bigint, total_amount_usd numeric)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT pe.fight_id, COUNT(*), COUNT(DISTINCT pe.wallet), COALESCE(SUM(pe.amount_usd), 0)
  FROM prediction_entries pe
  JOIN prediction_fights pf ON pe.fight_id = pf.id
  WHERE pf.visibility IN ('platform', 'all')
  AND pf.operator_id IS NULL
  GROUP BY pe.fight_id;
$$;

CREATE OR REPLACE FUNCTION get_platform_unique_users()
RETURNS bigint
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT pe.wallet)
  FROM prediction_entries pe
  JOIN prediction_fights pf ON pe.fight_id = pf.id
  WHERE pf.visibility IN ('platform', 'all')
  AND pf.operator_id IS NULL;
$$;
