
# Comprehensive Fix: Share, Wallet Connect, Game Ready Gate, and Turn Timer

## Executive Summary

Based on thorough code analysis, there are **6 interconnected production issues** requiring fixes across 11 files plus a database migration. This plan addresses all issues with the corrected requirements.

---

## Issues Verified in Codebase

| Issue | File | Problem |
|-------|------|---------|
| Share fails in wallet browsers | `src/lib/invite.ts` lines 76-100 | `safeExternalOpen()` doesn't block non-HTTPS schemes (sms:, mailto:) for wallet browsers |
| Connect Wallet CTA kicks back | `src/components/WalletGateModal.tsx` lines 30-33 | `onClose()` called BEFORE `setVisible(true)` |
| Wallet race condition | `src/components/SolanaProvider.tsx` line 25 | `autoConnect={false}` causes limbo state |
| Missing bothReady gate | `src/hooks/useOpponentTimeoutDetection.ts` | No `bothReady` parameter to gate logic |
| LudoGame isMyTurn mismatch | `src/pages/LudoGame.tsx` line 556 | `isMyTurn: isMyTurnLocal` but `enabled: isActuallyMyTurn` |
| LudoGame missing timeout detection | `src/pages/LudoGame.tsx` | No `useOpponentTimeoutDetection` import or usage |
| Backend timeout dedupe missing | `submit_game_move` RPC | No dedupe for same turn timeout, no current_turn_wallet changed check |

**Good news:** No `whatsapp://` scheme found in codebase - WhatsApp already uses `https://wa.me/` (line 124 in invite.ts).

---

## Part 1: Fix Share Buttons in Wallet Browsers

### File: `src/lib/invite.ts`

**Current Problem (lines 76-100):**
```typescript
function safeExternalOpen(url: string): boolean {
  // Currently uses window.location.href for ALL URLs in wallet browsers
  // But wallet browsers cannot open sms:, mailto:, etc.
}
```

**Changes:**
1. Add URL scheme detection
2. Return `false` for non-HTTPS URLs in wallet browsers
3. This triggers clipboard fallback in ShareInviteDialog

```typescript
function safeExternalOpen(url: string): boolean {
  try {
    const inWalletBrowser = isWalletInAppBrowser();
    const isHttpsUrl = url.startsWith('https://') || url.startsWith('http://');
    
    // Wallet browsers cannot open custom URL schemes (sms:, mailto:)
    // Return false to trigger fallback (copy link + toast)
    if (inWalletBrowser && !isHttpsUrl) {
      console.log("[invite] Wallet browser cannot open custom scheme:", url.slice(0, 30));
      return false;
    }
    
    if (inWalletBrowser) {
      console.log("[invite] Wallet browser - using location.href for:", url.slice(0, 50));
      window.location.href = url;
      return true;
    }
    
    // Regular browser - try window.open first
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      console.log("[invite] Popup blocked - falling back to location.href");
      window.location.href = url;
    }
    return true;
  } catch (e) {
    console.error("[invite] Failed to open URL:", e);
    return false;
  }
}
```

### File: `src/components/ShareInviteDialog.tsx`

**Changes:**
1. Add import for `isWalletInAppBrowser`
2. Update toast messages in handlers to be wallet-browser-specific

```typescript
// Add import at line 30
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";

// Update handleWhatsApp (lines 127-137)
const handleWhatsApp = () => {
  play("ui/click");
  const success = whatsappInvite(inviteLink, gameName, roomInfo);
  if (!success) {
    handleCopy();
    toast({
      title: "Link copied!",
      description: isWalletInAppBrowser() 
        ? "Paste it into WhatsApp / Messages."
        : t("shareInvite.linkCopiedInstead"),
    });
  }
};

// Same pattern for handleSMS (lines 139-149), handleEmail (lines 163-173)
```

---

## Part 2: Fix WalletGateModal CTA (Stop Kick-Back)

### File: `src/components/WalletGateModal.tsx`

