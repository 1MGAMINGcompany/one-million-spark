

# Clear Session Button with Unverified Token Refinement

## Overview

Add a "Clear Session" button to the connected wallet UI that:
1. Scans all `session_token_<roomPda>` keys deterministically
2. If a key exists but token is empty: removes it and continues (self-healing)
3. Only returns `unverified` if empty token found twice OR no other rooms to check
4. Calls `game-session-get` with proper Authorization header
5. Shows confirmation dialog with room-specific messaging
6. Provides a "Go to Room List" button for `unverified` state

---

## Files Changed

| File | Lines | Description |
|------|-------|-------------|
| `src/lib/sessionToken.ts` | 103-125 (new) | Add `clearAllSessionTokens()` export |
| `src/components/WalletButton.tsx` | 1-15 (imports) | Add Trash2, useNavigate, AlertDialog, supabase imports |
| `src/components/WalletButton.tsx` | ~122-130 (new state) | Add state for dialog, loading, roomPda, reason |
| `src/components/WalletButton.tsx` | ~135-220 (new handlers) | Add `checkActiveGameState()` with refined logic |
| `src/components/WalletButton.tsx` | ~871 (button row) | Add Trash button after LogOut button |
| `src/components/WalletButton.tsx` | ~894 (before closing) | Add AlertDialog with 3-button footer |

---

## Implementation Details

### 1. Add `clearAllSessionTokens()` to `src/lib/sessionToken.ts`

Add after line 101:

```typescript
/**
 * Clear all session tokens from localStorage.
 * Removes keys starting with "session_token_" and "1mg_session_".
 * 
 * @returns Number of keys removed
 */
export function clearAllSessionTokens(): number {
  const keysToRemove: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    
    if (key.startsWith("session_token_") || key.startsWith("1mg_session_")) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => localStorage.removeItem(key));
  
  return keysToRemove.length;
}
```

---

### 2. Update `src/components/WalletButton.tsx`

#### 2a. Add Imports (lines 1-15)

Update line 8 to add `Trash2`:
```typescript
import { Wallet, LogOut, RefreshCw, Copy, Check, AlertCircle, Loader2, ExternalLink, User, Trash2 } from "lucide-react";
```

Add new imports after line 14:
```typescript
import { useNavigate } from "react-router-dom";
import { clearAllSessionTokens } from "@/lib/sessionToken";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
```

#### 2b. Add State (inside component, after line 121)

```typescript
// State for clear session confirmation dialog
const [showClearConfirm, setShowClearConfirm] = useState(false);
const [clearSessionLoading, setClearSessionLoading] = useState(false);
const [dangerousRoomPda, setDangerousRoomPda] = useState<string | null>(null);
const [dangerousReason, setDangerousReason] = useState<'active' | 'unverified' | null>(null);

const navigate = useNavigate();
```

#### 2c. Add `checkActiveGameState()` with Refined Logic

```typescript
/**
 * Check if user is in a dangerous active game.
 * DOES NOT short-circuit on missing global token.
 * Scans all session_token_<roomPda> keys deterministically.
 * 
 * Refined behavior for empty tokens:
 * - If empty token found: remove the key and continue scanning
 * - Only return 'unverified' if empty found twice OR no other rooms remain
 */
const checkActiveGameState = async (): Promise<{
  isDangerous: boolean;
  roomPda?: string;
  reason?: 'active' | 'unverified';
}> => {
  // Collect all roomPdas from localStorage keys
  const roomPdas: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    
    // Only process session_token_<roomPda> keys (not session_token_latest)
    if (key.startsWith("session_token_") && key !== "session_token_latest") {
      const roomPda = key.replace("session_token_", "");
      if (roomPda && roomPda.length >= 32) {
        roomPdas.push(roomPda);
      }
    }
  }
  
  // If no room tokens found, safe to clear
  if (roomPdas.length === 0) {
    return { isDangerous: false };
  }
  
  let emptyTokenCount = 0;
  let lastEmptyRoomPda: string | null = null;
  let validRoomsChecked = 0;
  
  // Check each room
  for (const roomPda of roomPdas) {
    const key = `session_token_${roomPda}`;
    const token = localStorage.getItem(key) || "";
    
    // If token is empty/missing for this key:
    // 1. Remove the orphan key (self-healing)
    // 2. Track how many empties we've seen
    if (!token) {
      localStorage.removeItem(key);
      emptyTokenCount++;
      lastEmptyRoomPda = roomPda;
      console.warn("[ClearSession] Removed empty token key:", roomPda.slice(0, 8));
      continue; // Continue to check other rooms
    }
    
    validRoomsChecked++;
    
    try {
      // Call game-session-get WITH Authorization header
      const { data, error } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (error || !data?.ok || !data?.session) continue;
      
      const session = data.session;
      const statusInt = session.status_int ?? 1;
      const participantsCount = session.participants?.length ?? 
        (session.player1_wallet && session.player2_wallet ? 2 : session.player1_wallet ? 1 : 0);
      const startRollFinalized = session.start_roll_finalized ?? false;
      
      // DANGEROUS: status_int === 2 AND participantsCount >= 2 AND start_roll_finalized === true
      const isDangerous = statusInt === 2 && participantsCount >= 2 && startRollFinalized;
      
      if (isDangerous) {
        return { isDangerous: true, roomPda, reason: 'active' };
      }
    } catch (e) {
      console.warn("[ClearSession] Failed to check room:", roomPda.slice(0, 8), e);
      // On error, continue checking other rooms
    }
  }
  
  // After scanning all rooms:
  // Return 'unverified' if:
  // 1. Empty token found twice in a row (persistent problem), OR
  // 2. We found empty tokens AND checked no valid rooms (no other rooms to verify)
  if (emptyTokenCount >= 2 || (emptyTokenCount > 0 && validRoomsChecked === 0)) {
    return { 
      isDangerous: true, 
      roomPda: lastEmptyRoomPda || roomPdas[0], 
      reason: 'unverified' 
    };
  }
  
  return { isDangerous: false };
};
```

