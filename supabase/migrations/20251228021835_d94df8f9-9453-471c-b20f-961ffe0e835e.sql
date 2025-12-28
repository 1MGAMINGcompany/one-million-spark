-- Drop permissive write policies on player_profiles
DROP POLICY IF EXISTS "Anyone can insert player profiles" ON player_profiles;
DROP POLICY IF EXISTS "Anyone can update player profiles" ON player_profiles;

-- Drop permissive write policies on matches
DROP POLICY IF EXISTS "Users can insert their own matches" ON matches;
DROP POLICY IF EXISTS "Users can update their own matches" ON matches;

-- Drop permissive write policies on h2h
DROP POLICY IF EXISTS "Anyone can insert h2h records" ON h2h;
DROP POLICY IF EXISTS "Anyone can update h2h records" ON h2h;