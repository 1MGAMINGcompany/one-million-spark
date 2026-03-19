# 1MGAMING Platform Architecture — Phase 5

## Product Types

| Product | Commission | Source | Execution |
|---------|-----------|--------|-----------|
| Polymarket Predictions | 2% (200bps) | `polymarket` | Polymarket CLOB + CTF redemption |
| Native 1MGAMING Predictions | 5% (500bps) | `manual` | Local pool + admin lifecycle |
| PvP Skill Games (USDC/POL) | 5% (500bps) | N/A | Polygon smart contracts (future) |
| Free Games vs AI | 0% | N/A | Client-side, no wallet required |

## Shared Infrastructure
- **Auth**: Privy (one account, one EVM wallet on Polygon)
- **Database**: Supabase (prediction_events, prediction_fights, prediction_entries)
- **Admin**: Single admin UI with source-type filters and badges
- **Content**: Enrichment layer (logos, photos, explainer cards, stats_json)

## Separated Concerns
- **Commission**: `commission_bps` column on `prediction_fights` (200 for polymarket, 500 for native)
- **Execution**: Source-aware routing in `prediction-submit` and `prediction-claim`
- **Settlement**: Polymarket = redemption_pending; Native = local pool payout
- **Skill Games**: Completely separate tables (game_sessions, matches, game_moves)

## Status Lifecycle

```
open → locked → live → result_selected → confirmed → settled
                   └→ draw → refund_pending → refunds_processing → refunds_complete
                   └→ cancelled
```

## Database Tables
- `prediction_events` — Parent event grouping + automation + enrichment (featured, category, enrichment_notes)
- `prediction_fights` — Individual markets with source-aware commission_bps, enrichment (fighter photos, stats_json, explainer_card, featured)
- `prediction_entries` — User prediction records with polymarket_order_id tracking
- `prediction_admins` — Authorized admin wallets
- `prediction_settings` — Global kill switches
- `automation_jobs` / `automation_logs` — Job-based automation
- `polymarket_sync_state` — Sync tracking

## Edge Functions
- `prediction-submit` — Source-aware commission (reads fight.commission_bps)
- `prediction-claim` — Polymarket vs local claim paths
- `prediction-admin` — Full lifecycle + sets source/commission on createFight
- `polymarket-sync` — Idempotent Gamma API sync (sets commission_bps=200)
- `polymarket-prices` — CLOB price refresh
- `prediction-refund-worker` — Draw refund execution
- `prediction-ingest` — Multi-provider event ingestion
- `prediction-schedule-worker` / `prediction-result-worker` / `prediction-settle-worker` — Automation

## Blockers

### Full Polymarket User Trading
1. Configure POLYMARKET_API_KEY, API_SECRET, PASSPHRASE secrets
2. Implement EIP-712 order signing in prediction-submit
3. CTF allowance setup for builder wallet on Polygon
4. User position sync from Polymarket Data API
5. CTF redemption in prediction-claim

### Polygon USDC/POL PvP Games
1. Deploy PvP smart contract on Polygon (escrow + settlement)
2. Migrate game room creation to use USDC/POL stakes
3. Update settlement to call Polygon contract instead of Solana program
4. Keep Solana path isolated for legacy games

## Next Prompts

### Prompt 1: Polymarket User Trading
> "Implement authenticated Polymarket CLOB trading: (1) Add POLYMARKET_API_KEY, API_SECRET, and PASSPHRASE secrets. (2) Implement EIP-712 order signing in prediction-submit using the builder wallet. (3) Add position sync from Polymarket Data API to reconcile user holdings. (4) Connect prediction-claim to CTF redemption on Polygon. (5) Add a WebSocket price listener edge function for real-time orderbook updates."

### Prompt 2: Polygon USDC/POL Skill Games
> "Migrate skill-based PvP games to Polygon: (1) Design a simple Polygon escrow contract for USDC/POL stakes. (2) Update CreateRoom to accept USDC/POL amounts via Privy wallet. (3) Update settle-game to call the Polygon contract instead of Solana program. (4) Keep the existing Solana game paths isolated but functional. (5) Apply 5% commission in the settlement contract."
