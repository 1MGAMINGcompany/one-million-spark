

## Image & Data Enrichment Audit + Match Center Enhancement

### Current State — Image Audit

From the database audit of all active markets:

| Market | Fighter A Photo | Fighter B Photo | Issue |
|--------|:-:|:-:|-------|
| Evloev vs Murphy | ✅ | ✅ | OK |
| Mason Jones vs Axel Sola | ✅ | ✅ | OK |
| Sutherland vs Pericic | ✅ | ❌ | Pericic missing |
| Villarreal vs Real Sociedad | ✅ (logos) | ✅ (logos) | OK — but "Yes/No" names not resolved |
| All prop markets (O/U, KO/TKO, Draw) | ❌ | ❌ | No images — should inherit parent fight images |

**Root causes:**
1. Prop markets (O/U rounds, KO/TKO, Draw) share the same `event_name` as the parent fight but have no images because their fighter names are "Yes/No/Over/Under" — the enrichment logic skips these.
2. Some fighters (Pericic) aren't found in any API.
3. Soccer prop markets show "Yes/No" instead of team names.

### Unused Polymarket Data

The Gamma API provides fields we're currently ignoring:

| Field | What it gives us | Currently used? |
|-------|-----------------|:-:|
| `liquidity` | Real-time order book depth (USDC) | ❌ |
| `volume24hr` | 24-hour trading volume | ❌ |
| `startDate` | When market opened for trading | ❌ |
| `competitive` | How close odds are to 50/50 | ❌ |
| `icon` / `image` (event-level) | Event banner/thumbnail | ❌ (only market-level) |
| `description` (event-level) | Event context/rules | Partial |
| `fee` | Polymarket's fee rate | ❌ |
| `enableOrderBook` | Whether CLOB is active | ❌ |
| `tokens[].outcome` | Canonical outcome labels | ❌ |
| `tags` | Category labels (sports, mma, etc.) | ❌ |

### Plan

#### 1. Fix prop market image inheritance
In `polymarket-prices`, when a fight has "Yes/No/Over/Under" names, look up sibling fights from the same `event_name` that DO have images, and copy `fighter_a_photo`/`fighter_b_photo` from the parent fight. This immediately fixes ~60% of missing images.

#### 2. Use Gamma event image as universal fallback
Fetch the parent event from Gamma (`/events/{polymarket_event_id}`) and use its `image` field as `event_banner_url` on the `prediction_events` table. Display this banner in the Match Center header when no fighter-specific photos exist.

#### 3. Store new Gamma fields
Add columns to `prediction_fights` via migration:
- `polymarket_liquidity` (numeric) — real-time liquidity depth
- `polymarket_volume_24h` (numeric) — 24-hour volume
- `polymarket_start_date` (timestamptz) — market open date
- `polymarket_competitive` (numeric) — competitiveness score
- `polymarket_fee` (text) — exchange fee rate

Update the price refresh loop to populate these from the Gamma `/markets/{id}` response (data already fetched, just not stored).

#### 4. Enrich Match Center UI
Add new sections to the Details & Odds view:

**About tab additions:**
- Market open date (from `polymarket_start_date`)
- Event banner image at top of card
- Category tags from event

**Odds tab additions:**
- "Liquidity Depth" row showing real-time USDC available
- "24h Volume" row showing recent activity
- "Market Competitiveness" indicator (how balanced the odds are)
- "Exchange Fee" from Polymarket
- Order book spread visualization (bid/ask bar)

**New "Stats" tab** (replacing inline stats):
- For MMA: pull fighter records from Gamma description parsing or BallDontLie
- For Soccer: display team form from event context
- Show market age (days since opened)
- Show total unique traders count (if available from Data API)

#### 5. Immediate re-enrichment
Run a one-time SQL update to clear stale/missing photos on prop markets, triggering the new inheritance logic on next price refresh cycle.

### Technical Details

**Files to modify:**
- `supabase/functions/polymarket-prices/index.ts` — Add sibling image inheritance, store new Gamma fields
- `src/pages/MatchCenter.tsx` — Display new data fields, event banner, liquidity depth, 24h volume
- New migration — Add `polymarket_liquidity`, `polymarket_volume_24h`, `polymarket_start_date`, `polymarket_competitive`, `polymarket_fee` columns

**Performance:** No new API calls needed — the Gamma `/markets/{id}` response already contains `liquidity`, `volume24hr`, `startDate`, `competitive`, `fee`; we just need to read and store them. Image inheritance queries the local DB only.

