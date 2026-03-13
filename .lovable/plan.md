

# Fight Prediction System for 1MGAMING

## Overview
Build a complete fight prediction market system where users predict fight outcomes using SOL. The system uses share-based pools, live odds, a 5% platform fee, and admin-controlled fight lifecycle (create → lock → resolve → claim).

## Architecture

### Database (Lovable Cloud migrations)

**Table: `prediction_fights`**
- `id` uuid PK
- `title` text (e.g. "Main Event")
- `fighter_a_name` text
- `fighter_b_name` text
- `pool_a_lamports` bigint default 0
- `pool_b_lamports` bigint default 0
- `shares_a` bigint default 0
- `shares_b` bigint default 0
- `status` text default 'open' (open | locked | resolved)
- `winner` text nullable (fighter_a | fighter_b)
- `resolved_at` timestamptz nullable
- `claims_open_at` timestamptz nullable (resolved_at + 5 min)
- `event_name` text (e.g. "Silvertooth Promotions")
- `created_at`, `updated_at`
- RLS: public SELECT, deny client writes

**Table: `prediction_entries`**
- `id` uuid PK
- `fight_id` uuid FK → prediction_fights
- `wallet` text
- `fighter_pick` text (fighter_a | fighter_b)
- `amount_lamports` bigint (total sent)
- `fee_lamports` bigint
- `pool_lamports` bigint (amount after fee)
- `shares` bigint
- `claimed` boolean default false
- `reward_lamports` bigint nullable
- `created_at`
- RLS: public SELECT, deny client writes

**Table: `prediction_admins`**
- `wallet` text PK
- RLS: public SELECT

### Edge Functions

1. **`prediction-submit`** — User submits prediction
   - Validates: fight is open, amount >= 0.05 SOL, wallet connected
   - Calculates 5% fee, pool contribution, shares
   - Verifies SOL transfer tx (fee to treasury, pool to vault PDA)
   - Inserts entry, updates fight pool/shares totals
   - Returns entry details

2. **`prediction-admin`** — Admin actions
   - `createFight` — inserts new fight
   - `lockPredictions` — sets status=locked
   - `resolveFight` — sets winner, resolved_at, claims_open_at = now()+5min
   - `setTreasury` — updates treasury wallet in config
   - Validates caller wallet is in prediction_admins

3. **`prediction-claim`** — User claims reward
   - Validates: fight resolved, claims_open_at passed, user has winning shares, not already claimed
   - Calculates reward: `(user_shares / total_winning_shares) * total_pool`
   - Sends SOL from vault to user
   - Marks entry as claimed

4. **`prediction-feed`** — Returns recent prediction entries for live feed
   - Public read, returns latest 50 entries with wallet (truncated) and amounts

### Frontend

**New page: `src/pages/FightPredictions.tsx`** — Route: `/predictions`
- Displays event name + all fight cards
- Each fight card shows:
  - Fight title, Fighter A vs Fighter B
  - Pool sizes (SOL), live odds (calculated from pools)
  - "Predict" buttons for each fighter
- Prediction input panel (drawer/modal):
  - Amount input (SOL)
  - Breakdown: prediction amount, platform fee (5%), pool contribution, estimated reward
  - "Submit Prediction" button
- Live activity feed (realtime via Supabase channel on prediction_entries)
- Claim reward button (visible when fight resolved + user has winning shares)

**New page: `src/pages/FightPredictionAdmin.tsx`** — Route: `/predictions/admin`
- Create fight form
- Lock / Resolve buttons per fight
- Only visible to admin wallets

### Route additions in `App.tsx`
```
/predictions → FightPredictions
/predictions/admin → FightPredictionAdmin
```

### SOL Flow (On-chain)
Predictions use direct SOL transfers (not the existing gaming program) since the gaming program's room model doesn't fit prediction pools. The edge functions handle:
- Verifying the user's transfer tx to treasury (fee) and vault (pool contribution)
- Sending rewards from vault to winners on claim

The vault will be a server-controlled wallet (edge function keypair) since the existing Anchor program doesn't have prediction pool instructions. This mirrors the existing `settle-game` pattern where the verifier keypair manages payouts.

### Terminology enforcement
All UI copy uses: prediction, prediction amount, prediction pool, potential reward, prediction market. Never: bet, betting, gambling, wager, sportsbook.

### Live Odds Formula
```
total_pool = pool_A + pool_B
odds_A = total_pool / pool_A
odds_B = total_pool / pool_B
```
Displayed as multipliers (e.g. "2.4x"). Updated in real-time via Supabase realtime on `prediction_fights`.

## Implementation Order
1. Database migrations (tables + RLS + realtime)
2. Edge functions (submit, admin, claim, feed)
3. Frontend prediction page with fight cards + odds
4. Prediction input panel with fee breakdown
5. Live activity feed
6. Admin page
7. Claim flow
8. Add nav link + route

## Seed Data
Pre-populate the Silvertooth Promotions card:
- Daniel Cabrera vs Nic Leboeuf (Main Event)
- Jacob Caron vs Kevin Franco-Flores
- John Deidouss vs Varinder Sidhu
- Yazane Elmoubtahil vs Derrel Perreira

