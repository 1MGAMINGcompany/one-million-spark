
Goal: fix the Match Center so soccer markets show team names/logos instead of Yes/No + boxing gloves, and make live Polymarket volume/liquidity actually appear.

What I found
1. The live refresh hook exists (`usePolymarketPrices`) but is not mounted in `FightPredictions.tsx`, so the `polymarket-prices` backend function is likely never being called from the predictions page. That matches the data: the Villarreal rows still have `polymarket_volume_usd = 0`, `pool_a_usd = 0`, `pool_b_usd = 0`, and stale `polymarket_last_synced_at`.
2. The soccer Match Center row for your screenshot still has:
   - `fighter_a_name = "Yes"`
   - `fighter_b_name = "No"`
   - `home_logo = null`
   - `away_logo = null`
   So the UI cannot show team names/logos yet because the underlying record was never enriched.
3. The current “Yes/No replacement” logic in `MatchCenter.tsx` is too weak for 3-way soccer markets. For Villarreal / Draw / Real Sociedad:
   - fight title is only `Villarreal CF`
   - replacing both Yes and No from that title is wrong
   - the page needs names derived from event context, not just from the fight title
4. The `polymarket-prices` function currently only backfills one generic image (`fighter_a_photo`) from Gamma. That does not populate `home_logo` / `away_logo`, so soccer detail pages still fall back visually.
5. The boxing glove fallback in the screenshot is consistent with stale data plus incomplete name/logo enrichment. Even though `detectSport()` is correct in code, the Match Center still renders a combat-style experience when the soccer-specific display inputs are missing.

Implementation plan
1. Turn on live Polymarket refresh on the predictions experience
   - Mount `usePolymarketPrices()` inside `FightPredictions.tsx`
   - Keep it scoped to predictions only
   - This ensures the existing 45s refresh cycle actually runs in production and updates prices, volume, and derived liquidity

2. Fix the Polymarket refresh backend so it enriches soccer rows properly
   - Update `supabase/functions/polymarket-prices/index.ts` to:
     - keep fetching `volumeNum` from Gamma `/markets/{polymarket_market_id}`
     - continue storing `polymarket_volume_usd`, `pool_a_usd`, `pool_b_usd`
     - also derive better display metadata for soccer markets
   - For soccer/futbol events:
     - parse home/away team names from `event_name` (`Team A vs. Team B`)
     - use those parsed names to backfill missing `home_logo` / `away_logo` via the existing enrichment provider flow
     - avoid writing only a single generic `fighter_a_photo` for soccer

3. Add a robust outcome-label resolver for Polymarket binary + 3-way soccer
   - Create a shared helper for Match Center / cards:
     - if market is binary “Yes/No” and title is a team/player proposition, map:
       - Yes → fight title
       - No → “Not {fight title}” for generic props, or infer opponent when event context provides one
     - if event is soccer and event name is `A vs. B`:
       - title `A` means market = “A to win”
       - title `B` means market = “B to win”
       - title starting with `Draw` means market = “Draw”
   - Use this resolver in both `FightCard.tsx` and `MatchCenter.tsx`
   - Result: no more raw Yes/No labels on soccer detail pages

4. Fix Match Center rendering to be soccer-first when the event is futbol
   - In `MatchCenter.tsx`:
     - use parsed team names from `event_name` as the primary matchup header for soccer
     - if the market is a specific outcome market, show the market title clearly as the bet thesis
     - use soccer ball/logo fallback instead of boxing gloves unconditionally for soccer events
     - show “Live Market Volume” and “Estimated Liquidity Per Side” as separate labels so the values make sense
   - If logos are missing, fallback should be:
     - team initials or soccer ball
     - never boxing gloves

5. Surface volume where users expect it
   - On Match Center:
     - show `polymarket_volume_usd` prominently near the odds block
     - label it exactly as market volume, not local pool
   - On cards:
     - keep the per-side estimated liquidity display
     - add the total market volume line in the center badge area
   - This matches the Polymarket screenshot expectation more closely

6. Backfill currently broken soccer rows
   - Add a safe re-enrichment path so existing imported soccer fights get:
     - proper team names
     - home_logo / away_logo
     - refreshed volume/liquidity
   - This should target only open/live/locked Polymarket soccer fights, not unrelated systems

7. QA focus after implementation
   - Verify `/predictions` now triggers price refresh automatically
   - Verify the Villarreal markets update from zero volume to live volume
   - Verify Match Center for Villarreal shows:
     - soccer icons/logos instead of boxing gloves
     - team names instead of Yes/No
     - visible volume
     - visible estimated liquidity per side
   - Verify combat and over/under markets still keep their current behavior

Technical notes
- The DB already confirms the problematic rows exist and are still stale:
  - `5487826c-a3a6-44b4-9f93-5eebc820d112` → title `Villarreal CF`, names `Yes/No`, no logos, zero volume
  - related rows exist for `Real Sociedad de Fútbol` and `Draw (...)`
- This means the issue is not just styling; it is a combination of:
  - refresh not running
  - incomplete enrichment
  - weak outcome-name mapping
- I would keep this surgical:
  - no broad prediction refactor
  - no changes to unrelated game systems
  - only predictions page, Match Center, and the Polymarket refresh/enrichment path
