

# Fix Share Buttons & Dice Roll Sync Issues

## Issues Identified from Test

### Issue 1: WhatsApp Button Leads to "Page Not Found" & App Freeze

**Root Cause:** The WhatsApp share function uses `window.open()` which can behave unexpectedly in wallet in-app browsers (Phantom/Solflare). These browsers have limited external navigation capabilities and may:
- Block the popup/new tab
- Navigate the main window instead of opening a new tab
- Fail silently or trigger navigation to invalid internal routes

**Location:** `src/lib/invite.ts` lines 73-81

```typescript
export function whatsappInvite(link: string, gameName?: string, info?: RoomInviteInfo) {
  const message = info ? buildInviteMessage(info) : ...;
  const text = encodeURIComponent(message);
  window.open(`https://wa.me/?text=${text}`, "_blank");  // <-- Problematic in wallet browsers
}
```

**Solution:**
1. Detect wallet in-app browser and use `window.location.href` assignment instead of `window.open()`
2. Add try/catch error handling with fallback to copy-to-clipboard
3. Show user feedback toast on failure
4. Same fix needed for SMS, Facebook, and Email buttons

---

### Issue 2: Both Devices Show "waiting for player2" at Dice Roll

**Root Cause:** The database logs show `ERROR: waiting for player2` from `compute_start_roll` RPC. This happens because:

1. The `game-session-set-settings` edge function creates the session with `player1_wallet` set but `player2_wallet = null`
2. When Player 2 joins the on-chain room, there's a race condition before `ensure_game_session` updates `player2_wallet`
3. If either player clicks "Roll Dice" before `player2_wallet` is populated, the RPC fails with "waiting for player2"

**Database Function Location:** `supabase/migrations/20260120010112_...sql` line 42-44:
```sql
IF p2 IS NULL THEN
  RAISE EXCEPTION 'waiting for player2';
