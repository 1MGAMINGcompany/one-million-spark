

## Security Hotfix: Mandatory Session Token for Client Forfeit Calls

**File:** `supabase/functions/forfeit-game/index.ts` (ONLY file changed)

### Current Vulnerability (Lines 265-294)
The identity check only runs `if (sessionToken && /^[0-9a-f]{64}$/.test(sessionToken) && !isServiceRoleCall)`. A malicious client can simply omit `x-session-token` and forfeit on behalf of any wallet.

### Patch

Replace lines 265-294 with enforced validation:

```typescript
if (!isServiceRoleCall) {
  // CLIENT CALL: session token is MANDATORY
  if (!sessionToken || !/^[0-9a-f]{64}$/.test(sessionToken)) {
    console.error("[forfeit-game] MISSING_SESSION", { requestId, roomPda });
    return json200({ success: false, error: "MISSING_SESSION" });
  }

  const { data: sessionRow } = await supabase
    .from("player_sessions")
    .select("wallet")
    .eq("session_token", sessionToken)
    .eq("room_pda", roomPda)
    .eq("revoked", false)
    .maybeSingle();

  if (!sessionRow) {
    console.error("[forfeit-game] INVALID_SESSION", { requestId, roomPda });
    return json200({ success: false, error: "INVALID_SESSION" });
  }

  if (sessionRow.wallet !== forfeitingWallet) {
    console.error("[forfeit-game] IDENTITY_MISMATCH", {
      requestId,
      callerWallet: sessionRow.wallet,
      claimedForfeit: forfeitingWallet,
      roomPda,
    });
    await logSettlement(supabase, {
      room_pda: roomPda,
      action: "forfeit",
      success: false,
      forfeiting_wallet: forfeitingWallet,
      error_message: `IDENTITY_MISMATCH: session wallet ${sessionRow.wallet} != body ${forfeitingWallet}`,
    });
    return json200({ success: false, error: "IDENTITY_MISMATCH" });
  }

  console.log("[forfeit-game] Identity verified via session token", {
    requestId,
    wallet: sessionRow.wallet,
  });
}
```

### What Changes
- **Line 265**: Condition flipped from "if token exists, validate" to "if not service role, token is REQUIRED"
- Missing token -> `MISSING_SESSION` error
- Invalid/revoked token -> `INVALID_SESSION` error  
- Token wallet != body wallet -> `IDENTITY_MISMATCH` error (unchanged behavior)
- Service role calls (auto-forfeit from `game-session-get`) bypass entirely (unchanged)

### What Does NOT Change
- 30-second cooldown guard (lines 301-324) untouched
- All on-chain logic untouched
- Settlement logging untouched
- Cancel flow untouched
- No other files modified