#### 2d. Add Handler Functions

```typescript
// Execute the clear
const executeClearSession = () => {
  const count = clearAllSessionTokens();
  toast.success(`Session cleared (${count} tokens removed)`);
  navigate("/room-list");
};

// Handle clear session button click
const handleClearSession = async () => {
  setClearSessionLoading(true);
  setDangerousRoomPda(null);
  setDangerousReason(null);
  
  try {
    const { isDangerous, roomPda, reason } = await checkActiveGameState();
    
    if (isDangerous && roomPda) {
      // Show confirmation dialog with room info
      setDangerousRoomPda(roomPda);
      setDangerousReason(reason || 'active');
      setShowClearConfirm(true);
    } else {
      // Clear immediately
      executeClearSession();
    }
  } catch (e) {
    console.error("[ClearSession] Check failed:", e);
    // On error, allow clear anyway (don't block user)
    executeClearSession();
  } finally {
    setClearSessionLoading(false);
  }
};

// Confirmed clear (from dialog)
const handleClearConfirmed = () => {
  setShowClearConfirm(false);
  setDangerousRoomPda(null);
  setDangerousReason(null);
  executeClearSession();
};

// Go to room list (no clearing) - for unverified state
const handleGoToRoomList = () => {
  setShowClearConfirm(false);
  setDangerousRoomPda(null);
  setDangerousReason(null);
  navigate("/room-list");
};
```

#### 2e. Add Trash Button (after line 871, inside button row)

Insert after the LogOut button:

```tsx
<Button
  onClick={handleClearSession}
  variant="ghost"
  size="icon"
  className="h-8 w-8 text-muted-foreground hover:text-foreground"
  title="Clear session tokens"
  disabled={clearSessionLoading}
>
  {clearSessionLoading ? (
    <Loader2 size={14} className="animate-spin" />
  ) : (
    <Trash2 size={14} />
  )}
</Button>
```

#### 2f. Add AlertDialog (after NetworkProofBadge, line ~893)

```tsx
{/* Clear Session Confirmation Dialog */}
<AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
  <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
    <AlertDialogHeader>
      <AlertDialogTitle className="text-amber-500">
        Clear session while in a live match?
      </AlertDialogTitle>
      <AlertDialogDescription>
        {dangerousReason === 'unverified' ? (
          <>
            We couldn't verify this match state. Clearing session may disconnect you and lead to timeout.
            {dangerousRoomPda && (
              <span className="block mt-2 font-mono text-xs text-amber-400">
                Room: {dangerousRoomPda.slice(0, 8)}...
              </span>
            )}
          </>
        ) : (
          <>
            Clearing your session disconnects you. If you don't return, you may time out and lose your stake.
            {dangerousRoomPda && (
              <span className="block mt-2 font-mono text-xs">
                You are currently in room: {dangerousRoomPda.slice(0, 8)}...
              </span>
            )}
          </>
        )}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter className="flex-col sm:flex-row gap-2">
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      {dangerousReason === 'unverified' && (
        <Button 
          variant="outline" 
          onClick={handleGoToRoomList}
        >
          Go to Room List
        </Button>
      )}
      <AlertDialogAction 
        onClick={handleClearConfirmed}
        className="bg-amber-600 hover:bg-amber-700"
      >
        Clear anyway
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Refined Empty Token Logic

```text
For each session_token_<roomPda> key:
  |
  +-- Token is empty/missing?
  |     |
  |     +-- YES:
  |     |     1. Remove the orphan key (localStorage.removeItem)
  |     |     2. Increment emptyTokenCount
  |     |     3. Store roomPda as lastEmptyRoomPda
  |     |     4. CONTINUE to next room (don't return yet)
  |     |
  |     +-- NO (token exists):
  |           1. Call game-session-get with Authorization
  |           2. If active match found -> return { isDangerous: true, reason: 'active' }
  |           3. Otherwise continue
  |
  +-- After all rooms checked:
        |
        +-- emptyTokenCount >= 2?
        |     -> return { isDangerous: true, reason: 'unverified' }
        |
        +-- emptyTokenCount > 0 AND validRoomsChecked === 0?
        |     -> return { isDangerous: true, reason: 'unverified' }
        |
        +-- Otherwise:
              -> return { isDangerous: false }
```

---

## AlertDialog Footer (3 Buttons for Unverified)

| Reason | Buttons |
|--------|---------|
| `active` | Cancel, Clear anyway |
| `unverified` | Cancel, Go to Room List, Clear anyway |

The "Go to Room List" button:
- Only appears when `dangerousReason === 'unverified'`
- Navigates to `/room-list` without clearing any tokens
- Allows user to verify their match state manually

---

## Technical Notes

1. **Self-healing**: Empty token keys are removed during scan (reduces future false positives)
2. **Threshold**: Only warns about unverified state if 2+ empty keys OR no valid rooms exist
3. **Authorization**: All `game-session-get` calls include Bearer token header
4. **No short-circuit**: Scans ALL room keys before deciding safe/dangerous
5. **Three actions for unverified**: Cancel / Go to Room List / Clear anyway
6. **No layout changes**: Only adds a small 8x8 trash icon button

