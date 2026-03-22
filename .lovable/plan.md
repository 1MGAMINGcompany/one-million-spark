
## Plan: Import Actual Soccer Match Fixtures, Not Futures Markets

### What I found
- The sync is now search-based, but the soccer queries are still too broad: `"MLS"`, `"EPL"`, `"La Liga"`, etc.
- Those broad queries return futures markets like:
  - `2026 FIFA World Cup Winner`
  - `MLS Cup Winner 2026`
- The current sync imports **all markets** from each future event it finds. It does **not** require that the event is an actual match fixture.
- Your database already contains junk from this:
  - `2026 FIFA World Cup Winner` → 60 markets
  - `MLS Cup Winner 2026` → 31 markets
- The actual match structure you want does exist in the backend for some soccer events:
  - example: `Club Atlético de Madrid vs. Real Sociedad de Fútbol`
- So the real issue is **discovery + filtering**, not that the app cannot support soccer matches.

### Why you can see games on the Polymarket website but not add them here
The website is showing exact fixture pages, but the admin sync is using broad search discovery. Broad search finds league-winner and tournament-winner markets first, not actual Team A vs Team B fixtures. So your admin tool is pulling the wrong soccer content before it ever reaches import.

### Changes

**1. Tighten soccer ingestion to actual fixtures only**
Update `supabase/functions/polymarket-sync/index.ts` so soccer import only accepts events that look like real matches:
- Require event title to contain `vs` / `vs.`
- Reject futures-style titles like:
  - `winner`
  - `to win`
  - `cup winner`
  - `league winner`
  - `top scorer`
  - `relegated`
  - `promoted`
- Keep combat logic looser so MMA/boxing cards still import normally

**2. Make soccer search queries fixture-focused**
Replace broad soccer discovery with more fixture-oriented queries, for example:
- `soccer vs`
- `football vs`
- `Premier League vs`
- `La Liga vs`
- `Serie A vs`
- `Bundesliga vs`
- `Denmark Superliga vs`
- `Norway Eliteserien vs`
This biases discovery toward real matches like the ones you showed.

**3. Add direct import from Polymarket event URL / slug / ID**
Extend the admin panel so you can paste a Polymarket event link or ID from the website and import that exact event directly.
This avoids relying only on discovery when you already found the correct match on Polymarket.

**4. Clean out existing futures junk**
During sync, automatically mark existing imported soccer futures as cancelled/inactive when they are clearly not fixtures.
This will remove the leftover World Cup winner / MLS Cup winner noise from the admin list.

**5. Keep future-only filtering**
Retain the existing rule that imported events must be more than 24 hours in the future, so you don’t get today/yesterday clutter.

### Files to update

| File | Change |
|------|--------|
| `supabase/functions/polymarket-sync/index.ts` | Add fixture-only soccer filter, improve soccer search terms, support direct event/slug import, clean existing futures markets |
| `src/pages/FightPredictionAdmin.tsx` | Add direct import input for Polymarket URL/slug/ID in the admin sync panel |

### Result
After this change:
- Soccer sync will prioritize **actual upcoming matches**
- Futures markets like “World Cup Winner” and “MLS Cup Winner” will stop polluting the admin
- If you see a real game on Polymarket, you’ll be able to paste its link and import that exact game directly