**Current Problem (lines 30-33):**
```typescript
const handleConnectWallet = () => {
  onClose();           // ← Closes modal, may navigate away
  setVisible(true);    // ← Too late, user already gone
};
```

**Changes:**
1. Never call `onClose()` before connect flow
2. Auto-close when `connected === true` via useEffect
3. Render OpenInWalletPanel buttons **INSIDE DialogContent** (not as replacement) for mobile regular browsers

```typescript
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, Wallet, Info, Eye } from "lucide-react";
import { 
  buildWalletBrowseDeepLink, 
  getWalletInstallUrl,
  getWalletDisplayName,
  type WalletType 
} from "@/lib/walletDeepLinks";
import phantomIcon from "@/assets/wallets/phantom.svg";
import solflareIcon from "@/assets/wallets/solflare.svg";
import backpackIcon from "@/assets/wallets/backpack.svg";
// ... existing imports

export function WalletGateModal({ isOpen, onClose, title, description }: WalletGateModalProps) {
  const { setVisible } = useWalletModal();
  const { connected } = useWallet();
  const [showHelp, setShowHelp] = useState(false);
  const [attemptedWallet, setAttemptedWallet] = useState<WalletType | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Detect environment
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const inWalletBrowser = typeof window !== 'undefined' && isWalletInAppBrowser();
  const hasInjectedWallet = typeof window !== 'undefined' && 
    !!((window as any).solana || (window as any).phantom?.solana || (window as any).solflare);
  
  // Mobile regular browser (Chrome/Safari) without injected wallet = show deep link options
  const needsOpenInWallet = isMobile && !inWalletBrowser && !hasInjectedWallet;
  
  // Auto-close when wallet connects - THE FIX
  useEffect(() => {
    if (connected && isOpen) {
      onClose();
    }
  }, [connected, isOpen, onClose]);

  const handleConnectWallet = () => {
    if (needsOpenInWallet) {
      // Don't try to open adapter modal - it won't work
      // Deep link buttons are already shown inline below
      return;
    }
    // Open wallet modal - DO NOT call onClose()
    // useEffect will close when connected === true
    setVisible(true);
  };
  
  const handleOpenWallet = (wallet: WalletType) => {
    setAttemptedWallet(wallet);
    const deepLink = buildWalletBrowseDeepLink(wallet, window.location.href);
    window.location.href = deepLink;
  };
  
  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Wallet className="text-primary" size={32} />
            </div>
            <DialogTitle className="text-xl font-cinzel text-center">{title}</DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Standard Connect Wallet Button - hidden for mobile regular browser */}
            {!needsOpenInWallet && (
              <Button onClick={handleConnectWallet} className="w-full" size="lg">
                <Wallet className="mr-2" size={18} />
                Connect Wallet
              </Button>
            )}
            
            {/* Mobile regular browser: show deep link options INSIDE the dialog */}
            {needsOpenInWallet && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  Open this page in your wallet app to connect:
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(['phantom', 'solflare', 'backpack'] as WalletType[]).map((wallet) => (
                    <Button
                      key={wallet}
                      variant="outline"
                      onClick={() => handleOpenWallet(wallet)}
                      className="flex flex-col items-center gap-1.5 h-auto py-3 border-primary/30"
                    >
                      <img 
                        src={{ phantom: phantomIcon, solflare: solflareIcon, backpack: backpackIcon }[wallet]} 
                        alt={getWalletDisplayName(wallet)} 
                        className="h-6 w-6" 
                      />
                      <span className="text-xs font-medium">{getWalletDisplayName(wallet)}</span>
                    </Button>
                  ))}
                </div>
                <Button variant="ghost" onClick={handleCopyLink} className="w-full gap-2">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied!" : "Copy link"}
                </Button>
                {attemptedWallet && (
                  <div className="text-center text-xs text-muted-foreground pt-2 border-t">
                    <p>If nothing happened, install the wallet app:</p>
                    <a href={getWalletInstallUrl(attemptedWallet)} target="_blank" rel="noopener" className="text-primary hover:underline inline-flex items-center gap-1">
                      Install {getWalletDisplayName(attemptedWallet)} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* How to Connect Link */}
            <button onClick={() => setShowHelp(true)} className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary py-2">
              <Info size={14} />
              How to connect & get SOL
            </button>

            {/* Browse Note */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70 pt-2 border-t border-border/30">
              <Eye size={12} />
              <span>You can browse rooms without a wallet.</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <HowToConnectSolModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </>
  );
}
```

