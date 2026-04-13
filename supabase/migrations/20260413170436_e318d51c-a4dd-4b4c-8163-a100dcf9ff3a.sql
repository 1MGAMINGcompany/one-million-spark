
-- Fix existing NHL records stuck at visibility=platform (they should be auto-approved)
UPDATE prediction_fights 
SET visibility = 'all', status = 'approved'
WHERE polymarket_slug ILIKE 'nhl-%' 
  AND status IN ('open', 'live', 'locked', 'pending_review')
  AND visibility = 'platform';

-- Fix existing MLB records stuck at visibility=platform
UPDATE prediction_fights 
SET visibility = 'all', status = 'approved'
WHERE polymarket_slug ILIKE 'mlb-%' 
  AND status IN ('open', 'live', 'locked', 'pending_review')
  AND visibility = 'platform';

-- Fix existing Cricket records stuck at visibility=platform (IPL, PSL, Legends, T20)
UPDATE prediction_fights 
SET visibility = 'all', status = 'approved'
WHERE polymarket_slug ILIKE 'cric%' 
  AND status IN ('open', 'live', 'locked', 'pending_review')
  AND visibility = 'platform'
  AND (polymarket_slug ILIKE 'cricipl%' OR polymarket_slug ILIKE 'cricpsl%' 
    OR polymarket_slug ILIKE 'cricleg%' OR polymarket_slug ILIKE 'crict20%'
    OR polymarket_slug ILIKE 'cric-%');