END IF;
```

**Additional Issue:** The DiceRollStart component shows the raw exception message instead of a user-friendly message.

**Solution:**
1. **DiceRollStart.tsx**: Catch the "waiting for player2" error and display a friendly message like "Waiting for opponent to sync... Please wait." instead of raw error
2. **DiceRollStart.tsx**: Add auto-retry logic when this specific error occurs (opponent hasn't synced yet)
3. **useStartRoll.ts**: Ensure `ensure_game_session` is called before showing dice roll UI
4. **Edge function**: When P2 joins, update `player2_wallet` atomically with session creation

---

## Technical Implementation Plan

### Part 1: Fix Share Buttons (WhatsApp, SMS, Facebook, Email)

**File: `src/lib/invite.ts`**

1. Add wallet browser detection import:
```typescript
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";
```

2. Create safer navigation helper:
```typescript
function safeExternalOpen(url: string): boolean {
  try {
    const inWalletBrowser = isWalletInAppBrowser();
    
    if (inWalletBrowser) {
      // In wallet browsers, use location.href for external links
      window.location.href = url;
      return true;
    }
    
    // Regular browser - use window.open
    const popup = window.open(url, "_blank");
    if (!popup) {
      // Popup blocked - fallback to location
      window.location.href = url;
    }
    return true;
  } catch (e) {
    console.error("[invite] Failed to open URL:", e);
    return false;
  }
}
```

3. Update all share functions to use the helper and return success/failure:
```typescript
export function whatsappInvite(link: string, gameName?: string, info?: RoomInviteInfo): boolean {
  const message = info ? buildInviteMessage(info) : ...;
  const text = encodeURIComponent(message);
  return safeExternalOpen(`https://wa.me/?text=${text}`);
}
```

4. Add Twitter/X share option (commonly used):
```typescript
export function twitterInvite(link: string, gameName?: string): boolean {
  const text = encodeURIComponent(gameName ? `Join my ${gameName} game!` : "Join my game!");
  return safeExternalOpen(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(link)}`);
}
```

**File: `src/components/ShareInviteDialog.tsx`**

1. Add error handling to each share button click:
```typescript
const handleWhatsApp = () => {
  play("ui/click");
  const success = whatsappInvite(inviteLink, gameName, roomInfo);
  if (!success) {
    // Fallback: copy link and show toast
    handleCopy();
    toast({
      title: t("shareInvite.openFailed", "Couldn't open WhatsApp"),
      description: t("shareInvite.linkCopiedInstead", "Link copied to clipboard instead"),
    });
  }
};
```

2. Add close-on-navigate handler for wallet browsers:
```typescript
// For wallet browsers, close dialog immediately when navigating away
const inWalletBrowser = isWalletInAppBrowser();
if (inWalletBrowser) {
  // ... use location.href and close dialog
}
```

---

### Part 2: Fix Dice Roll "waiting for player2" Error

**File: `src/components/DiceRollStart.tsx`**

1. Improve error handling for known RPC errors (around line 263-268):
```typescript
if (rpcError) {
  console.error("[DiceRollStart] RPC error:", rpcError);
  
  // Handle "waiting for player2" gracefully - auto-retry
  if (rpcError.message?.includes("waiting for player2")) {
    setError(null); // Don't show error
    setPhase("waiting");
    // Auto-retry after 2 seconds
    setTimeout(() => {
      console.log("[DiceRollStart] Auto-retrying after player2 sync...");
      handleRoll();
    }, 2000);
    return;
  }
  
  setError(rpcError.message || "Failed to compute roll");
  setPhase("waiting");
  return;
}
```

2. Add a "syncing" state to show friendly message:
```typescript
const [isSyncing, setIsSyncing] = useState(false);

// In render:
{isSyncing && (
  <div className="text-center mb-6 py-3 px-4 rounded-lg bg-amber-500/20 text-amber-400">
    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
    {t("diceRoll.syncingOpponent", "Syncing with opponent... Please wait.")}
  </div>
)}
```

**File: `src/hooks/useStartRoll.ts`**

1. Before showing dice roll UI, verify player2_wallet exists in session:
```typescript
// In checkStartRoll function, add validation:
if (session && !session.player2_wallet) {
  console.log("[useStartRoll] Session exists but player2 not synced yet, waiting...");
  // Don't show dice roll yet - poll until player2 is synced
  return;
}
```

---

### Part 3: Ensure Player 2 Session Sync on Join

**Current Flow (broken):**
1. Creator creates room → `game-session-set-settings` creates session with P1 only
2. P2 joins on-chain → navigates to /play/
3. DiceRollStart calls `compute_start_roll` → FAILS (P2 wallet null in DB)

**Fixed Flow:**
1. Creator creates room → `game-session-set-settings` creates session with P1 only
2. P2 joins on-chain → Room.tsx calls edge function to update P2
3. Both navigate to /play/ → `ensure_game_session` verifies P2 is set
4. DiceRollStart polls until session shows P2 → then enables roll

**File: `src/pages/Room.tsx`**

Add P2 sync call after successful join (in joinRoom success handler):
```typescript
// After successful join, ensure session has P2
const { error: syncErr } = await supabase.rpc("ensure_game_session", {
  p_room_pda: roomPdaParam,
  p_game_type: gameType,
  p_player1_wallet: player1Wallet,
  p_player2_wallet: address, // Joining player
  p_mode: roomMode,
});
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/invite.ts` | Add `safeExternalOpen` helper; update all share functions to handle wallet browser; add error return values |
| `src/components/ShareInviteDialog.tsx` | Add error handling + fallback for each share button; show toast on failure |
| `src/components/DiceRollStart.tsx` | Handle "waiting for player2" error gracefully with auto-retry and friendly message |
| `src/hooks/useStartRoll.ts` | Validate player2_wallet exists before showing dice roll UI |
| `src/pages/Room.tsx` | Call `ensure_game_session` with P2 wallet after successful join |

---

## Expected Results After Fix

1. **WhatsApp/SMS/Email/Facebook buttons**: Work reliably in all browsers including Phantom/Solflare in-app; if open fails, link is copied + toast shown
2. **Dice roll sync**: Shows "Syncing with opponent..." message instead of raw error; auto-retries until P2 synced
3. **Game start**: Both players see correct dice roll UI after P2 is confirmed in database

---

## Additional Improvements (Optional)

1. **Add Twitter/X share button** - Popular platform for crypto/gaming
2. **Add Telegram share button** - Popular in crypto community  
3. **Add "Copy Message" button** - Copy the full formatted message, not just link
4. **Add visual spinner on share buttons** - Show loading state during navigation

