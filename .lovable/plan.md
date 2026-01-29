

# Secure game_invites: Session Token Auth + RLS Migration

## Overview

This plan implements secure invite functionality using **existing session tokens** (no new wallet prompts) by:
1. Creating 4 edge functions that validate session tokens from `game_acceptances`
2. Updating the frontend to use edge functions instead of direct DB access
3. Applying RLS deny-all to lock down the table

## Key Insight: Token → Wallet Mapping

The `game_acceptances` table already stores:
- `session_token`: UUID generated after SOL transaction
- `player_wallet`: The wallet that made the transaction
- `session_expires_at`: 4-hour expiry timestamp

**Auth pattern for all invite functions:**
```typescript
// 1. Extract token from Authorization header
const token = req.headers.get("Authorization")?.replace("Bearer ", "");

// 2. Query game_acceptances to get verified wallet
const { data } = await supabase
  .from("game_acceptances")
  .select("player_wallet, session_expires_at")
  .eq("session_token", token)
  .gt("session_expires_at", new Date().toISOString())
  .order("created_at", { ascending: false })
  .limit(1)
  .single();

// 3. Use player_wallet as authedWallet - DO NOT trust client-provided wallet
const authedWallet = data.player_wallet;
```

---

## Phase 1: Store Global Session Token

Currently: `localStorage.setItem(\`session_token_${roomPda}\`, token)` (room-scoped)

**Change:** Also store a global `session_token_latest` for cross-room use:

### File: `src/hooks/useRankedAcceptance.ts`

Add after line 151:
```typescript
localStorage.setItem(`session_token_${roomPda}`, token);
// NEW: Store latest token globally for invite auth
localStorage.setItem("session_token_latest", token);
```

---

## Phase 2: Create 4 Edge Functions

### 2.1 Shared Auth Helper

Each function will include this validation pattern:

```typescript
async function getAuthedWallet(req: Request, supabase: any): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  
  const token = authHeader.replace("Bearer ", "");
  if (!token || token.length < 30) return null;
  
  const { data, error } = await supabase
    .from("game_acceptances")
    .select("player_wallet, session_expires_at")
    .eq("session_token", token)
    .gt("session_expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  
  if (error || !data) return null;
  return data.player_wallet;
}
```

### 2.2 `send-invite` (POST)

**File:** `supabase/functions/send-invite/index.ts`

```typescript
// Request body: { recipientWallet, roomPda, gameType, gameName, stakeSol, turnTimeSeconds, maxPlayers, mode }
// Header: Authorization: Bearer <session_token>

// Logic:
// 1. Get authedWallet from token (this becomes senderWallet - NEVER trust client)
// 2. Validate recipientWallet format (32-44 chars)
// 3. Ensure recipientWallet !== senderWallet
// 4. Insert into game_invites with senderWallet from token
// 5. Return { success: true, inviteId }
```

### 2.3 `list-invites` (POST)

**File:** `supabase/functions/list-invites/index.ts`

```typescript
// Request body: { status?: "pending" | "all", direction?: "incoming" | "outgoing" | "both" }
// Header: Authorization: Bearer <session_token>

// Logic:
// 1. Get authedWallet from token
// 2. Query game_invites WHERE:
//    - For "incoming": recipient_wallet = authedWallet
//    - For "outgoing": sender_wallet = authedWallet
//    - For "both": either matches
// 3. Filter by status if provided
// 4. Return { success: true, invites: [...] }
```

### 2.4 `respond-invite` (POST)

**File:** `supabase/functions/respond-invite/index.ts`

```typescript
// Request body: { inviteId, action: "accept" | "dismiss" }
// Header: Authorization: Bearer <session_token>

// Logic:
// 1. Get authedWallet from token
// 2. Fetch invite by id
// 3. Validate: authedWallet === recipient_wallet
// 4. For "accept": UPDATE status = 'accepted'
// 5. For "dismiss": UPDATE status = 'dismissed' (or DELETE)
// 6. Return { success: true, roomPda: invite.room_pda }
```