---

## Part 3: Fix Wallet Browser Race Condition

### File: `src/components/SolanaProvider.tsx`

**Current Problem (line 25):**
```typescript
autoConnect={false}  // Causes limbo in wallet browsers
```

**Changes:**
```typescript
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";

export function SolanaProvider({ children }: SolanaProviderProps) {
  // ... existing code ...
  
  // Auto-connect in wallet browsers to prevent race condition
  const inWalletBrowser = typeof window !== 'undefined' && isWalletInAppBrowser();

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        autoConnect={inWalletBrowser}  // Enable for wallet browsers only
        onError={onError}
        localStorageKey="1m-gaming-wallet"
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

---

## Part 4: Add Game Ready Gate (Frontend + Backend)

### File: `src/hooks/useOpponentTimeoutDetection.ts`

**Changes:**
1. Add `bothReady?: boolean` parameter to interface
2. Gate ALL logic on `bothReady`

```typescript
interface UseOpponentTimeoutOptions {
  roomPda: string;
  enabled: boolean;
  isMyTurn: boolean;
  turnTimeSeconds: number;
  myWallet: string;
  onOpponentTimeout: (missedCount: number) => void;
  onAutoForfeit?: () => void;
  bothReady?: boolean;  // NEW
}

export function useOpponentTimeoutDetection(options: UseOpponentTimeoutOptions) {
  const { bothReady = true, ...rest } = options;
  
  const checkOpponentTimeout = useCallback(async () => {
    // Gate on bothReady
    if (!enabled || !roomPda || isMyTurn || processingTimeoutRef.current || !bothReady) {
      return;
    }
    // ... existing logic
  }, [enabled, roomPda, isMyTurn, myWallet, turnTimeSeconds, opponentMissedCount, 
      onOpponentTimeout, onAutoForfeit, bothReady]);
  
  useEffect(() => {
    // ... clear interval ...
    if (!enabled || isMyTurn || !roomPda || !bothReady) {
      return;
    }
    // ... polling logic
  }, [enabled, isMyTurn, roomPda, checkOpponentTimeout, bothReady]);
}
```

### Game Pages Updates

**For each game file (ChessGame, CheckersGame, BackgammonGame, DominosGame):**

1. Pass `bothReady` to `useOpponentTimeoutDetection`:
```typescript
const opponentTimeout = useOpponentTimeoutDetection({
  roomPda: roomPda || "",
  enabled: shouldShowTimer && !isActuallyMyTurn && startRoll.isFinalized && rankedGate.bothReady,
  isMyTurn: isActuallyMyTurn,
  turnTimeSeconds: effectiveTurnTime,
  myWallet: address,
  onOpponentTimeout: handleOpponentTimeoutDetected,
  onAutoForfeit: handleOpponentAutoForfeit,
  bothReady: rankedGate.bothReady,  // NEW
});
```

2. Guard `handleTurnTimeout`:
```typescript
const handleTurnTimeout = useCallback((timedOutWalletArg?: string | null) => {
  if (gameOver || !address || !roomPda || !rankedGate.bothReady) return;  // ADD bothReady check
  // ... existing logic
}, [gameOver, address, roomPda, rankedGate.bothReady, /* ... */]);
```

### Backend: Database Migration for `submit_game_move` RPC

**Add game ready validation + timeout dedupe:**

```sql
-- Add after line ~35 in the existing RPC

