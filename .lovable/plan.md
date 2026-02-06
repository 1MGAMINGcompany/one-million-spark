

# Private Room Sharing — QR Code + Multi-Platform Share Options

## Overview
Add comprehensive sharing capabilities for private rooms: QR codes, WhatsApp, native share, email, and copy link. This is critical since private rooms are hidden from the public room list and can only be joined via direct link.

## File Changes

### 1. `src/lib/invite.ts`

**Change**: Update `buildInviteLink()` to use canonical `/room/{roomPda}` format

```typescript
// BEFORE (line 3-12):
export function buildInviteLink(params: {
  roomId: string;
  cluster?: string;
}) {
  const url = new URL(window.location.origin);
  url.pathname = "/join";
  url.searchParams.set("roomId", params.roomId);
  url.searchParams.set("cluster", params.cluster || "mainnet-beta");
  return url.toString();
}

// AFTER:
export function buildInviteLink(params: {
  roomPda: string;  // Renamed from roomId for clarity
}) {
  const url = new URL(window.location.origin);
  url.pathname = `/room/${params.roomPda}`;
  return url.toString();
}
```

### 2. `src/components/ShareInviteDialog.tsx`

**Changes**:
- Add QR code using `QRCodeSVG` from `qrcode.react`
- Detect wallet in-app browser to hide `mailto:` (blocked in Phantom/Solflare)
- Update prop name from `roomId` to `roomPda`
- Add responsive QR display with label

```text
Dialog Layout:
┌─────────────────────────────────────┐
│        Invite Players               │
│  Share this to invite opponents     │
├─────────────────────────────────────┤
│        ┌─────────────┐              │
│        │   QR Code   │              │
│        │   (120px)   │              │
│        └─────────────┘              │
│   "Show this to a friend to scan"   │
│                                     │
│  ┌───────────────────────────┬───┐  │
│  │ https://1mg.../room/ABC.. │ ⎘ │  │
│  └───────────────────────────┴───┘  │
│                                     │
│  ┌─────────────┐ ┌─────────────┐    │
│  │  📤 Share   │ │  WhatsApp   │    │
│  └─────────────┘ └─────────────┘    │
│  ┌─────────────┐ ┌─────────────┐    │
│  │  Facebook   │ │    Email*   │    │
│  └─────────────┘ └─────────────┘    │
│           *Hidden in wallet browsers│
└─────────────────────────────────────┘
```

Key code additions:
```typescript
import { QRCodeSVG } from 'qrcode.react';
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";

// In component:
const inWalletBrowser = isWalletInAppBrowser();

// QR Code section
<div className="flex flex-col items-center gap-2 py-4">
  <div className="bg-white p-3 rounded-lg">
    <QRCodeSVG 
      value={inviteLink}
      size={120}
      bgColor="#ffffff"
      fgColor="#000000"
    />
  </div>
  <p className="text-xs text-muted-foreground">
    {t("shareInvite.showQrToFriend")}
  </p>
</div>

// Conditionally hide Email button in wallet browsers
{!inWalletBrowser && (
  <Button onClick={handleEmail}>
    <Mail /> Email
  </Button>
)}
```

### 3. `src/pages/Room.tsx`

**Changes**:
- Add state for ShareInviteDialog
- Import ShareInviteDialog component
- Add "Share Invite" button for private room creators when room is open
- Update `roomMode` state type to include `'private'`

Key additions:
```typescript
import { ShareInviteDialog } from "@/components/ShareInviteDialog";

// State (around line 66)
const [showShareDialog, setShowShareDialog] = useState(false);

// Update mode state type (line 84)
const [roomMode, setRoomMode] = useState<'casual' | 'ranked' | 'private'>('casual');

// Detect if private room (after roomModeLoaded)
const isPrivateRoom = roomMode === 'private';

// Mode badge update to show purple for private (around line 976)
{roomMode === 'private' && (
  <span className="... bg-violet-500/20 text-violet-400 border-violet-500/30">
    🟣 Private
  </span>
)}

// Share button for creator of private room when open (after status messages ~line 1155)
{isOpenStatus(status) && isCreator && isPrivateRoom && (
  <Button 
    variant="outline"
    onClick={() => setShowShareDialog(true)}
    className="gap-2"
  >
    <Share2 className="h-4 w-4" />
    Share Invite
  </Button>
)}

// Dialog at bottom (before closing </div>)
<ShareInviteDialog
  open={showShareDialog}
  onOpenChange={setShowShareDialog}
  roomPda={roomPdaParam || ""}
  gameName={gameName}
/>
```

### 4. `src/components/WaitingForOpponentPanel.tsx`

**Changes**:
- Add QR code display
- Add native Share button
- Add optional `gameName` and `isPrivateRoom` props for enhanced sharing

Key additions:
```typescript
import { QRCodeSVG } from 'qrcode.react';
import { Share2 } from 'lucide-react';

// New props
interface WaitingForOpponentPanelProps {
  // ... existing props
  gameName?: string;
  isPrivateRoom?: boolean;
}

// Build invite URL (already uses correct format on line 51-53)
const inviteUrl = roomPda 
  ? `${window.location.origin}/room/${roomPda}`
  : window.location.href;

// Native share handler
const handleShare = async () => {
  if (navigator.share) {
    try {
      await navigator.share({ 
        title: gameName ? `Join my ${gameName} game!` : 'Game Invite',
        url: inviteUrl 
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') handleCopyLink();
    }
  } else {
    handleCopyLink();
  }
};

// QR code section (for private rooms)
{isPrivateRoom && (
  <div className="flex flex-col items-center gap-2 pt-2">
    <div className="bg-white p-2 rounded-lg">
      <QRCodeSVG value={inviteUrl} size={100} bgColor="#ffffff" fgColor="#000000" />
    </div>
    <p className="text-xs text-muted-foreground">Scan to join</p>
  </div>
)}

// Share button (alongside Copy Link)
<Button variant="outline" onClick={handleShare} className="w-full gap-2">
  <Share2 className="h-4 w-4" />
  Share
</Button>
```

## Summary

| File | Change |
|------|--------|
| `src/lib/invite.ts` | Use `/room/{roomPda}` format, rename param to `roomPda` |
| `src/components/ShareInviteDialog.tsx` | Add QR code, wallet browser detection, hide mailto in wallet |
| `src/pages/Room.tsx` | Add Share button for private rooms, integrate dialog |
| `src/components/WaitingForOpponentPanel.tsx` | Add QR code + native share button |

## Final Invite Link Format

```
https://1mgaming.com/room/<ROOM_PDA>
```

Example: `https://1mgaming.com/room/5xK8vN2mPQ...abc123`

## Wallet Browser Compatibility

| Feature | Standard Browser | Wallet In-App Browser |
|---------|-----------------|----------------------|
| QR Code | ✓ | ✓ |
| Copy Link | ✓ | ✓ |
| Native Share | ✓ | ✓ |
| WhatsApp (`wa.me`) | ✓ | ✓ (HTTPS link) |
| Facebook | ✓ | ✓ |
| Email (`mailto:`) | ✓ | Hidden (blocked) |

