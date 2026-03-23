
1. Fix the blocker first: `supabase/functions/polymarket-sync/index.ts` is not booting at all. The edge logs show a compile-time failure:
   - `Identifier 'results' has already been declared`
   - This explains the UI error “Failed to send a request to the Edge Function” for every Polymarket admin button.

2. Remove the duplicate `results` declarations in the Polymarket sync handler.
   - In the URL preview branch, `let results: GammaEvent[] = []` is declared, then later `const { accepted: results, ... } = filterFixtures(...)` redeclares it in the same scope.
   - Audit the other action branches too and standardize naming so preview state and filtered output never collide.

3. Harden the edge function so admin actions fail gracefully instead of looking like transport failures.
   - Keep CORS headers on every response path.
   - Return explicit error payloads from `catch` using `err.message || err.toString() || JSON.stringify(err)`.
   - This will make future failures visible in the admin UI instead of appearing as generic edge-function request errors.

4. After the compile fix, correct the post-fetch filtering that is hiding valid FIFA Friendlies and other sports data.
   - Keep tag/event-based retrieval as-is.
   - Update fixture detection to inspect all relevant payload fields: event title, slug, question, and market question/title fields.
   - Separate browse-mode filtering from exact-search filtering so league collections are not filtered with exact-match rules.
   - Keep past-event rejection, but do not reject missing `startDate`; show those with a warning badge.

5. Relax browse-mode safety filters to match the actual Polymarket payload structure.
   - Exclude only clear non-core items: `More Markets`, `Winning Method`, `method of victory`, `total rounds`, `spread`, `moneyline alt`.
   - Do not reject a whole event just because the top-level title is not a clean `A vs B` string if child markets contain the matchup.
   - Preserve sports-only scope so politics/economy items still never appear in this admin flow.

6. Improve debug visibility in the admin panel.
   - Keep the temporary “Show raw results” toggle.
   - When `raw_results > 0` and `filtered_results = 0`, always show:
     - raw sample payloads
     - rejection reasons summary
     - the message: “Data found from Polymarket, but local filters rejected all results.”
   - This will make FIFA Friendlies debugging straightforward.

7. Verify all 3 admin modes after the fix.
   - URL Import: `/event/{slug}`, `/sports/{league}/games`, `/sports/{league}/{event}`
   - Browse League: especially FIFA Friendlies and Boxing
   - Exact Search: exact matchup names only, with league/category queries redirected to Browse League

8. Expected outcome after implementation:
   - Buttons stop throwing edge-function request failures.
   - FIFA Friendlies browse returns preview cards instead of zeroing out 110 raw results.
   - Boxing and exact search return valid preview candidates when Polymarket has matching sports events.
   - Imports continue landing in `pending_review` only.