-- GAME READY GATE
IF v_session.mode IN ('ranked', 'private') THEN
  -- Reject if both players not ready
  IF NOT (
    (v_session.p1_ready = true AND v_session.p2_ready = true) OR
    v_session.start_roll_finalized = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'game_not_ready');
  END IF;
  
  -- Reject if player2 doesn't exist
  IF v_session.player2_wallet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'waiting_for_player2');
  END IF;
END IF;

-- TIMEOUT DEDUPE (for turn_timeout/auto_forfeit)
IF v_move_type IN ('turn_timeout', 'auto_forfeit') THEN
  -- Validate timeout legitimacy
  IF v_session.turn_started_at IS NOT NULL AND v_session.turn_time_seconds > 0 THEN
    IF v_session.turn_started_at + (v_session.turn_time_seconds || ' seconds')::interval > now() THEN
      IF v_session.turn_started_at + ((v_session.turn_time_seconds + 2) || ' seconds')::interval > now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'timeout_too_early');
      END IF;
    END IF;
  END IF;
  
  -- Check if current_turn_wallet already changed (timeout already processed)
  DECLARE
    v_expected_turn_wallet TEXT := p_move_data->>'timedOutWallet';
  BEGIN
    IF v_expected_turn_wallet IS NOT NULL AND v_session.current_turn_wallet IS NOT NULL THEN
      IF v_session.current_turn_wallet != v_expected_turn_wallet THEN
        RETURN jsonb_build_object('success', false, 'error', 'timeout_already_processed');
      END IF;
    END IF;
  END;
  
  -- Check if timeout move already exists for this turn
  DECLARE
    v_existing_timeout RECORD;
  BEGIN
    SELECT * INTO v_existing_timeout
    FROM game_moves
    WHERE room_pda = p_room_pda 
      AND move_data->>'type' IN ('turn_timeout', 'auto_forfeit')
      AND move_data->>'timedOutWallet' = p_move_data->>'timedOutWallet'
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_existing_timeout IS NOT NULL THEN
      -- Check if this is a duplicate (same turn context)
      IF v_existing_timeout.created_at > (now() - interval '10 seconds') THEN
        RETURN jsonb_build_object('success', false, 'error', 'timeout_already_processed');
      END IF;
    END IF;
  END;
END IF;
```

---

## Part 5: Fix LudoGame.tsx

### File: `src/pages/LudoGame.tsx`

**Issue 1: isMyTurn mismatch (line 556)**
```typescript
// BEFORE (BUG)
isMyTurn: isMyTurnLocal,

// AFTER (FIX)
isMyTurn: isActuallyMyTurn,
```

**Issue 2: Missing useOpponentTimeoutDetection**

1. Add import at line 20:
```typescript
import { useOpponentTimeoutDetection } from "@/hooks/useOpponentTimeoutDetection";
```

2. Add handler after line 543:
```typescript
// Handle opponent timeout detection (2/3/4 player Ludo)
const handleOpponentTimeoutDetected = useCallback((missedCount: number) => {
  const timedOutWallet = roomPlayers[currentPlayerIndex];
  if (timedOutWallet && !isSameWallet(timedOutWallet, address)) {
    const newMissedCount = incMissed(roomPda || "", timedOutWallet);
    
    if (newMissedCount >= 3) {
      // Eliminate player
      eliminatePlayer(currentPlayerIndex);
      toast({
        title: t('gameSession.opponentForfeited'),
        description: `Player ${currentPlayerIndex + 1} was eliminated`,
      });
    } else {
      // Skip their turn
      advanceTurn(1);
      toast({
        title: "Opponent missed turn",
        description: `${newMissedCount}/3 missed turns`,
      });
    }
  }
}, [roomPlayers, currentPlayerIndex, address, roomPda, eliminatePlayer, advanceTurn, t]);

