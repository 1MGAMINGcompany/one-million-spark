
Goal: fix missing sports inventory without disturbing payments, auth, routing, theming, prediction flow, or current operator-event rules.

Audit summary
- This is not mainly a `/demo` UI issue now. `demo` has no sport restrictions (`allowed_sports` is empty), so missing NHL/cricket is coming from import coverage.
- Current automated import runs only once per day: cron job `daily-polymarket-import` at `06:00 UTC`.
- NHL import is incomplete in the database: there are 77 NHL rows, but all are dated Apr 11–17. That means current-week NHL games were never captured.
- Cricket import is also incomplete: database currently has only 14 cricket rows, all from `cricipl` (IPL). No PSL/intl/other cricket leagues are present.
- Esports is not fully wired end-to-end: there are only 2 `cs2` rows, and they are not surfaced because esports is not in the operator sport allowlist / broad-sport mapping.
- Import quality is also wrong for some sports: current importer can select bad submarkets like cricket `-toss-winner`, `-completed-match`, and esports `-game1` because the winner-market filter is too loose.

Recommended implementation order
1. Harden the importer first
2. Expand sport/league coverage
3. Increase import cadence to 4x/day
4. Run a targeted backfill
5. Add lightweight health checks so we know when a sport stops importing

Plan

1) Harden `polymarket-sync` market selection before adding more leagues
- File: `supabase/functions/polymarket-sync/index.ts`
- Tighten `findWinnerMarket` / fixture filtering so we only import true match-winner or series-winner markets.
- Explicitly reject known bad submarkets by question/slug, including:
  - cricket: toss winner, completed match, top batter/bowler, innings props
  - esports: game1/map1/map2/round props/kills
  - similar non-match props in other sports
- Keep the existing winner-only and anti-prop safety model; just make it stricter and sport-aware.

Why first:
- Right now adding more cricket/esports sources without this hardening will import more bad inventory, not better inventory.

2) Expand source coverage for missing sports/leagues
- File: `supabase/functions/polymarket-sync/index.ts`
- Add esports as a real source category, starting with Counter-Strike (`cs2`) using safe search/tag discovery.
- Expand cricket source catalog beyond the current 4 keys:
  - keep IPL / PSL / international
  - add the additional cricket leagues/series we want to track as separate sources
- Review NHL fetch path and make sure we have both:
  - the main league source
  - a reliable fallback if `/sports` series resolution misses current boards
- Preserve existing soccer/combat behavior.

3) Add sport + league mappings so imported events land in the right UI buckets
- Files:
  - `src/lib/operatorSportRules.ts`
  - `src/lib/sportLeagues.ts`
- Add `ESPORTS` to the operator allowlist and broad-sport system.
- Map `cs2` to:
  - sport: `ESPORTS`
  - league: `Counter-Strike`
- Add cricket league slug mappings so cricket is subdivided like soccer instead of collapsing into “Other”.
- Add any missing league prefixes already seen in data so future imports don’t fall into bad/unknown buckets.

4) Increase automated monitoring of Polymarket to 4x per day
- Backend scheduler change only; no UI redesign.
- Replace the current once-daily run with every 6 hours (4 runs/day).
- This is important because same-day markets can appear and close between daily runs; that is likely why current-week NHL was missed.
- Keep using the same import function so behavior stays consistent; only change cadence.

5) Backfill missed inventory after the importer is hardened
- After the code changes are in place, run targeted catch-up imports for:
  - NHL
  - cricket leagues
  - esports / Counter-Strike
- This fills the gap immediately instead of waiting for future scheduled runs.
- Do this with the same import pipeline, not a separate custom path, so the data quality stays consistent.

6) Keep operator app behavior safe and shared everywhere
- Shared app file remains `src/pages/platform/OperatorApp.tsx`, so the result applies to `/demo`, all current operator apps using the shared flow, and future operator apps.
- Keep:
  - operator-created events first
  - current visibility windows
  - current validation against Yes/No and props
  - theming and routing untouched
- I also recommend raising the operator query budget safely for the shared app:
  - keep the date floor
  - exclude obvious props server-side
  - use a higher row cap so expanded inventory is not crowded out

7) Make future operators ready without forcing existing operators into new sports
- Files:
  - `src/pages/platform/OperatorOnboarding.tsx`
  - `supabase/functions/operator-manage/index.ts`
- Add esports to onboarding/admin sport options so future operators can enable it cleanly.
- Do not mass-edit existing operators’ `allowed_sports` as part of this fix; that is riskier business behavior.
- Result:
  - `/demo` and unrestricted operators get the expanded inventory automatically
  - operators with curated sport lists keep their current settings unless we explicitly update them later

8) Add light import health visibility
- Use existing automation logs to record per-run counts by source/league.
- Flag “0 accepted events” for priority feeds like NHL, cricket, and esports so we notice breaks quickly.
- This gives you a practical way to “watch Polymarket 4 times a day” without changing the front end.

Files likely involved
- `supabase/functions/polymarket-sync/index.ts`
- `src/lib/operatorSportRules.ts`
- `src/lib/sportLeagues.ts`
- `src/pages/platform/OperatorApp.tsx`
- `src/pages/platform/OperatorOnboarding.tsx`
- `supabase/functions/operator-manage/index.ts`
- possibly `src/pages/platform/PlatformAdmin.tsx` for manual browse/import visibility

What this plan fixes
- NHL current-week gaps caused by too-infrequent import runs
- Cricket being under-imported and poorly divided
- Esports existing in concept but not fully flowing into operator apps
- Bad submarkets being imported as if they were real matchups
- Future inventory gaps by moving from daily polling to 4x/day

What this plan will not change
- Payments
- Privy auth
- Routing
- operator theming
- prediction placement flow
- operator-created event priority / grace behavior
- the core “matchups only, no props” rule

Technical note
- The biggest hidden issue is not just “missing leagues”; it is import quality. The current importer is already bringing in cricket toss/completed-match rows and CS2 game-level rows. So the safe path is: harden selection first, then widen coverage, then schedule 4x/day, then backfill.