### 2.5 `cancel-invite` (POST)

**File:** `supabase/functions/cancel-invite/index.ts`

```typescript
// Request body: { inviteId }
// Header: Authorization: Bearer <session_token>

// Logic:
// 1. Get authedWallet from token
// 2. Fetch invite by id
// 3. Validate: authedWallet === sender_wallet
// 4. DELETE the invite (or UPDATE status = 'cancelled')
// 5. Return { success: true }
```

### 2.6 Update `supabase/config.toml`

Add at end:
```toml
[functions.send-invite]
verify_jwt = false

[functions.list-invites]
verify_jwt = false

[functions.respond-invite]
verify_jwt = false

[functions.cancel-invite]
verify_jwt = false
```

---

## Phase 3: Update Frontend Hook

### File: `src/hooks/useGameInvites.ts`

**Major changes:**
1. Replace all `supabase.from("game_invites")` with `supabase.functions.invoke()`
2. Remove realtime subscription (won't work under RLS deny-all)
3. Add polling fallback (30s when UI visible)
4. Get token from localStorage

```typescript
// NEW: Get session token helper
function getSessionToken(): string | null {
  // Try global token first
  const latest = localStorage.getItem("session_token_latest");
  if (latest) return latest;
  
  // Fallback: find any room-scoped token
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("session_token_") && key !== "session_token_latest") {
      const token = localStorage.getItem(key);
      if (token) return token;
    }
  }
  return null;
}

// NEW: Auth headers helper
function getAuthHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
```

**fetchInvites replacement:**
```typescript
const fetchInvites = useCallback(async () => {
  if (!walletAddress || !enabled) return;
  
  const token = getSessionToken();
  if (!token) {
    console.log("[GameInvites] No session token, skipping fetch");
    setHasToken(false);
    return;
  }
  setHasToken(true);

  setLoading(true);
  try {
    const { data, error } = await supabase.functions.invoke("list-invites", {
      body: { status: "pending", direction: "incoming" },
      headers: getAuthHeaders(token),
    });

    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || "Failed to fetch");

    setInvites(data.invites || []);
    setUnreadCount((data.invites || []).length);
  } catch (err) {
    console.error("[GameInvites] Failed to fetch invites:", err);
  } finally {
    setLoading(false);
  }
}, [walletAddress, enabled]);
```

**sendInvite replacement:**
```typescript
const sendInvite = useCallback(async (
  recipientWallet: string,
  roomInfo: RoomInviteInfo
): Promise<boolean> => {
  const token = getSessionToken();
  if (!token) {
    toast({ title: "Session required", description: "Create or join a game first to send invites", variant: "destructive" });
    return false;
  }

  // ... validation logic stays the same ...

  try {
    const { data, error } = await supabase.functions.invoke("send-invite", {
      body: {
        recipientWallet: trimmedRecipient,
        roomPda: roomInfo.roomPda,
        gameType: roomInfo.gameName || "unknown",
        gameName: roomInfo.gameName,
        stakeSol: roomInfo.stakeSol || 0,
        winnerPayout: roomInfo.winnerPayout || 0,
        turnTimeSeconds: roomInfo.turnTimeSeconds || 60,
        maxPlayers: roomInfo.maxPlayers || 2,
        mode: roomInfo.mode || "private",
      },
      headers: getAuthHeaders(token),
    });

    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || "Failed to send");

    play("ui/notify");
    toast({ title: "Invite sent! 🎉", description: `...` });
    return true;
  } catch (err: any) {
    console.error("[GameInvites] Failed to send invite:", err);
    toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    return false;
  }
}, [toast, play]);
```

**Remove realtime subscription, add polling:**
```typescript
// REMOVE: The entire realtime subscription useEffect (lines 165-196)

// ADD: Polling fallback (30s when visible)
useEffect(() => {
  if (!enabled) return;
  
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      fetchInvites();
    }
  }, 30000);
  
  return () => clearInterval(interval);
}, [enabled, fetchInvites]);
```

**Add new return value:**
```typescript
return {
  invites,
  loading,
  unreadCount,
  hasToken, // NEW: Let UI show "play a game first" message if false
  sendInvite,
  markAsViewed,
  acceptInvite,
  dismissInvite,
  refetch: fetchInvites,
};
```

---

## Phase 4: Apply RLS Migration

**After** edge functions are deployed and frontend is updated:

```sql
-- 1) Ensure RLS is enabled
ALTER TABLE public.game_invites ENABLE ROW LEVEL SECURITY;

-- 2) Drop broken policies
DROP POLICY IF EXISTS "Anyone can create invites" ON public.game_invites;
DROP POLICY IF EXISTS "Recipients can read their invites" ON public.game_invites;
DROP POLICY IF EXISTS "Recipients can update their invites" ON public.game_invites;
DROP POLICY IF EXISTS "Senders can delete their invites" ON public.game_invites;

-- 3) Deny all client access (service role bypasses this)
CREATE POLICY "deny_all_client_access" ON public.game_invites
FOR ALL
TO public
USING (false)
WITH CHECK (false);
```

---

## Phase 5: Update Invites UI

### File: `src/pages/Invites.tsx`

Add message for users without session token:

```typescript
// If no token, show "play first" message instead of invites list
if (!hasToken) {
  return (
    <Card className="...">
      <CardContent className="...">
        <Gamepad2 className="..." />
        <h3>Play your first game to unlock invites</h3>
        <p>Create or join a room to activate your invite inbox.</p>
        <Button onClick={() => navigate("/")}>Browse Games</Button>
      </CardContent>
    </Card>
  );
}
```

---

## Files to Create/Modify

| File | Action | Lines |
|------|--------|-------|
| `supabase/functions/send-invite/index.ts` | Create | ~80 lines |
| `supabase/functions/list-invites/index.ts` | Create | ~60 lines |
| `supabase/functions/respond-invite/index.ts` | Create | ~70 lines |
| `supabase/functions/cancel-invite/index.ts` | Create | ~60 lines |
| `supabase/config.toml` | Modify | Add 4 function configs |
| `src/hooks/useRankedAcceptance.ts` | Modify | Add 1 line for global token |
| `src/hooks/useGameInvites.ts` | Modify | Replace direct DB calls, add polling |
| `src/pages/Invites.tsx` | Modify | Add "no token" UI state |
| Database migration | Apply RLS changes | 3 statements |

---

## Implementation Order

1. Update `useRankedAcceptance.ts` - add global token storage (1 line)
2. Create all 4 edge functions in parallel
3. Update `supabase/config.toml` with function configs
4. Deploy edge functions
5. Update `useGameInvites.ts` - replace direct calls with edge functions
6. Update `Invites.tsx` - add "no token" UI
7. Test that invites work with session token
8. Apply RLS migration SQL

---

## Why This Is Secure

| Attack Vector | Protection |
|---------------|------------|
| Query other users' invites | Token maps to specific wallet, can only see own invites |
| Send invites as another wallet | senderWallet is derived from token, never from client |
| Accept/dismiss others' invites | recipient_wallet must match token's wallet |
| Cancel others' invites | sender_wallet must match token's wallet |
| Direct DB access | RLS deny-all blocks all client queries |
| Expired tokens | session_expires_at is checked on every request |

---

## Why No New Wallet Prompts

| Flow | Auth Method |
|------|-------------|
| Create room | SOL transaction (existing) → mints session token |
| Join room | SOL transaction (existing) → mints session token |
| Send invite | Uses existing session token |
| List invites | Uses existing session token |
| Accept/dismiss | Uses existing session token |

Users who have never played get a friendly "Play your first game to unlock invites" message.

