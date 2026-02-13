

# Instant "Opponent Joined" Notification via Realtime Database Subscription

## Current Behavior
When a creator is waiting for an opponent, the app polls on-chain data every **5 seconds** to detect status changes. This means:
- Up to 5 seconds of delay before "Opponent Joined!" appears
- Wallet in-app browsers often miss the Solana WebSocket updates entirely
- No push notification when the app is backgrounded

## What We're Adding

### Layer 1: Instant In-App Notification (Supabase Realtime)

The `game_sessions` table already has realtime enabled (`ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions` exists in migrations). We just need to subscribe to it.

**New hook: `src/hooks/useRoomRealtimeAlert.ts`**

A lightweight hook that:
- Subscribes to `postgres_changes` on `game_sessions` filtered by `room_pda`
- Detects `status_int` changing from 1 (waiting) to 2 (active) -- meaning opponent joined
- Fires a callback immediately (no polling delay)
- Auto-cleans up on unmount

**Integration points** -- add the hook to these pages where creators wait:
- `src/pages/Room.tsx` -- the room lobby where creators wait
- `src/pages/CreateRoom.tsx` -- has an active room banner section
- `src/pages/RoomList.tsx` -- shows active rooms
- `src/components/GlobalActiveRoomBanner.tsx` -- the floating banner

When the realtime event fires, it triggers the same flow that currently happens on poll: sound, toast, browser notification, and navigate to `/play/:pda`.

### Layer 2: Browser Push (Service Worker)

The app already has a PWA manifest (`site.webmanifest`) and `showBrowserNotification()` which uses the Notification API. This already works when the tab is open but not focused. For true background push (app fully closed), a service worker is needed -- but that's a separate, larger effort. The current `showBrowserNotification` with `requireInteraction: true` already covers the "tab open but not focused" case.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useRoomRealtimeAlert.ts` | **New** -- realtime subscription hook |
| `src/pages/Room.tsx` | Add `useRoomRealtimeAlert` for instant opponent detection |
| `src/pages/CreateRoom.tsx` | Add `useRoomRealtimeAlert` to supplement polling |
| `src/pages/RoomList.tsx` | Add `useRoomRealtimeAlert` to supplement polling |
| `src/components/GlobalActiveRoomBanner.tsx` | Add `useRoomRealtimeAlert` to supplement polling |

## Technical Details

### New Hook: `useRoomRealtimeAlert.ts`

```typescript
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseRoomRealtimeAlertOptions {
  roomPda: string | null;
  enabled?: boolean;
  onOpponentJoined: (session: any) => void;
}

export function useRoomRealtimeAlert({
  roomPda,
  enabled = true,
  onOpponentJoined,
}: UseRoomRealtimeAlertOptions) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!roomPda || !enabled) return;
    firedRef.current = false;

    const channel = supabase
      .channel(`room-alert-${roomPda}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_sessions",
          filter: `room_pda=eq.${roomPda}`,
        },
        (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;

          // Detect waiting -> active transition
          if (
            !firedRef.current &&
            oldRow?.status_int === 1 &&
            newRow?.status_int === 2
          ) {
            firedRef.current = true;
            onOpponentJoined(newRow);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomPda, enabled, onOpponentJoined]);
}
```

### Integration in Room.tsx, CreateRoom.tsx, RoomList.tsx, GlobalActiveRoomBanner.tsx

Each page already has "opponent joined" handling (sound + toast + navigate). We add the hook pointing to the same handler, so the realtime event triggers the exact same UX -- just instantly instead of after a 5-second poll cycle.

```typescript
// Example in Room.tsx
useRoomRealtimeAlert({
  roomPda: activeRoom?.pda ?? null,
  enabled: !!activeRoom && isOpenStatus(activeRoom.status),
  onOpponentJoined: () => {
    // Same logic already in the polling handler:
    AudioManager.playPlayerJoined();
    showBrowserNotification("Opponent Joined!", "Your game is ready!");
    toast({ title: "Opponent joined!" });
    navigate(`/play/${activeRoom.pda}`);
  },
});
```

The existing polling continues as a fallback (in case realtime misses an event), but the realtime subscription will fire first in nearly all cases, cutting the notification delay from ~5 seconds to under 500ms.
