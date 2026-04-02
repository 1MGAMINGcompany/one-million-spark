UPDATE prediction_fights
SET trading_allowed = true,
    updated_at = NOW()
WHERE status IN ('open', 'live', 'locked')
  AND fighter_a_name NOT IN ('Yes', 'No', 'Over', 'Under')
  AND fighter_b_name NOT IN ('Yes', 'No', 'Over', 'Under')
  AND trading_allowed = false
  AND event_date >= NOW() - interval '4 hours'
  AND polymarket_outcome_a_token IS NOT NULL;