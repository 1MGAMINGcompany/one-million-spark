

# Mobile-First Game Invites + Open-in-Wallet UX Implementation

## Refined Plan with User's 4 Changes Applied

This plan incorporates the 4 specific changes requested to make the implementation safer and more appropriate for messaging-first markets (India, Philippines, Vietnam, Brazil).

---

## Summary of Changes from Original Plan

| Original | Changed To |
|----------|-----------|
| A4: Polling inside `useGameInvites.ts` globally | Polling **only** inside `Invites.tsx` page, when visible + connected |
| Mobile navbar: Bell icon with badge count | Simple "Invites" text menu item (no badge for launch) |
| Deep link with `encodeURIComponent` in path | Keep encoding but add "Copy link" fallback always; only trigger on tap |
| "Send to wallet" implies notification | Rename to "Restrict to wallet (optional)" + make mobile share primary |

---

## Part A: Mobile Invites Navigation + Invites Page

### A1. Add "Invites" to Mobile Navigation

**File:** `src/components/Navbar.tsx`

Add a simple text menu item (no badge count for launch) that navigates to `/invites`:

```typescript
// Around line 239, after "My Profile" link
{connected && publicKey && (
  <Link
    to="/invites"
    onClick={() => { setIsOpen(false); handleNavClick(); }}
    className="group flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent hover:border-primary/30"
  >
    <Bell size={20} className="text-primary/70 group-hover:text-primary" />
    <span>Invites</span>
  </Link>
)}
```

**Key point:** NO badge logic here to avoid extra realtime subscriptions. Rely on `/invites` page for discovery.

### A2. Create Dedicated /invites Page

**File:** `src/pages/Invites.tsx` (NEW)

Full-page invite list with polling ONLY on this page:

```typescript
// Key features:
// 1. If not connected: show full-screen CTA "Connect wallet to view invites"
// 2. If connected: show pending invites list
// 3. Polling ONLY here: useEffect with 15s interval when page is visible + connected
// 4. Each invite card: game name, stake, turn time, sender (truncated), "Join" button

function Invites() {
  const { connected, publicKey } = useWallet();
  const { invites, loading, refetch } = useGameInvites({
    walletAddress: publicKey?.toBase58(),
    enabled: !!connected && !!publicKey,
  });
  
  // Polling ONLY on this page, ONLY when visible and connected
  useEffect(() => {
    if (!connected || !publicKey) return;
    
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refetch();
      }
    }, 15000);
    
    return () => clearInterval(interval);
  }, [connected, publicKey, refetch]);
  
  // ... render UI
}
```

### A3. Add Route to App.tsx

**File:** `src/App.tsx`

```typescript
import Invites from "./pages/Invites";
// ...
<Route path="/invites" element={<Invites />} />
```

### A4. NO Global Polling in useGameInvites (REMOVED)

The original plan added `setInterval` inside `useGameInvites.ts`. This is **removed** because:
- Hook is used in navbar, invites page, share dialog - would cause 2-3x polling
- Polling only needed on `/invites` page where user actively looks

**File:** `src/hooks/useGameInvites.ts` - NO CHANGES to add global polling

---

## Part B: Open-in-Wallet Bottom Panel on Room Pages

### B1. Create Wallet Deep Link Helper

**File:** `src/lib/walletDeepLinks.ts` (NEW)

```typescript
export type WalletType = 'phantom' | 'solflare' | 'backpack';

/**
 * Build deep link to open a URL inside a wallet's browser.
 * Uses encodeURIComponent for query params (safer than path encoding).
 * 
 * Important: Only trigger on user tap (mobile blocks auto-redirects).
 */
export function buildWalletBrowseDeepLink(
  wallet: WalletType,
  url: string,
  ref?: string
): string {
  const encodedUrl = encodeURIComponent(url);
  const encodedRef = encodeURIComponent(ref || url);
  
  switch (wallet) {
    case 'phantom':
      return `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedRef}`;
    case 'solflare':
      return `https://solflare.com/ul/v1/browse/${encodedUrl}?ref=${encodedRef}`;
    case 'backpack':
      return `https://backpack.app/ul/v1/browse/${encodedUrl}?ref=${encodedRef}`;
  }
}