const handleOpponentAutoForfeit = useCallback(() => {
  const opponentWallet = roomPlayers[currentPlayerIndex];
  if (opponentWallet) {
    handleOpponentTimeoutDetected(3);
  }
}, [roomPlayers, currentPlayerIndex, handleOpponentTimeoutDetected]);

const opponentTimeout = useOpponentTimeoutDetection({
  roomPda: roomPda || "",
  enabled: shouldShowTimer && !isActuallyMyTurn && startRoll.isFinalized && rankedGate.bothReady,
  isMyTurn: isActuallyMyTurn,
  turnTimeSeconds: effectiveTurnTime,
  myWallet: address,
  onOpponentTimeout: handleOpponentTimeoutDetected,
  onAutoForfeit: handleOpponentAutoForfeit,
  bothReady: rankedGate.bothReady,
});
```

3. Guard handleTurnTimeout (line 488-489):
```typescript
const handleTurnTimeout = useCallback(() => {
  if (gameOver || !address || !roomPda || !isActuallyMyTurn || !rankedGate.bothReady) return;  // ADD bothReady
  // ... existing logic
}, [gameOver, address, roomPda, isActuallyMyTurn, rankedGate.bothReady, /* ... */]);
```

---

## Summary of All File Changes

| File | Changes |
|------|---------|
| `src/lib/invite.ts` | Detect URL schemes, return `false` for non-HTTPS in wallet browsers |
| `src/components/ShareInviteDialog.tsx` | Add wallet browser detection, wallet-specific toast messages |
| `src/components/WalletGateModal.tsx` | Never close before connect; render deep link options INSIDE dialog; auto-close when connected |
| `src/components/SolanaProvider.tsx` | Enable `autoConnect` for wallet in-app browsers only |
| `src/hooks/useOpponentTimeoutDetection.ts` | Add `bothReady` parameter, gate all logic on it |
| `src/pages/ChessGame.tsx` | Pass `bothReady` to timeout detection, gate handleTurnTimeout |
| `src/pages/CheckersGame.tsx` | Pass `bothReady` to timeout detection, gate handleTurnTimeout |
| `src/pages/BackgammonGame.tsx` | Pass `bothReady` to timeout detection, gate handleTurnTimeout |
| `src/pages/DominosGame.tsx` | Pass `bothReady` to timeout detection, gate handleTurnTimeout |
| `src/pages/LudoGame.tsx` | Fix `isMyTurn` mismatch, add `useOpponentTimeoutDetection`, pass `bothReady`, gate handleTurnTimeout |
| Database migration | Update `submit_game_move` RPC: add game ready validation + timeout dedupe |

---

## Acceptance Tests

1. **Mobile Wallet Browser Share**
   - Create private room in Phantom browser
   - Tap WhatsApp → Uses HTTPS wa.me link (already correct)
   - Tap SMS → Copies link + toast "Paste it into WhatsApp / Messages."
   - Tap Email → Copies link + toast

2. **Connect Wallet Buttons**
   - All Connect Wallet CTAs work (no kick-back)
   - Modal closes ONLY after `connected === true`
   - Mobile regular browser shows deep link options INSIDE the dialog

3. **Wallet State Race**
   - Open game in Phantom browser → Auto-connects, no popup
   - Desktop wallet connect → Modal still works normally

4. **Game Ready Gate**
   - Join room from desktop
   - Game does NOT start until both accepted
   - No timeouts submitted if one player hasn't accepted
   - Backend rejects moves/timeouts if `!gameReady` or if timeout already processed

5. **Turn Timer Enforcement**
   - Two devices, private game with 10s timer
   - Only active player's timer counts down
   - Timer expiry → clean turn switch
   - 3 misses → auto-forfeit
   - Small dismissible toast: "Opponent missed turn (1/3)"

6. **Ludo Multiplayer**
   - Timer + timeout works for 2/3/4 players
   - No duplicate timeouts (backend dedupe)
   - Eliminated players are skipped in turn rotation
