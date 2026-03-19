# 1MGAMING Platform Architecture — Phase 6

## Product Types

| Product | Commission | Source | Execution |
|---------|-----------|--------|-----------|
| Polymarket Predictions | 2% (200bps) | `polymarket` | User-authenticated CLOB orders + CTF redemption |
| Native 1MGAMING Predictions | 5% (500bps) | `manual` | Local pool + admin lifecycle |
| PvP Skill Games (USDC/POL) | 5% (500bps) | N/A | Polygon smart contracts (future) |
| Free Games vs AI | 0% | N/A | Client-side, no wallet required |

## Shared Infrastructure
- **Auth**: Privy (one account, one EVM wallet on Polygon)
- **Database**: Supabase (prediction_events, prediction_fights, prediction_entries)
- **Admin**: Single admin UI with source-type filters and badges
- **Content**: Enrichment layer (logos, photos, explainer cards, stats_json)

## Trading Auth Architecture

### User vs Builder Wallet Separation
- **User wallet**: Used for Polymarket CLOB trading identity (EIP-712 signing)
- **Builder wallet**: Platform attribution only (gas sponsorship, NOT trading)
- **Credentials**: Derived server-side from user's wallet signature, stored in `polymarket_user_sessions`

### Auth Flow
```
User signs SIWE message → polymarket-auth derives credentials → stored in DB
                                                                      ↓
prediction-submit reads user's PM session → places order using USER's creds
                                                                      ↓
polymarket-positions syncs user holdings → cached in polymarket_user_positions
                                                                      ↓
prediction-claim checks source → Polymarket: CTF redemption | Native: local pool
```

### Key Tables
- `polymarket_user_sessions` — Server-side only. User's PM API credentials (never exposed to frontend)
- `polymarket_user_positions` — Cached user positions (public read for UI display)

## Commission Logic
- Lives on `prediction_fights.commission_bps` column
- Set at fight creation: 200 for polymarket imports, 500 for native
- Read in `prediction-submit` for fee calculation
- Displayed in frontend via `getFeeRate(fight)` / `getFeeLabel(fight)`

## Status Lifecycle

```
open → locked → live → result_selected → confirmed → settled
                  └→ draw → refund_pending → refunds_processing → refunds_complete
                  └→ cancelled
```

## Edge Functions

### Prediction Flow
- `prediction-submit` — Source-aware commission + user-authenticated order routing
- `prediction-claim` — Polymarket CTF redemption vs native pool payout
- `prediction-admin` — Full lifecycle + sets source/commission on createFight
- `prediction-feed` — Public prediction data

### Polymarket Integration
- `polymarket-auth` — User wallet-based credential derivation (SIWE → API creds)
- `polymarket-positions` — User position sync from Polymarket Data API
- `polymarket-sync` — Idempotent Gamma API sync (sets commission_bps=200)
- `polymarket-prices` — CLOB price refresh (public, no auth)

### Automation
- `prediction-schedule-worker` / `prediction-result-worker` / `prediction-settle-worker`
- `prediction-refund-worker` — Draw refund execution
- `prediction-ingest` — Multi-provider event ingestion

## Blockers

### Full Polymarket User Trading (Production)
1. ✅ polymarket_user_sessions table created
2. ✅ polymarket-auth edge function created
3. ✅ prediction-submit routes through user credentials
4. ✅ prediction-claim has Polymarket CTF redemption path
5. ✅ polymarket-positions syncs user holdings
6. ⬜ Configure POLYMARKET_API_KEY, API_SECRET, PASSPHRASE secrets
7. ⬜ Implement signature verification in polymarket-auth (ethers/viem)
8. ⬜ Implement EIP-712 order signing in prediction-submit
9. ⬜ CTF allowance setup for user wallets on Polygon
10. ⬜ Live CLOB order submission (currently deferred)
11. ⬜ Live CTF redemption in prediction-claim

### Polygon USDC/POL PvP Games
1. Deploy PvP smart contract on Polygon (escrow + settlement)
2. Migrate game room creation to use USDC/POL stakes
3. Update settlement to call Polygon contract instead of Solana program
4. Keep Solana path isolated for legacy games

## Next Prompts

### Prompt 1: Production Polymarket Trading
> "Complete Polymarket user trading for production: (1) Add POLYMARKET_API_KEY, API_SECRET, and PASSPHRASE secrets via add_secret. (2) Implement SIWE signature verification in polymarket-auth using viem/ethers. (3) Implement EIP-712 order signing in prediction-submit using the user's derived trading key. (4) Connect polymarket-positions to the Polymarket Data API for live position sync. (5) Implement CTF redemption in prediction-claim via the Polygon CTF contract. (6) Add CTF allowance check/setup in polymarket-auth."

### Prompt 2: Polygon USDC/POL Skill Games
> "Migrate skill-based PvP games to Polygon: (1) Design a simple Polygon escrow contract for USDC/POL stakes. (2) Update CreateRoom to accept USDC/POL amounts via Privy wallet. (3) Update settle-game to call the Polygon contract instead of Solana program. (4) Keep the existing Solana game paths isolated but functional. (5) Apply 5% commission in the settlement contract."
