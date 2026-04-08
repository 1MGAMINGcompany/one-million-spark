

# Fix: Migrate polymarket-user-setup to V2 PROXY Flow

## Problem
The `derive_and_setup` action calls `POST /relayer/deploy` and `POST /relayer/execute` on the V2 relayer. These are V1 endpoints that no longer exist, returning 404. This is the direct cause of the "unexpected error" when pressing Set Up.

## What Changes

### File: `supabase/functions/polymarket-user-setup/index.ts`

**Remove** two functions entirely:
- `deploySafeViaRelayer` (lines 204-256) -- calls deprecated `/relayer/deploy`
- `setApprovalsViaRelayer` (lines 259-328) -- calls deprecated `/relayer/execute`

**Rewrite** the `derive_and_setup` action (lines 442-638) to skip Safe deployment and approvals:

1. Derive trading key from signature (unchanged)
2. Derive CLOB API credentials (unchanged)
3. Mark `safe_deployed: true` and `approvals_set: true` optimistically -- V2 PROXY handles both automatically on first transaction
4. Save session and return success

The key insight: with V2 PROXY, there is no separate deploy or approval step. The relayer auto-deploys and auto-approves when the first trade is submitted. We just need the derived key and CLOB credentials.

### File: `src/components/predictions/EnableTradingBanner.tsx`

Show the raw backend error message as fallback when no translation key matches, instead of a generic "An unexpected error occurred".

## No Other Files Change

The `check_status` and `withdraw` actions remain unchanged. Frontend hooks (`usePolymarketSession.ts`) already handle the response shape correctly.

## Result
Pressing "Set Up Trading Wallet" will derive the key, get CLOB credentials, save the session, and return success -- no relayer calls needed. The wallet auto-deploys on first trade.

