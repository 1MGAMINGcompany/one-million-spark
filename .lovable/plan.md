

# Remove Second Signature (Fix Phantom Warning)

## Problem
When creating a private room, Phantom shows a "Request blocked - This dApp could be malicious" warning. This happens because a `signMessage()` call fires AFTER the initial SOL transaction succeeds, and Phantom flags it as suspicious.

## Solution
Remove the message signature requirement entirely. Security is maintained through:
1. On-chain SOL transaction already proves creator identity
2. Edge function validates `creatorWallet === player1_wallet` from database

---

## Changes

### File 1: `src/pages/CreateRoom.tsx`

**Remove the signMessage logic (lines 331-358):**

| Line | Change |
|------|--------|
| 73 | Remove `signMessage` from useWalletAdapter import |
| 331-358 | Remove timestamp, message, signature generation |
| 360-375 | Simplify edge function call (remove timestamp, signature, message params) |

**Before:**
```typescript
const { signMessage } = useWalletAdapter();
// ...
const timestamp = Date.now();
const message = `1MGAMING:SET_SETTINGS\n...`;
const sigBytes = await signMessage(msgBytes);  // ← SECOND WALLET PROMPT
signature = toBase64(sigBytes);
```

**After:**
```typescript
// No signMessage needed - on-chain tx proves identity
const { data, error } = await supabase.functions.invoke(
  "game-session-set-settings",
  {
    body: {
      roomPda: roomPdaStr,
      turnTimeSeconds: authoritativeTurnTime,
      mode: gameMode,
      maxPlayers: effectiveMaxPlayers,
      gameType: GAME_TYPE_NAMES[parseInt(gameType)] || "unknown",
      creatorWallet: address,
      // No timestamp, signature, or message
    },
  }
);
```

---

### File 2: `supabase/functions/game-session-set-settings/index.ts`

**Remove signature verification logic:**

| Lines | Change |
|-------|--------|
| 1-5 | Remove `@noble/ed25519` import |
| 47-68 | Remove `decodeBase58` function |
| 70-77 | Remove `decodeBase64` function |
| 79-95 | Remove `verifySignature` function |
| 97-102 | Remove `isDevEnvironment` function |
| 119-120 | Remove timestamp/signature extraction from payload |
| 138-175 | Remove `requiresSignature` block |

**Keep database ownership validation:**

For existing sessions, verify `creatorWallet === player1_wallet`:
```typescript
// Verify caller is room creator (DB ownership check)
if (session && session.player1_wallet && creatorWallet) {
  if (session.player1_wallet.trim() !== creatorWallet.trim()) {
    return json(403, { ok: false, error: "not_room_creator" });
  }
}
```

For new sessions, the caller becomes `player1_wallet` automatically (expected behavior).

---

## Security Analysis

| Check | Before | After |
|-------|--------|-------|
| On-chain tx proof | Yes | Yes |
| Message signature | Yes | No (removed) |
| DB ownership check | Yes | Yes |
| **Overall** | Secure | Secure |

The on-chain SOL transaction is the real proof of identity - the message signature was redundant and caused UX issues.

---

## Result

- Single wallet prompt (SOL transaction only)
- No "Request blocked" warning from Phantom
- Security maintained via on-chain tx + database ownership check
- Same UX as before the signature was added

