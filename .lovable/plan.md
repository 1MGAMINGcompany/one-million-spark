
# Fix Room Creation Error & Recover Funds Edge Function

## Issues Identified

### Issue 1: Room Creation - "No blocking/active room detected in state"

**What the user sees**: Red toast error "Action not available - No blocking/active room detected in state" when trying to create a room from mobile wallet browser.

**Root Cause**: The transaction simulation (`simulateTransaction`) is failing before the wallet popup appears. When simulation fails with `TX_SIMULATION_FAILED`, the code checks for blocking rooms and if none exist, shows this confusing fallback message.

**Why simulation might fail on mobile**:
1. RPC connection issues (mobile networks can be unstable)
2. The simulation response may not be parsed correctly
3. Account data fetch may fail silently

**Fix Strategy**:
1. Improve error handling to show actual simulation error instead of generic "No blocking/active room" message
2. Add simulation logs to the error toast for debugging
3. Add retry logic for RPC failures

### Issue 2: Recover Funds - "Edge Function returned a non-2xx status code"

**What the user sees**: Yellow banner "Edge Function returned a non-2xx status code" when clicking "Recover Funds" button.

**Root Cause**: The `recover-funds` edge function uses the old `VERIFIER_SECRET_KEY` but this key doesn't match the on-chain config verifier anymore:
- On-chain expected: `HrQiwW3WZXdDC8c7wbsuBAw2nP1EVtzZyokp7xPJ6Wjx`
- Current secret produces: `CGBrEHnsdcvigyibF5WNwdcYsP2qyFEJeEC5GvgsTgGD`

**Edge Function Logs**:
```
[recover-funds] Verifier mismatch! {
  expected: "HrQiwW3WZXdDC8c7wbsuBAw2nP1EVtzZyokp7xPJ6Wjx",
  actual: "CGBrEHnsdcvigyibF5WNwdcYsP2qyFEJeEC5GvgsTgGD"
}
```

**Fix Strategy**: Update `recover-funds` edge function to use `VERIFIER_SECRET_KEY_V2` instead of `VERIFIER_SECRET_KEY`, matching the pattern used by other edge functions (`settle-game`, `forfeit-game`, `sweep-orphan-vault`, `settle-draw`).

---

## Implementation Plan

### Part 1: Fix recover-funds Edge Function

**File: `supabase/functions/recover-funds/index.ts`**

Change line 327 from:
```typescript
const verifierSecretKey = Deno.env.get("VERIFIER_SECRET_KEY");
```

To:
```typescript
const verifierSecretKey = Deno.env.get("VERIFIER_SECRET_KEY_V2") || Deno.env.get("VERIFIER_SECRET_KEY");
```

Also update error messages to reference V2:
```typescript
console.error("[recover-funds] VERIFIER_SECRET_KEY_V2 not configured");
```

### Part 2: Improve Room Creation Error Messages

**File: `src/hooks/useSolanaRooms.ts`**

Update the `TX_SIMULATION_FAILED` error handling (lines 607-648) to:

1. Show actual simulation logs in the error message when no blocking room exists
2. Detect RPC/network errors and show appropriate message
3. Add retry logic for transient RPC failures

Current confusing behavior:
```typescript
const blockingInfo = blockingRoom 
  ? `Room ${blockingRoom.pda.slice(0, 12)}...`
  : activeRoom
    ? `Active room ${activeRoom.pda.slice(0, 12)}...`
    : 'No blocking/active room detected in state';  // ← Confusing fallback

toast({
  title: "Action not available",
  description: `${blockingInfo}...`,  // ← Shows confusing message
  variant: "destructive",
});
```

Improved behavior:
```typescript
if (!blockingRoom && !activeRoom) {
  // No blocking room - simulation failed for another reason
  // Show the actual simulation error, not a confusing "no room" message
  toast({
    title: "Transaction failed",
    description: "Unable to create room. Please check your connection and try again.",
    variant: "destructive",
  });
} else {
  // Blocking room exists - show resolution option
  // ... existing logic
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/recover-funds/index.ts` | Use `VERIFIER_SECRET_KEY_V2` instead of `VERIFIER_SECRET_KEY` |
| `src/hooks/useSolanaRooms.ts` | Improve `TX_SIMULATION_FAILED` error message when no blocking room exists |

---

## Testing Checklist

1. **Recover Funds**: Click "Recover Funds" on stuck rooms → should either succeed or show meaningful error
2. **Room Creation (Mobile)**: Create room from wallet browser → should work or show meaningful error message
3. **Room Creation (Desktop)**: Create room → should work as before
4. **Existing Settlement**: Verify settle-game still works (already uses V2)
