UPDATE public.prediction_fights
SET status = 'cancelled'
WHERE status IN ('live', 'locked')
  AND polymarket_active = false
  AND winner IS NULL
  AND confirmed_at IS NULL
  AND settled_at IS NULL;