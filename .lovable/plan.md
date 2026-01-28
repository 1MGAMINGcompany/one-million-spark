

# Fix Mobile Share for Private Room Invites in Wallet Browsers

## Problem
When sharing private room invites from wallet in-app browsers (Phantom/Solflare/Backpack), clicking WhatsApp navigates to `https://wa.me/...` via `window.location.href`, which leaves the app context. SMS/Email fail with `ERR_UNKNOWN_URL_SCHEME`.

## Root Cause
The current `safeExternalOpen()` logic (lines 88-92 in invite.ts):
```typescript
if (inWalletBrowser) {
  window.location.href = url;  // ← Navigates AWAY from app
  return true;
}
```

This navigates away to wa.me, facebook.com, etc., breaking the in-app experience.

## Solution
**UI-level control in ShareInviteDialog.tsx** - Don't render or call external share handlers when in wallet browser. Leave `safeExternalOpen` unchanged (it may be reused later for other flows).

---

## File Changes

### `src/components/ShareInviteDialog.tsx`

**Add wallet browser detection and logging:**
```typescript
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";
import { copyInviteMessage } from "@/lib/invite";

// Inside component
const inWalletBrowser = isWalletInAppBrowser();

// Log environment for debugging
console.log("[share] env", { isMobile, inWalletBrowser, hasNativeShare });
```

**Add "Copy message" handler:**
```typescript
const handleCopyMessage = async () => {
  try {
    await copyInviteMessage(roomInfo);
    play("ui/click");
    toast({
      title: "Message copied!",
      description: "Paste it into WhatsApp, Telegram, or any messaging app.",
    });
  } catch {
    toast({
      title: "Failed to copy",
      variant: "destructive",
    });
  }
};
```

**Update native share handler with logging:**
```typescript
const handleNativeShare = async () => {
  try {
    play("ui/click");
    console.log("[share] using navigator.share");
    const success = await shareInvite(inviteLink, gameName, roomInfo);
    if (success) {
      console.log("[share] native share success");
    } else {
      console.log("[share] fallback copy");
      handleCopy();
    }
  } catch {
    console.log("[share] fallback copy (error)");
    handleCopy();
  }
};
```

**Update copy handler toast for wallet browsers:**
```typescript
toast({
  title: inWalletBrowser ? "Link copied!" : t("common.linkCopied"),
  description: inWalletBrowser
    ? "Paste into WhatsApp, Telegram, or any messaging app"
    : t("common.linkCopiedDesc"),
});
```

**Conditional UI rendering (replace share buttons grid):**

When `inWalletBrowser` is true, show simplified UI:
```text
┌─────────────────────────────────────┐
│  [Share invite] (full width)       │  ← navigator.share
│  [Copy link]    (full width)       │  ← clipboard
│  [Copy invite message] (ghost)     │  ← clipboard
├─────────────────────────────────────┤
│  💡 Tap "Share invite" to send     │
│     via WhatsApp, Telegram...      │
└─────────────────────────────────────┘
```

When `inWalletBrowser` is false (desktop/regular mobile), show existing UI:
```text
┌─────────────────────────────────────┐
│  [Share invite] (if mobile)        │
├─────────────────────────────────────┤
│  [WhatsApp]  [SMS]                 │
│  [Telegram]  [Twitter]             │
│  [Facebook]  [Email]               │
├─────────────────────────────────────┤
│  [QR Code] (desktop only)          │
│  [Send to Wallet Input]            │
└─────────────────────────────────────┘
```

---

## Why This Approach is Safe

| Concern | Answer |
|---------|--------|
| Will it break desktop? | No - `inWalletBrowser` is only true in Phantom/Solflare/Backpack mobile webviews |
| Will it break regular mobile browsers? | No - Safari/Chrome mobile don't set `isWalletInAppBrowser()` to true |
| Does it modify safeExternalOpen? | No - left unchanged for future use |
| What about wa.me being HTTPS? | Irrelevant - we don't call `handleWhatsApp()` at all in wallet browsers |

---

## Testing Checklist

| Scenario | Expected Result |
|----------|-----------------|
| Android Phantom browser | "Share invite" opens share sheet OR "Copy link" works. No navigation away |
| Android Solflare browser | Same as above |
| iOS Phantom browser | Same as above |
| Desktop Chrome | WhatsApp/Email/SMS buttons work as before (grid layout) |
| Mobile Safari (non-wallet) | Share sheet and grid buttons work |
| Mobile Chrome (non-wallet) | Share sheet and grid buttons work |

---

## Technical Summary

1. **No changes to `invite.ts`** - `safeExternalOpen` stays as-is
2. **UI-level gating** in `ShareInviteDialog.tsx`:
   - Detect wallet browser with existing `isWalletInAppBrowser()`
   - Show simplified Share + Copy UI when true
   - Show full button grid when false (desktop/regular mobile)
3. **Console logs** for debugging: `[share] env`, `[share] using navigator.share`, `[share] fallback copy`
4. **Wallet-specific toast messages** for better UX

