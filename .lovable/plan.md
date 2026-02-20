

## Bug: "Invalid Room Link" on Free Room Rejoin

### Root Cause

The navigation chain for rejoining a free room in "waiting" status goes through three components, but one of them has no awareness of free rooms:

```text
RoomList "Rejoin" click
  --> /play/free-xxxxxxxx  (PlayRoom.tsx)
  --> PlayRoom sees status="waiting", redirects to /room/free-xxxxxxxx
  --> Room.tsx calls validatePublicKey("free-xxxxxxxx")
  --> FAILS -- not a valid Solana public key
  --> Shows "INVALID ROOM LINK"
```

`PlayRoom.tsx` and `RoomRouter.tsx` both have `if (roomPdaParam.startsWith("free-"))` early-return guards that skip the Solana public key validation. `Room.tsx` does not -- it runs `validatePublicKey()` on every room PDA unconditionally (line 151), which naturally rejects the `free-` prefix synthetic IDs.

### Fix

Add the same `free-` prefix guard to `Room.tsx`. When a free room is detected, fetch its session from the database instead of trying to validate it as a Solana public key. This mirrors the exact pattern already used in `PlayRoom.tsx` and `RoomRouter.tsx`.

---

### Technical Details

**File: `src/pages/Room.tsx`**

In the PDA validation `useEffect` (lines 145-158), add a `free-` prefix check before `validatePublicKey`:

```tsx
useEffect(() => {
  if (!roomPdaParam) {
    setPdaError("No room specified");
    return;
  }

  // Free rooms use synthetic IDs, not Solana public keys
  if (roomPdaParam.startsWith("free-")) {
    setPdaError(null); // Valid free room format
    return;
  }

  const validPda = validatePublicKey(roomPdaParam);
  if (!validPda) {
    setPdaError("Invalid room link");
    console.error("[Room] Invalid PDA param:", roomPdaParam);
  } else {
    setPdaError(null);
  }
}, [roomPdaParam]);
```

Additionally, audit the rest of `Room.tsx` for any other places that assume the PDA is a valid Solana public key (e.g., `new PublicKey(roomPdaParam)`, on-chain account fetches) and wrap those in `!roomPdaParam.startsWith("free-")` guards, using the database session data instead for free rooms.

The `RoomList.tsx` "Rejoin" button (line 450) navigates to `/play/free-xxx`. For waiting free rooms, `PlayRoom.tsx` redirects to `/room/free-xxx`, which is where the fix is needed. No changes to `RoomList.tsx` or `PlayRoom.tsx` are required.

---

### Summary

| File | Change |
|---|---|
| `src/pages/Room.tsx` | Add `free-` prefix guard to skip Solana PDA validation and use DB session data for free rooms |

This is a single-file fix that follows the exact same pattern already established in `PlayRoom.tsx` and `RoomRouter.tsx`.
