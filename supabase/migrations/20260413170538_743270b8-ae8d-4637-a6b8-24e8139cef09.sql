
-- Fix NHL records: approved should be open for display
UPDATE prediction_fights 
SET status = 'open'
WHERE polymarket_slug ILIKE 'nhl-%' 
  AND status = 'approved'
  AND visibility = 'all';

-- Fix Cricket records: approved should be open for display
UPDATE prediction_fights 
SET status = 'open'
WHERE polymarket_slug ILIKE 'cric%' 
  AND status = 'approved'
  AND visibility = 'all';

-- Fix MLB records: approved should be open for display
UPDATE prediction_fights 
SET status = 'open'
WHERE polymarket_slug ILIKE 'mlb-%' 
  AND status = 'approved'
  AND visibility = 'all'
  AND status != 'open';
