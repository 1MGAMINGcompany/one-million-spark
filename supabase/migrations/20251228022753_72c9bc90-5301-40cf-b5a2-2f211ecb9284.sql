-- PLAYER PROFILES: public read, no direct writes
alter table player_profiles enable row level security;

drop policy if exists "public read profiles" on player_profiles;
create policy "public read profiles"
on player_profiles for select
using (true);

drop policy if exists "public insert profiles" on player_profiles;
drop policy if exists "public update profiles" on player_profiles;
drop policy if exists "public delete profiles" on player_profiles;
drop policy if exists "Player profiles are publicly readable" on player_profiles;

-- MATCHES: public read, no direct writes
alter table matches enable row level security;

drop policy if exists "public read matches" on matches;
create policy "public read matches"
on matches for select
using (true);

drop policy if exists "public insert matches" on matches;
drop policy if exists "public update matches" on matches;
drop policy if exists "public delete matches" on matches;
drop policy if exists "Matches are publicly readable" on matches;

-- H2H: public read, no direct writes
alter table h2h enable row level security;

drop policy if exists "public read h2h" on h2h;
create policy "public read h2h"
on h2h for select
using (true);

drop policy if exists "public insert h2h" on h2h;
drop policy if exists "public update h2h" on h2h;
drop policy if exists "public delete h2h" on h2h;
drop policy if exists "H2H stats are publicly readable" on h2h;

-- RATINGS: public read, no direct writes
alter table ratings enable row level security;

drop policy if exists "public read ratings" on ratings;
create policy "public read ratings"
on ratings for select
using (true);

drop policy if exists "public insert ratings" on ratings;
drop policy if exists "public update ratings" on ratings;
drop policy if exists "public delete ratings" on ratings;

-- FINALIZE_RECEIPTS: public read, no direct writes
alter table finalize_receipts enable row level security;

drop policy if exists "public read receipts" on finalize_receipts;
create policy "public read receipts"
on finalize_receipts for select
using (true);

drop policy if exists "public insert receipts" on finalize_receipts;
drop policy if exists "public update receipts" on finalize_receipts;
drop policy if exists "public delete receipts" on finalize_receipts;