export function getWalletInstallUrl(wallet: WalletType): string {
  switch (wallet) {
    case 'phantom':
      return 'https://phantom.app/download';
    case 'solflare':
      return 'https://solflare.com/download';
    case 'backpack':
      return 'https://backpack.app/download';
  }
}
```

### B2. Create OpenInWalletPanel Component

**File:** `src/components/OpenInWalletPanel.tsx` (NEW)

Non-blocking bottom panel shown when:
- `isMobileDevice()` AND
- `!isWalletInAppBrowser()` AND
- `!isConnected`

```typescript
function OpenInWalletPanel({ currentUrl, onDismiss }: Props) {
  const [attemptedWallet, setAttemptedWallet] = useState<WalletType | null>(null);
  
  const handleOpenWallet = (wallet: WalletType) => {
    setAttemptedWallet(wallet);
    const deepLink = buildWalletBrowseDeepLink(wallet, currentUrl);
    // Only trigger on tap - this IS the tap handler
    window.location.href = deepLink;
  };
  
  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(currentUrl);
    toast.success("Link copied!");
  };
  
  return (
    <div className="fixed bottom-0 inset-x-0 p-4 bg-card border-t z-50">
      <div className="max-w-md mx-auto space-y-3">
        <h3 className="font-semibold text-lg">Join this game</h3>
        <p className="text-sm text-muted-foreground">
          To play, open this link inside your wallet app.
        </p>
        
        {/* Wallet buttons - each triggers deep link on tap */}
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => handleOpenWallet('phantom')}>
            <img src={phantomIcon} /> Phantom
          </Button>
          <Button onClick={() => handleOpenWallet('solflare')}>
            <img src={solflareIcon} /> Solflare
          </Button>
          <Button onClick={() => handleOpenWallet('backpack')}>
            <img src={backpackIcon} /> Backpack
          </Button>
        </div>
        
        {/* Always show Copy Link fallback */}
        <Button variant="outline" onClick={handleCopyLink} className="w-full">
          <Copy /> Copy link
        </Button>
        
        {/* Show install hint after deep link attempt */}
        {attemptedWallet && (
          <p className="text-xs text-muted-foreground text-center">
            If nothing happened,{" "}
            <a href={getWalletInstallUrl(attemptedWallet)} className="underline">
              install {attemptedWallet}
            </a>{" "}
            or paste the link in your wallet's browser.
          </p>
        )}
        
        <button onClick={onDismiss} className="text-xs text-muted-foreground">
          Not now
        </button>
      </div>
    </div>
  );
}
```

### B3. Integrate Panel into Room.tsx

**File:** `src/pages/Room.tsx`

```typescript
import { OpenInWalletPanel } from "@/components/OpenInWalletPanel";
import { isMobileDevice } from "@/lib/solana-utils";
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";

// Inside Room component:
const [dismissedWalletPanel, setDismissedWalletPanel] = useState(false);

// Conditions for showing panel
const isRegularMobileBrowser = isMobileDevice() && !isWalletInAppBrowser() && !isConnected;
const shouldShowWalletPanel = isRegularMobileBrowser && !dismissedWalletPanel;

// In JSX (before main Card):
{shouldShowWalletPanel && (
  <OpenInWalletPanel
    currentUrl={window.location.href}
    onDismiss={() => setDismissedWalletPanel(true)}
  />
)}
```

### B4. Integrate Panel into RoomRouter.tsx

**File:** `src/pages/RoomRouter.tsx`

Similar logic - show panel early while loading if conditions match.

---

## Part C: Persist Pending Room Destination

### C1. Create usePendingRoute Hook

**File:** `src/hooks/usePendingRoute.ts` (NEW)

```typescript
const PENDING_ROOM_KEY = '1m-pending-room';

export function usePendingRoute() {
  const navigate = useNavigate();
  
  const setPendingRoom = useCallback((roomPda: string) => {
    try {
      localStorage.setItem(PENDING_ROOM_KEY, roomPda);
      console.log("[PendingRoute] Saved:", roomPda.slice(0, 8));
    } catch {}
  }, []);
  
  const consumePendingRoom = useCallback((): string | null => {
    try {
      const room = localStorage.getItem(PENDING_ROOM_KEY);
      if (room) {
        localStorage.removeItem(PENDING_ROOM_KEY);
        console.log("[PendingRoute] Consumed:", room.slice(0, 8));
      }
      return room;
    } catch {
      return null;
    }
  }, []);
  
  // Auto-navigate when connected
  const autoNavigateIfPending = useCallback((connected: boolean) => {
    if (connected) {
      const pending = consumePendingRoom();
      if (pending) {
        navigate(`/room/${pending}`);
      }
    }
  }, [consumePendingRoom, navigate]);
  
  return { setPendingRoom, consumePendingRoom, autoNavigateIfPending };
}
```

### C2. Save Pending Route on Room Page

**File:** `src/pages/Room.tsx`

```typescript
const { setPendingRoom } = usePendingRoute();

useEffect(() => {
  if (!isConnected && roomPdaParam) {
    setPendingRoom(roomPdaParam);
  }
}, [isConnected, roomPdaParam, setPendingRoom]);
```

### C3. Auto-Navigate After Connect

**File:** `src/components/WalletButton.tsx`

Add after successful connection:

```typescript
import { usePendingRoute } from "@/hooks/usePendingRoute";

// Inside WalletButton:
const { autoNavigateIfPending } = usePendingRoute();

useEffect(() => {
  if (connected && publicKey) {
    autoNavigateIfPending(true);
  }
}, [connected, publicKey, autoNavigateIfPending]);
```

---

## Part D: Improved Copy and Messaging

### D1. Rename "Send to Wallet" to "Restrict to Wallet"

**File:** `src/components/SendToWalletInput.tsx`

```typescript
// Line 50-53: Change label
<Label className="text-sm font-medium flex items-center gap-2">
  <User className="h-4 w-4" />
  {t("shareInvite.restrictToWallet", "Restrict to wallet (optional)")}
</Label>

// Line 85-87: Change hint text
<p className="text-xs text-muted-foreground">
  {t("shareInvite.restrictHint", "Only this wallet can join. Share the link to deliver the invite.")}
</p>
```

### D2. Add Mobile Tip to Invite Message

**File:** `src/lib/invite.ts`

```typescript
export function buildInviteMessage(info: RoomInviteInfo): string {
  const lines: string[] = [];
  
  // ... existing content ...
  
  // Add mobile tip at the end
  lines.push('');
  lines.push('📱 On mobile? Open this link inside your wallet app!');
  
  return lines.join('\n');
}
```

---

## Part E: Share UX Improvements (Market Fit)

### E1. Make Native Share Primary on Mobile

**File:** `src/components/ShareInviteDialog.tsx`

On mobile, prioritize `navigator.share()` to leverage WhatsApp/Messenger/Zalo/SMS:

```typescript
const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

// Reorder share buttons for mobile
{isMobile && "share" in navigator && (
  <Button
    variant="default" // Primary styling
    onClick={handleNativeShare}
    className="w-full gap-2 mb-3"
  >
    <Share2 className="h-4 w-4" />
    Share invite
  </Button>
)}

{/* Other buttons as secondary grid below */}
```

### E2. Add QR Code for Desktop-to-Mobile

**File:** `src/components/ShareInviteDialog.tsx`

Already has `qrcode.react` installed. Add QR code section on desktop:

```typescript
import { QRCodeSVG } from 'qrcode.react';

// In dialog content (show on desktop):
{!isMobile && (
  <div className="flex flex-col items-center py-4 border-t">
    <div className="bg-white p-3 rounded-lg">
      <QRCodeSVG value={inviteLink} size={120} />
    </div>
    <p className="text-xs text-muted-foreground mt-2">
      Scan with phone to join
    </p>
  </div>
)}
```

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/Navbar.tsx` | MODIFY | Add simple "Invites" link to mobile menu (no badge) |
| `src/pages/Invites.tsx` | CREATE | Dedicated invites page with polling only here |
| `src/App.tsx` | MODIFY | Add `/invites` route |
| `src/lib/walletDeepLinks.ts` | CREATE | Deep link builder for Phantom/Solflare/Backpack |
| `src/components/OpenInWalletPanel.tsx` | CREATE | Bottom panel for mobile browser users with Copy Link fallback |
| `src/pages/Room.tsx` | MODIFY | Show OpenInWalletPanel + save pending room |
| `src/pages/RoomRouter.tsx` | MODIFY | Show OpenInWalletPanel while loading |
| `src/hooks/usePendingRoute.ts` | CREATE | Persist room PDA across wallet connection |
| `src/components/WalletButton.tsx` | MODIFY | Auto-navigate to pending room after connect |
| `src/components/SendToWalletInput.tsx` | MODIFY | Rename to "Restrict to wallet (optional)" |
| `src/lib/invite.ts` | MODIFY | Add mobile tip to invite message |
| `src/components/ShareInviteDialog.tsx` | MODIFY | Native share as primary on mobile + QR code on desktop |

---

## Acceptance Tests

1. **Desktop creates private chess room** → shares via WhatsApp → Android Chrome opens → sees "Join this game" panel → taps "Open in Solflare" → Solflare browser opens same URL → connect → join works

2. **Same flow for Phantom and Backpack**

3. **Mobile connected user** can access `/invites` from menu and see pending invites; polling keeps it fresh (every 15s while page visible)

4. **Copy no longer implies wallets receive invites** - label says "Restrict to wallet (optional)" and hint explains "Share the link to deliver the invite"

5. **If deep link fails**, user always has "Copy link" fallback + install hint

6. **After connecting in wallet browser**, user is auto-navigated to the room they were trying to join

---

## Technical Notes

### Deep Link Safety

- Only trigger deep links on explicit user tap (no auto-redirect)
- Always provide "Copy link" fallback
- Show install hints after attempted deep link

### Polling Safety

- NEVER add global polling to `useGameInvites`
- Poll only on `/invites` page when visible + connected
- 15s interval is reasonable for background updates

### Market Fit (India/Philippines/Vietnam/Brazil)

- Native share as primary on mobile surfaces WhatsApp/Messenger/Zalo/SMS
- QR code enables desktop→mobile without typing links
- Short, jargon-free copy ("Open in your wallet app")

